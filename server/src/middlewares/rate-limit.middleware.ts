import { rateLimit } from 'express-rate-limit';
import { config } from '../config';
import { AppError } from '../lib/app-error';

/** Đăng nhập: 10 lần / 15 phút theo IP (API Contract mục 14). Tắt khi chạy test. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.NODE_ENV === 'test',
  handler: (_req, _res, next) =>
    next(new AppError(429, 'RATE_LIMITED', 'Bạn thử quá nhiều lần, hãy đợi ít phút rồi thử lại.')),
});
