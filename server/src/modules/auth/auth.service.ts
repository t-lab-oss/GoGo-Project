import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { config } from '../../config';
import { AppError } from '../../lib/app-error';
import { toUserDto, UserModel } from '../users/user.model';
import { RefreshTokenModel } from './refresh-token.model';

// Hash giả để thời gian phản hồi giống nhau dù tên đăng nhập có tồn tại hay không.
const DUMMY_HASH = bcrypt.hashSync('khong-ai-dung-mat-khau-nay', 10);

const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');
const newRawToken = () => randomBytes(32).toString('base64url');
const refreshTtlMs = () => config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

const refreshInvalid = () =>
  new AppError(401, 'REFRESH_INVALID', 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.');

export function signAccessToken(userId: string): string {
  return jwt.sign({}, config.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): string {
  const payload = jwt.verify(token, config.JWT_ACCESS_SECRET);
  if (typeof payload === 'string' || !payload.sub) throw new Error('Bad token');
  return payload.sub;
}

async function issueRefreshToken(userId: string, family: string, userAgent?: string) {
  const raw = newRawToken();
  const doc = await RefreshTokenModel.create({
    userId,
    tokenHash: hashToken(raw),
    family,
    expiresAt: new Date(Date.now() + refreshTtlMs()),
    userAgent: userAgent?.slice(0, 300),
  });
  return { raw, id: doc._id };
}

export async function login(username: string, password: string, userAgent?: string) {
  const user = await UserModel.findOne({ username });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu chưa đúng.');
  }
  user.lastLoginAt = new Date();
  await user.save();

  const refresh = await issueRefreshToken(user._id.toString(), randomUUID(), userAgent);
  return {
    user: toUserDto(user),
    accessToken: signAccessToken(user._id.toString()),
    expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: refresh.raw,
  };
}

/** Xoay refresh token. Dùng lại token cũ thì thu hồi cả chuỗi. */
export async function refresh(rawToken: string | undefined, userAgent?: string) {
  if (!rawToken) throw refreshInvalid();
  const current = await RefreshTokenModel.findOne({ tokenHash: hashToken(rawToken) });
  if (!current) throw refreshInvalid();

  if (current.revokedAt) {
    await RefreshTokenModel.updateMany(
      { family: current.family, revokedAt: null },
      { revokedAt: new Date() },
    );
    throw refreshInvalid();
  }
  if (current.expiresAt.getTime() <= Date.now()) throw refreshInvalid();

  // Thu hồi nguyên tử: chỉ một request thắng khi hai request cùng dùng một token.
  const claimed = await RefreshTokenModel.updateOne(
    { _id: current._id, revokedAt: null },
    { revokedAt: new Date() },
  );
  if (claimed.modifiedCount === 0) throw refreshInvalid();

  const next = await issueRefreshToken(current.userId.toString(), current.family, userAgent);
  await RefreshTokenModel.updateOne({ _id: current._id }, { replacedByTokenId: next.id });

  return {
    accessToken: signAccessToken(current.userId.toString()),
    expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: next.raw,
  };
}

export async function logout(rawToken: string | undefined) {
  if (!rawToken) return;
  const current = await RefreshTokenModel.findOne({ tokenHash: hashToken(rawToken) });
  if (!current) return;
  await RefreshTokenModel.updateMany(
    { family: current.family, revokedAt: null },
    { revokedAt: new Date() },
  );
}
