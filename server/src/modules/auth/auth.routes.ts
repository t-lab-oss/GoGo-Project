import { Router, type Response } from 'express';
import { z } from 'zod';
import { config } from '../../config';
import { loginLimiter } from '../../middlewares/rate-limit.middleware';
import { login, logout, refresh } from './auth.service';

const COOKIE_NAME = 'gg_rt';
const COOKIE_PATH = '/api/sessions';

const loginSchema = z.object({
  username: z.string({ message: 'Nhập tên đăng nhập.' }).trim().toLowerCase().min(1, 'Nhập tên đăng nhập.').max(50),
  password: z.string({ message: 'Nhập mật khẩu.' }).min(1, 'Nhập mật khẩu.').max(72),
});

function setRefreshCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export const sessionsRouter = Router();

// Đăng nhập
sessionsRouter.post('/', loginLimiter, async (req, res) => {
  const body = loginSchema.parse(req.body);
  const result = await login(body.username, body.password, req.header('user-agent'));
  setRefreshCookie(res, result.refreshToken);
  res
    .status(201)
    .json({ user: result.user, accessToken: result.accessToken, expiresIn: result.expiresIn });
});

// Làm mới phiên
sessionsRouter.put('/current', async (req, res) => {
  const result = await refresh(req.cookies?.[COOKIE_NAME], req.header('user-agent'));
  setRefreshCookie(res, result.refreshToken);
  res.json({ accessToken: result.accessToken, expiresIn: result.expiresIn });
});

// Đăng xuất
sessionsRouter.delete('/current', async (req, res) => {
  await logout(req.cookies?.[COOKIE_NAME]);
  res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
  res.status(204).end();
});
