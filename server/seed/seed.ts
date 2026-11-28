/**
 * Tạo 2 tài khoản dùng trong giai đoạn đầu (chưa có đăng ký) và chuyến mẫu "Phú Quốc".
 *   npm run seed              tạo tài khoản còn thiếu, in mật khẩu một lần
 *   npm run seed -- --reset   đặt lại mật khẩu mới cho cả hai
 * Muốn tự chọn mật khẩu: đặt SEED_PASSWORD_HANY, SEED_PASSWORD_TIENCUTO (8 đến 72 ký tự).
 */
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import mongoose from 'mongoose';
import { config } from '../src/config';
import { RefreshTokenModel } from '../src/modules/auth/refresh-token.model';
import { UserModel } from '../src/modules/users/user.model';
import { seedDemoTrip } from './seed-trips';

const ACCOUNTS = [
  { username: 'hany', envKey: 'SEED_PASSWORD_HANY' },
  { username: 'tiencuto', envKey: 'SEED_PASSWORD_TIENCUTO' },
];

// Bỏ ký tự dễ nhầm: 0 O 1 I L
const ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

const randomString = (alphabet: string, length: number) =>
  Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join('');

async function uniquePublicId(): Promise<string> {
  for (;;) {
    const id = `GG-${randomString(ID_ALPHABET, 6)}`;
    if (!(await UserModel.exists({ publicId: id }))) return id;
  }
}

async function main() {
  const reset = process.argv.includes('--reset');
  await mongoose.connect(config.MONGODB_URI);

  for (const account of ACCOUNTS) {
    const existing = await UserModel.findOne({ username: account.username });
    if (existing && !reset) {
      console.log(`- ${account.username}: đã có (${existing.publicId}), giữ nguyên.`);
      continue;
    }

    const password = process.env[account.envKey] ?? randomString(PASSWORD_ALPHABET, 12);
    if (password.length < 8 || password.length > 72) {
      throw new Error(`${account.envKey} phải dài 8 đến 72 ký tự.`);
    }
    const passwordHash = await bcrypt.hash(password, 10);

    if (existing) {
      existing.passwordHash = passwordHash;
      await existing.save();
      await RefreshTokenModel.deleteMany({ userId: existing._id });
      console.log(`- ${account.username}: đã đặt lại mật khẩu -> ${password}`);
    } else {
      const user = await UserModel.create({
        username: account.username,
        passwordHash,
        publicId: await uniquePublicId(),
      });
      console.log(`- ${account.username}: đã tạo (${user.publicId}), mật khẩu -> ${password}`);
    }
  }

  await seedDemoTrip();

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed lỗi:', err);
  process.exitCode = 1;
});
