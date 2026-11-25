import { model, Schema, Types } from 'mongoose';

/** Refresh token xoay vòng. Chỉ lưu SHA-256 của token, không lưu token gốc. */
const refreshTokenSchema = new Schema({
  userId: { type: Types.ObjectId, required: true },
  tokenHash: { type: String, required: true, unique: true },
  family: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  replacedByTokenId: { type: Types.ObjectId, default: null },
  userAgent: { type: String },
  createdAt: { type: Date, default: Date.now },
});

refreshTokenSchema.index({ userId: 1, family: 1 });
// TTL: hết hạn thì MongoDB tự xoá
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema, 'refreshTokens');
