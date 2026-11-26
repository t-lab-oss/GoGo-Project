import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/app-error';
import { now } from '../../lib/clock';
import { getStorage } from '../../lib/storage';
import { MomentModel } from '../moments/moment.model';
import { objectId, PHOTO_TYPES, photoPaths } from '../moments/photo';

export const uploadsRouter = Router({ mergeParams: true });

/** Signed upload URL của Supabase sống 2 giờ. */
const UPLOAD_URL_TTL_MS = 2 * 60 * 60 * 1000;

const bodySchema = z.object({
  momentIds: z
    .array(objectId('ID ảnh chưa đúng định dạng.'))
    .min(1, 'Cần ít nhất một ảnh.')
    .max(20, 'Mỗi lần tối đa 20 ảnh.'),
  contentType: z.enum(PHOTO_TYPES, { message: 'Chỉ nhận ảnh JPEG hoặc WebP.' }),
});

// Xin chỗ tải ảnh: đường dẫn do server suy ra từ tripId và momentId
uploadsRouter.post('/', async (req, res) => {
  const trip = req.trip!;
  const { momentIds } = bodySchema.parse(req.body);
  const ids = [...new Set(momentIds)];

  // Không cho ghi đè ảnh của khoảnh khắc thuộc người khác hoặc chuyến khác.
  const existing = await MomentModel.find({ _id: { $in: ids } }, { tripId: 1, userId: 1 }).lean();
  if (existing.some((m) => !m.tripId.equals(trip._id) || m.userId.toString() !== req.userId)) {
    throw new AppError(409, 'ID_CONFLICT', 'ID ảnh này đã được dùng cho khoảnh khắc khác.');
  }

  const storage = getStorage();
  const items = await Promise.all(
    ids.map(async (momentId) => {
      const { path, thumbPath } = photoPaths(trip._id.toString(), momentId);
      const [photo, thumb] = await Promise.all([
        storage.createUploadUrl(path),
        storage.createUploadUrl(thumbPath),
      ]);
      return { momentId, photo: { uploadUrl: photo }, thumb: { uploadUrl: thumb } };
    }),
  );
  res.set('Cache-Control', 'no-store');
  res.status(201).json({ items, expiresAt: new Date(now().getTime() + UPLOAD_URL_TTL_MS).toISOString() });
});
