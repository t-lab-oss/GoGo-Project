import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { setNow } from '../src/lib/clock';
import { UserModel } from '../src/modules/users/user.model';

let mongod: MongoMemoryServer;
const app = createApp();
const PASSWORD = 'MatKhau-Test-1';
const CHECKIN_ID = 'a'.repeat(24);

let owner: string;
let friend: { id: string; token: string };

async function makeUser(username: string, publicId: string) {
  const user = await UserModel.create({ username, passwordHash: await bcrypt.hash(PASSWORD, 4), publicId });
  const login = await request(app).post('/api/sessions').send({ username, password: PASSWORD });
  return { id: user._id.toString(), token: login.body.accessToken as string };
}

const call = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, token = owner) =>
  request(app)[method](`/api${path}`).set('Authorization', `Bearer ${token}`);

const newTrip = async () => {
  const res = await call('post', '/trips').send({
    name: 'Đà Lạt',
    destination: 'Đà Lạt',
    startDate: '2026-11-22',
    endDate: '2026-11-24',
  });
  expect(res.status).toBe(201);
  return res.body.trip.id as string;
};

/** Chuyến có một quán đã check-in ngày 23/11. */
async function tripWithCheckin() {
  const tripId = await newTrip();
  const place = await call('post', `/trips/${tripId}/places`).send({ label: 'Quán 4', address: '12 Trần Phú' });
  expect(place.status).toBe(201);
  const checkin = await call('put', `/trips/${tripId}/checkins/${CHECKIN_ID}`).send({
    tripPlaceId: place.body.place.id,
    takenAt: '2026-11-23T05:00:00Z',
  });
  expect(checkin.status).toBe(201);
  return { tripId, placeId: place.body.place.id as string };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  setNow(new Date('2026-11-23T05:00:00Z'));
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  owner = (await makeUser('hany', 'GG-TEST22')).token;
  friend = await makeUser('tiencuto', 'GG-TEST33');
});

afterEach(() => setNow(null));

describe('quản lý chuyến', () => {
  it('tạo chuyến kèm 4 cụm mặc định', async () => {
    const tripId = await newTrip();
    const res = await call('get', `/trips/${tripId}/clusters`);
    expect(res.body.items).toHaveLength(4);
  });

  it('rút ngắn ngày đang có dữ liệu cần xác nhận', async () => {
    const { tripId } = await tripWithCheckin();
    const body = { endDate: '2026-11-22' };
    const blocked = await call('patch', `/trips/${tripId}`).send(body);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('DAYS_HAVE_DATA');
    const ok = await call('patch', `/trips/${tripId}`).send({ ...body, confirmShrink: true });
    expect(ok.status).toBe(200);
    expect(ok.body.trip.dayCount).toBe(1);
  });

  it('mời và xoá thành viên; chỉ chủ chuyến xoá được chuyến', async () => {
    const tripId = await newTrip();
    expect((await call('post', `/trips/${tripId}/members`).send({ identifier: 'tiencuto' })).status).toBe(201);
    const forbidden = await call('delete', `/trips/${tripId}?confirmName=${encodeURIComponent('Đà Lạt')}`, friend.token);
    expect(forbidden.status).toBe(403);
    expect((await call('delete', `/trips/${tripId}/members/${friend.id}`)).status).toBe(204);
    expect((await call('delete', `/trips/${tripId}?confirmName=sai`)).status).toBe(400);
    expect((await call('delete', `/trips/${tripId}?confirmName=${encodeURIComponent('Đà Lạt')}`)).status).toBe(204);
    expect((await call('get', `/trips/${tripId}`)).status).toBe(404);
  });
});

describe('cụm và quán', () => {
  it('thêm, sửa, xoá cụm tự tạo; cụm mặc định được bảo vệ', async () => {
    const tripId = await newTrip();
    const created = await call('post', `/trips/${tripId}/clusters`).send({
      name: 'Cà phê',
      startTime: '15:00',
      endTime: '16:00',
    });
    expect(created.status).toBe(201);
    const id = created.body.cluster.id as string;
    const patched = await call('patch', `/trips/${tripId}/clusters/${id}`).send({ name: 'Cà phê chiều' });
    expect(patched.body.cluster.name).toBe('Cà phê chiều');
    expect((await call('delete', `/trips/${tripId}/clusters/${id}`)).status).toBe(204);

    const list = await call('get', `/trips/${tripId}/clusters`);
    const res = await call('delete', `/trips/${tripId}/clusters/${list.body.items[0].id}`);
    expect(res.body.error.code).toBe('CLUSTER_PROTECTED');
  });

  it('xoá quán đã check-in thì lưu trữ, check-in vẫn còn', async () => {
    const { tripId, placeId } = await tripWithCheckin();
    expect((await call('delete', `/trips/${tripId}/places/${placeId}`)).status).toBe(204);
    expect((await call('get', `/trips/${tripId}/places`)).body.items).toHaveLength(0);
    expect((await call('get', `/trips/${tripId}/checkins`)).body.items).toHaveLength(1);
  });
});

describe('chi tiêu và recap', () => {
  it('nhập khoản chi rồi thấy trong tổng hợp, chi tiết chuyến và recap', async () => {
    const { tripId } = await tripWithCheckin();
    const path = `/trips/${tripId}/checkins/${CHECKIN_ID}/expense`;
    expect((await call('put', path).send({ amount: 50000 })).status).toBe(201);
    const again = await call('put', path).send({ amount: 70000, note: 'ghẹ' });
    expect(again.status).toBe(200);
    expect(again.body.expense).toMatchObject({ amount: 70000, note: 'ghẹ' });

    const list = await call('get', `/trips/${tripId}/checkins?include=expense`);
    expect(list.body.items[0].expense.amount).toBe(70000);

    const byDay = await call('get', `/trips/${tripId}/expenses?groupBy=day`);
    expect(byDay.body).toMatchObject({ total: 70000, missingCount: 0 });
    const byPlace = await call('get', `/trips/${tripId}/expenses?groupBy=place`);
    expect(byPlace.body.places[0]).toMatchObject({ placeLabel: 'Quán 4', total: 70000 });

    expect((await call('get', `/trips/${tripId}`)).body.trip.totalSpent).toBe(70000);
    const recap = await call('get', `/trips/${tripId}/recap`);
    expect(recap.body.stats).toMatchObject({ dayCount: 3, visitedCount: 1, totalSpent: 70000 });
    const day = await call('get', `/trips/${tripId}/recap/days/2026-11-23`);
    expect(day.body.visits[0]).toMatchObject({ label: 'Quán 4', time: '12:00', amount: 70000 });

    expect((await call('delete', path)).status).toBe(204);
    expect((await call('get', path)).body.error.code).toBe('EXPENSE_NOT_FOUND');
  });

  it('người ngoài chuyến không xem được chi tiêu và recap', async () => {
    const { tripId } = await tripWithCheckin();
    for (const path of ['expenses', 'recap', 'checkins']) {
      expect((await call('get', `/trips/${tripId}/${path}`, friend.token)).status).toBe(404);
    }
  });
});
