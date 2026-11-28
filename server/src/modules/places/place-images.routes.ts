import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../../config';
import { AppError } from '../../lib/app-error';
import { searchPlaceImages } from '../../lib/place-images';

export const placeImagesRouter = Router({ mergeParams: true });

/** 20 lần / phút theo người dùng. Tắt khi chạy test. */
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? 'anonymous',
  skip: () => config.NODE_ENV === 'test',
  handler: (_req, _res, next) =>
    next(new AppError(429, 'RATE_LIMITED', 'Bạn tìm ảnh hơi nhanh, hãy đợi một chút rồi thử lại.')),
});

const querySchema = z.object({
  q: z
    .string('Hãy nhập tên món.')
    .trim()
    .min(2, 'Tên món cần ít nhất 2 ký tự.')
    .max(60, 'Tên món tối đa 60 ký tự.'),
});

// Tra cứu chỉ đọc: gợi ý ảnh minh hoạ theo tên món. Không lưu gì.
placeImagesRouter.get('/', limiter, async (req, res) => {
  const { q } = querySchema.parse(req.query);
  const items = await searchPlaceImages(q);
  res.set('Cache-Control', 'no-store').json({ items });
});
