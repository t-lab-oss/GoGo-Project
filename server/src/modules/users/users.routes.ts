import { Router } from 'express';
import { AppError } from '../../lib/app-error';
import { requireAuth } from '../../middlewares/auth.middleware';
import { toUserDto, UserModel } from './user.model';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, async (req, res) => {
  const user = await UserModel.findById(req.userId);
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập để tiếp tục.');
  res.json({ user: toUserDto(user) });
});
