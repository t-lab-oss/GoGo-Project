import { model, Schema, type InferSchemaType } from 'mongoose';
import type { User } from '../../../../projects/shared/src/public-api';

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9_.]{3,20}$/,
    },
    passwordHash: { type: String, required: true },
    publicId: { type: String, required: true, unique: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: { toString(): string } };
export const UserModel = model('User', userSchema, 'users');

export function toUserDto(doc: UserDoc): User {
  return { id: doc._id.toString(), username: doc.username, publicId: doc.publicId };
}
