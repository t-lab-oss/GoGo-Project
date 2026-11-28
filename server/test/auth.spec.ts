import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { RefreshTokenModel } from '../src/modules/auth/refresh-token.model';
import { UserModel } from '../src/modules/users/user.model';

let mongod: MongoMemoryServer;
const app = createApp();
const PASSWORD = 'MatKhau-Test-1';

const cookieOf = (res: request.Response) =>
  ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? []).find((c) =>
    c.startsWith('gg_rt='),
  );
const tokenFrom = (cookie: string | undefined) => cookie?.split(';')[0] ?? '';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await UserModel.init();
  await RefreshTokenModel.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await UserModel.deleteMany({});
  await RefreshTokenModel.deleteMany({});
  await UserModel.create({
    username: 'hany',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    publicId: 'GG-TEST22',
  });
});

describe('ảnh đại diện /api/users/me/avatar', () => {
  const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const signIn = async () => {
    const res = await request(app).post('/api/sessions').send({ username: 'hany', password: PASSWORD });
    return { Authorization: `Bearer ${res.body.accessToken as string}` };
  };

  it('thêm ảnh rồi gỡ ảnh', async () => {
    const auth = await signIn();
    const put = await request(app).put('/api/users/me/avatar').set(auth).send({ image });
    expect(put.status).toBe(200);
    expect(put.body.user.avatarUrl).toBe(image);
    expect((await request(app).get('/api/users/me').set(auth)).body.user.avatarUrl).toBe(image);

    const del = await request(app).delete('/api/users/me/avatar').set(auth);
    expect(del.status).toBe(200);
    expect(del.body.user.avatarUrl).toBeNull();
  });

  it('không nhận ảnh sai loại, link ngoài hoặc quá lớn', async () => {
    const auth = await signIn();
    for (const bad of [
      'https://example.com/a.jpg',
      'data:image/svg+xml;base64,PHN2Zz4=',
      `data:image/jpeg;base64,/9j/${'A'.repeat(150_000)}`,
    ]) {
      const res = await request(app).put('/api/users/me/avatar').set(auth).send({ image: bad });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('chưa đăng nhập: 401', async () => {
    const res = await request(app).put('/api/users/me/avatar').send({ image });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/sessions', () => {
  it('đăng nhập đúng: 201, có accessToken và cookie gg_rt httpOnly', async () => {
    const res = await request(app).post('/api/sessions').send({ username: 'hany', password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: 'hany', publicId: 'GG-TEST22' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.expiresIn).toBe(900);
    const cookie = cookieOf(res);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/sessions');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('tên đăng nhập không phân biệt hoa thường', async () => {
    const res = await request(app).post('/api/sessions').send({ username: ' HANY ', password: PASSWORD });
    expect(res.status).toBe(201);
  });

  it('sai mật khẩu và sai tên cùng trả INVALID_CREDENTIALS', async () => {
    const wrongPass = await request(app).post('/api/sessions').send({ username: 'hany', password: 'sai-roi-nhe' });
    const wrongUser = await request(app).post('/api/sessions').send({ username: 'khongco', password: PASSWORD });
    for (const res of [wrongPass, wrongUser]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    }
    expect(wrongPass.body.error.message).toBe(wrongUser.body.error.message);
  });

  it('thiếu dữ liệu: 400 VALIDATION_ERROR kèm field', async () => {
    const res = await request(app).post('/api/sessions').send({ username: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain('username');
    expect(fields).toContain('password');
  });
});

describe('GET /api/users/me', () => {
  it('không token: 401 UNAUTHENTICATED', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('có token: trả user', async () => {
    const login = await request(app).post('/api/sessions').send({ username: 'hany', password: PASSWORD });
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('hany');
  });

  it('token rác: 401', async () => {
    const res = await request(app).get('/api/users/me').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/sessions/current (làm mới phiên)', () => {
  it('xoay token: cookie mới khác cookie cũ', async () => {
    const login = await request(app).post('/api/sessions').send({ username: 'hany', password: PASSWORD });
    const first = tokenFrom(cookieOf(login));
    const res = await request(app).put('/api/sessions/current').set('Cookie', first);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    const second = tokenFrom(cookieOf(res));
    expect(second).not.toBe('');
    expect(second).not.toBe(first);
  });

  it('không cookie: 401 REFRESH_INVALID', async () => {
    const res = await request(app).put('/api/sessions/current');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_INVALID');
  });

  it('dùng lại token cũ thì thu hồi cả chuỗi', async () => {
    const login = await request(app).post('/api/sessions').send({ username: 'hany', password: PASSWORD });
    const first = tokenFrom(cookieOf(login));
    const rotated = await request(app).put('/api/sessions/current').set('Cookie', first);
    const second = tokenFrom(cookieOf(rotated));

    const reuse = await request(app).put('/api/sessions/current').set('Cookie', first);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_INVALID');

    const afterReuse = await request(app).put('/api/sessions/current').set('Cookie', second);
    expect(afterReuse.status).toBe(401);
  });
});

describe('DELETE /api/sessions/current (đăng xuất)', () => {
  it('204, xoá cookie và thu hồi token', async () => {
    const login = await request(app).post('/api/sessions').send({ username: 'hany', password: PASSWORD });
    const cookie = tokenFrom(cookieOf(login));
    const out = await request(app).delete('/api/sessions/current').set('Cookie', cookie);
    expect(out.status).toBe(204);
    expect(cookieOf(out)).toContain('gg_rt=;');

    const again = await request(app).put('/api/sessions/current').set('Cookie', cookie);
    expect(again.status).toBe(401);
  });

  it('chưa đăng nhập vẫn 204 (idempotent)', async () => {
    const res = await request(app).delete('/api/sessions/current');
    expect(res.status).toBe(204);
  });
});
