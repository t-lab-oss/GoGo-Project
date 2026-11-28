import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/app-error';
import { requireAuth } from '../../middlewares/auth.middleware';
import { toUserDto, UserModel } from './user.model';

export const usersRouter = Router();

/**
 * Ảnh đại diện lưu thẳng trong tài khoản: client đã thu về ô vuông nhỏ nên không cần kho ảnh,
 * và thẻ <img> hiện được ngay mà không cần link ký hạn.
 */
export const MAX_AVATAR_CHARS = 150_000;

const avatarSchema = z.object({
  image: z
    .string({ message: 'Thiếu ảnh.' })
    .max(MAX_AVATAR_CHARS, 'Ảnh quá lớn, hãy chọn ảnh khác.')
    // "/9j/" là ba byte mở đầu của tệp JPEG khi viết dạng base64.
    .regex(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/, 'Chỉ nhận ảnh JPEG.'),
});

const signedOut = () => new AppError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập để tiếp tục.');

usersRouter.get('/me', requireAuth, async (req, res) => {
  const user = await UserModel.findById(req.userId);
  if (!user) throw signedOut();
  res.json({ user: toUserDto(user) });
});

// Thêm hoặc đổi ảnh đại diện của chính mình
usersRouter.put('/me/avatar', requireAuth, async (req, res) => {
  const { image } = avatarSchema.parse(req.body);
  const user = await UserModel.findByIdAndUpdate(req.userId, { avatar: image }, { returnDocument: 'after' });
  if (!user) throw signedOut();
  res.json({ user: toUserDto(user) });
});

// Gỡ ảnh đại diện
usersRouter.delete('/me/avatar', requireAuth, async (req, res) => {
  const user = await UserModel.findByIdAndUpdate(req.userId, { $unset: { avatar: 1 } }, { returnDocument: 'after' });
  if (!user) throw signedOut();
  res.json({ user: toUserDto(user) });
});
