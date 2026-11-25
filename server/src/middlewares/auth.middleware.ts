import type { RequestHandler } from 'express';
import { AppError } from '../lib/app-error';
import { verifyAccessToken } from '../modules/auth/auth.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập để tiếp tục.');
  try {
    req.userId = verifyAccessToken(token);
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Phiên đăng nhập đã hết hạn.');
  }
  next();
};
