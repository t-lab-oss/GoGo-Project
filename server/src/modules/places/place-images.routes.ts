import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../../config';
import { AppError } from '../../lib/app-error';
import { searchPlaceImages, type ImageSubject } from '../../lib/place-images';

/** Tra cứu chỉ đọc: gợi ý ảnh theo tên món hoặc điểm đến. Không lưu gì. */
export function imageSearchRouter(subject: ImageSubject, what: string, maxLength: number): Router {
  const router = Router({ mergeParams: true });

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
      .string(`Hãy nhập ${what}.`)
      .trim()
      .min(2, `Cần ít nhất 2 ký tự cho ${what}.`)
      .max(maxLength, `Tối đa ${maxLength} ký tự cho ${what}.`),
  });

  router.get('/', limiter, async (req, res) => {
    const { q } = querySchema.parse(req.query);
    const items = await searchPlaceImages(q, subject);
    res.set('Cache-Control', 'no-store').json({ items });
  });
  return router;
}

export const placeImagesRouter = imageSearchRouter('dish', 'tên món', 60);
/** Không gắn với chuyến nào vì dùng được ngay lúc đang tạo chuyến. */
export const destinationImagesRouter = imageSearchRouter('destination', 'điểm đến', 80);
