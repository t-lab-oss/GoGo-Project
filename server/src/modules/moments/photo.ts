import { z } from 'zod';
import { AppError } from '../../lib/app-error';
import { getStorage } from '../../lib/storage';

/** Giới hạn phía server, rộng hơn mức client nén (ảnh dưới 2 MB, thumbnail dưới 200 KB). */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_THUMB_BYTES = 512 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/webp'] as const;

/** Đường dẫn lưu trữ do server suy ra, client không quyết định (API Contract mục 9). */
export function photoPaths(tripId: string, momentId: string) {
  const base = `trips/${tripId}/moments/${momentId}`;
  return { path: `${base}.jpg`, thumbPath: `${base}.thumb.jpg` };
}

export const photoSchema = z.object({
  width: z.number().int().min(1).max(8000),
  height: z.number().int().min(1).max(8000),
  bytes: z.number().int().min(1).max(MAX_PHOTO_BYTES, 'Ảnh quá lớn, hãy chụp hoặc nén lại.'),
});

export const objectId = (message: string) => z.string({ message }).regex(/^[0-9a-f]{24}$/, message);

export const takenAtSchema = z
  .string({ message: 'Thiếu thời điểm chụp.' })
  .datetime({ offset: true, message: 'Thời điểm chụp chưa hợp lệ.' });

/**
 * Kiểm tra ảnh và thumbnail đã thật sự nằm trong kho, đúng loại và không quá lớn.
 * Trả về dung lượng thật của ảnh.
 */
export async function verifyUploaded(tripId: string, momentId: string) {
  const paths = photoPaths(tripId, momentId);
  const storage = getStorage();
  const [photo, thumb] = await Promise.all([storage.stat(paths.path), storage.stat(paths.thumbPath)]);
  if (!photo || !thumb) {
    throw new AppError(422, 'PHOTO_NOT_FOUND', 'Ảnh chưa được tải lên, hãy bấm thử lại.');
  }
  const typeOk = [photo, thumb].every((f) => (PHOTO_TYPES as readonly string[]).includes(f.contentType));
  if (!typeOk || photo.size > MAX_PHOTO_BYTES || thumb.size > MAX_THUMB_BYTES) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Ảnh tải lên chưa đúng loại hoặc quá lớn, hãy chụp lại.', [
      { field: 'photo', message: 'Chỉ nhận JPEG hoặc WebP, ảnh dưới 3 MB.' },
    ]);
  }
  return { ...paths, bytes: photo.size };
}
