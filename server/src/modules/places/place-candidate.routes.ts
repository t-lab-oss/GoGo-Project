import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../../config';
import { AppError } from '../../lib/app-error';
import { parseAllowedMapsUrl, resolveMapsLink } from '../../lib/maps-url';

export const placeCandidateRouter = Router({ mergeParams: true });

/** 30 lần / phút theo người dùng (API Contract mục 14). Tắt khi chạy test. */
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? 'anonymous',
  skip: () => config.NODE_ENV === 'test',
  handler: (_req, _res, next) =>
    next(new AppError(429, 'RATE_LIMITED', 'Bạn dán link hơi nhanh, hãy đợi một chút rồi thử lại.')),
});

const querySchema = z.object({
  url: z.string().trim().min(1, 'Hãy dán link Google Maps.').max(2000, 'Link quá dài.'),
});

// Tra cứu chỉ đọc: đổi link thành tên và toạ độ để xem trước. Không lưu gì, không gọi API bản đồ.
placeCandidateRouter.get('/', limiter, async (req, res) => {
  const { url } = querySchema.parse(req.query);
  const mapsUrl = parseAllowedMapsUrl(url).toString();
  const place = await resolveMapsLink(url);
  res.set('Cache-Control', 'no-store').json({
    candidate: {
      source: 'link',
      label: place.label,
      lat: place.lat,
      lng: place.lng,
      mapsUrl,
      matchedBy: 'url',
    },
  });
});
