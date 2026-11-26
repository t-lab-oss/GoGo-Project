import bcrypt from 'bcryptjs';
import mongoose, { type Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { setNow } from '../src/lib/clock';
import { CheckinModel } from '../src/modules/checkins/checkin.model';
import { ClusterModel } from '../src/modules/clusters/cluster.model';
import { ExpenseModel } from '../src/modules/expenses/expense.model';
import { MomentModel } from '../src/modules/moments/moment.model';
import { NotificationModel } from '../src/modules/notifications/notification.model';
import { TripPlaceModel } from '../src/modules/places/trip-place.model';
import { TripModel } from '../src/modules/trips/trip.model';
import { UserModel } from '../src/modules/users/user.model';

let mongod: MongoMemoryServer;
const app = createApp();
const PASSWORD = 'MatKhau-Test-1';

/** Hôm nay (cố định) là 2026-11-23 12:00 giờ Việt Nam = ngày 2/4 của chuyến. */
const NOW_LUNCH = new Date('2026-11-23T05:00:00Z');

let hany: { id: string; token: string };
let outsider: { id: string; token: string };
let tripId: string;
const ids: Record<string, Types.ObjectId> = {};

async function makeUser(username: string, publicId: string) {
  const user = await UserModel.create({
    username,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    publicId,
  });
  const login = await request(app).post('/api/sessions').send({ username, password: PASSWORD });
  return { id: user._id.toString(), oid: user._id, token: login.body.accessToken as string };
}

const get = (path: string, token = hany.token) =>
  request(app).get(`/api${path}`).set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all(
    [
      UserModel,
      TripModel,
      ClusterModel,
      TripPlaceModel,
      CheckinModel,
      ExpenseModel,
      MomentModel,
      NotificationModel,
    ].map((m) => m.init()),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  setNow(NOW_LUNCH);
  await mongoose.connection.dropDatabase();
  await Promise.all(
    [UserModel, TripModel, ClusterModel, TripPlaceModel, CheckinModel, ExpenseModel, MomentModel, NotificationModel].map(
      (m) => m.init(),
    ),
  );

  const h = await makeUser('hany', 'GG-TEST22');
  const t = await makeUser('tiencuto', 'GG-TEST33');
  const o = await makeUser('nguoila', 'GG-TEST44');
  hany = { id: h.id, token: h.token };
  outsider = { id: o.id, token: o.token };

  const trip = await TripModel.create({
    name: 'Phú Quốc',
    destination: 'Phú Quốc',
    startDate: '2026-11-22',
    endDate: '2026-11-25',
    ownerId: h.oid,
    memberIds: [h.oid, t.oid],
  });
  tripId = trip._id.toString();

  const defs = [
    ['breakfast', 'Ăn sáng', '06:00', '09:00', 1],
    ['lunch', 'Ăn trưa', '11:00', '14:00', 2],
    ['dinner', 'Ăn tối', '17:00', '21:00', 3],
    ['activity', 'Đi chơi', '09:00', '17:00', 4],
  ] as const;
  for (const [type, name, startTime, endTime, order] of defs) {
    ids[type] = (await ClusterModel.create({ tripId: trip._id, type, name, startTime, endTime, order }))._id;
  }

  const mk = (clusterType: string, label: string, order: number, extra = {}) =>
    TripPlaceModel.create({
      tripId: trip._id,
      clusterId: ids[clusterType],
      source: 'manual',
      label,
      lat: 10.2,
      lng: 103.9,
      order,
      ...extra,
    });
  ids['q3'] = (await mk('lunch', 'Quán 3', 2, { manualHours: { open: '10:00', close: '14:00' } }))._id;
  await mk('lunch', 'Quán 4', 1);
  await mk('lunch', 'Quán đã ẩn', 3, { isArchived: true });
  ids['sang'] = (await mk('breakfast', 'Bún quậy', 1))._id;

  const checkin = await CheckinModel.create({
    tripId: trip._id,
    clusterId: ids['breakfast'],
    tripPlaceId: ids['sang'],
    placeLabel: 'Bún quậy',
    userId: h.oid,
    dayDate: '2026-11-23',
    takenAt: new Date('2026-11-23T00:15:00Z'),
  });
  await ExpenseModel.create({
    tripId: trip._id,
    checkinId: checkin._id,
    tripPlaceId: ids['sang'],
    dayDate: '2026-11-23',
    amount: 85000,
    enteredBy: h.oid,
  });
  await ExpenseModel.create({
    tripId: trip._id,
    checkinId: new mongoose.Types.ObjectId(),
    tripPlaceId: ids['sang'],
    dayDate: '2026-11-22',
    amount: 140000,
    enteredBy: h.oid,
  });
});

afterEach(() => setNow(null));

describe('GET /api/trips', () => {
  it('không token: 401', async () => {
    const res = await request(app).get('/api/trips');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('trả chuyến của tôi kèm status, dayCount, memberCount', async () => {
    const res = await get('/trips');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      id: tripId,
      name: 'Phú Quốc',
      status: 'ongoing',
      dayCount: 4,
      memberCount: 2,
      coverUrl: null,
    });
  });

  it('người ngoài không thấy chuyến', async () => {
    const res = await get('/trips', outsider.token);
    expect(res.body.items).toEqual([]);
  });

  it('lọc status và limit', async () => {
    const owner = await UserModel.findOne({ username: 'hany' });
    await TripModel.create({
      name: 'Đà Lạt',
      destination: 'Đà Lạt',
      startDate: '2026-12-05',
      endDate: '2026-12-07',
      ownerId: owner!._id,
      memberIds: [owner!._id],
    });
    await TripModel.create({
      name: 'Hà Nội',
      destination: 'Hà Nội',
      startDate: '2026-01-01',
      endDate: '2026-01-03',
      ownerId: owner!._id,
      memberIds: [owner!._id],
    });

    const all = await get('/trips');
    expect(all.body.items.map((t: { name: string }) => t.name)).toEqual(['Đà Lạt', 'Phú Quốc', 'Hà Nội']);

    const ongoing = await get('/trips?status=ongoing&sort=startDate&limit=1');
    expect(ongoing.body.items.map((t: { name: string }) => t.name)).toEqual(['Phú Quốc']);

    const upcoming = await get('/trips?status=upcoming');
    expect(upcoming.body.items.map((t: { status: string }) => t.status)).toEqual(['upcoming']);

    const finished = await get('/trips?status=finished');
    expect(finished.body.items.map((t: { name: string }) => t.name)).toEqual(['Hà Nội']);
  });

  it('query sai: 400 VALIDATION_ERROR', async () => {
    const res = await get('/trips?status=khac');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/trips/:tripId', () => {
  it('trả days, members, totalSpent', async () => {
    const res = await get(`/trips/${tripId}`);
    expect(res.status).toBe(200);
    const trip = res.body.trip;
    expect(trip.days).toEqual([
      { date: '2026-11-22', index: 1 },
      { date: '2026-11-23', index: 2 },
      { date: '2026-11-24', index: 3 },
      { date: '2026-11-25', index: 4 },
    ]);
    expect(trip.members.map((m: { username: string }) => m.username)).toEqual(['hany', 'tiencuto']);
    expect(trip.members[0].passwordHash).toBeUndefined();
    expect(trip.totalSpent).toBe(225000);
    expect(trip).toMatchObject({ tz: 'Asia/Ho_Chi_Minh', currency: 'VND', status: 'ongoing' });
  });

  it('chi tiêu của ngày ngoài khoảng ngày không tính vào tổng', async () => {
    await ExpenseModel.create({
      tripId,
      checkinId: new mongoose.Types.ObjectId(),
      tripPlaceId: ids['sang'],
      dayDate: '2026-11-30',
      amount: 999000,
      enteredBy: hany.id,
    });
    const res = await get(`/trips/${tripId}`);
    expect(res.body.trip.totalSpent).toBe(225000);
  });

  it('người ngoài: 404 TRIP_NOT_FOUND (không lộ chuyến tồn tại)', async () => {
    const res = await get(`/trips/${tripId}`, outsider.token);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TRIP_NOT_FOUND');
  });

  it('ID sai định dạng hoặc không có: 404 TRIP_NOT_FOUND', async () => {
    for (const id of ['abc', new mongoose.Types.ObjectId().toString()]) {
      const res = await get(`/trips/${id}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('TRIP_NOT_FOUND');
    }
  });
});

describe('GET /api/trips/:tripId/clusters', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byType = (items: any[]): Record<string, any> =>
    Object.fromEntries(items.map((c) => [c.type, c]));

  it('không date: sắp theo order, có placeCount (bỏ quán đã ẩn), không có state', async () => {
    const res = await get(`/trips/${tripId}/clusters`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((c: { type: string }) => c.type)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'activity',
    ]);
    const m = byType(res.body.items);
    expect(m['lunch'].placeCount).toBe(2);
    expect(m['breakfast'].placeCount).toBe(1);
    expect(m['dinner'].placeCount).toBe(0);
    expect(m['lunch'].state).toBeUndefined();
    expect(m['lunch'].places).toBeUndefined();
  });

  it('12:00 hôm nay: sáng done, trưa current (chọn cụm bắt đầu muộn nhất), còn lại upcoming', async () => {
    const res = await get(`/trips/${tripId}/clusters?date=2026-11-23`);
    const m = byType(res.body.items);
    expect(m['breakfast'].state).toBe('done');
    expect(m['lunch'].state).toBe('current');
    expect(m['activity'].state).toBe('upcoming');
    expect(m['dinner'].state).toBe('upcoming');
  });

  it('15:00 hôm nay, trưa chưa check-in: chỉ "Đi chơi" chứa giờ nên là current', async () => {
    setNow(new Date('2026-11-23T08:00:00Z'));
    const m = byType((await get(`/trips/${tripId}/clusters?date=2026-11-23`)).body.items);
    expect(m['activity'].state).toBe('current');
    expect(m['lunch'].state).toBe('upcoming');
  });

  it('không cụm nào chứa giờ thì lấy cụm chưa xong sắp tới gần nhất', async () => {
    // 17:30: "Đi chơi" hết lúc 17:00, bữa tối dời sang 19:00 → khoảng trống, gần nhất là bữa tối
    await ClusterModel.updateOne({ _id: ids['activity'] }, { endTime: '17:00' });
    await ClusterModel.updateOne({ _id: ids['dinner'] }, { startTime: '19:00' });
    setNow(new Date('2026-11-23T10:30:00Z'));
    const m = byType((await get(`/trips/${tripId}/clusters?date=2026-11-23`)).body.items);
    expect(m['dinner'].state).toBe('current');
    expect(m['lunch'].state).toBe('upcoming');
    expect(m['activity'].state).toBe('upcoming');
  });

  it('sau mọi cụm (23:00) không có cụm current', async () => {
    setNow(new Date('2026-11-23T16:00:00Z'));
    const res = await get(`/trips/${tripId}/clusters?date=2026-11-23`);
    expect(res.body.items.some((c: { state: string }) => c.state === 'current')).toBe(false);
  });

  it('ngày khác hôm nay: không có current; done theo check-in của ngày đó', async () => {
    const res = await get(`/trips/${tripId}/clusters?date=2026-11-24`);
    expect(res.status).toBe(200);
    expect(res.body.items.every((c: { state: string }) => c.state === 'upcoming')).toBe(true);
  });

  it('ngày ngoài chuyến: 422 DATE_OUT_OF_RANGE', async () => {
    const res = await get(`/trips/${tripId}/clusters?date=2026-12-30`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DATE_OUT_OF_RANGE');
  });

  it('date sai định dạng: 400', async () => {
    const res = await get(`/trips/${tripId}/clusters?date=23/11/2026`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('include=places,checkins nhúng quán (đã sắp theo order) và check-in của ngày', async () => {
    const res = await get(`/trips/${tripId}/clusters?date=2026-11-23&include=places,checkins`);
    const m = byType(res.body.items);
    expect(m['lunch'].places.map((p: { label: string }) => p.label)).toEqual(['Quán 4', 'Quán 3']);
    expect(m['lunch'].places[1].manualHours).toEqual({ open: '10:00', close: '14:00' });
    expect(m['lunch'].places[0].manualHours).toBeNull();
    expect(m['lunch'].checkins).toEqual([]);
    expect(m['breakfast'].checkins).toHaveLength(1);
    expect(m['breakfast'].checkins[0]).toMatchObject({
      placeLabel: 'Bún quậy',
      dayDate: '2026-11-23',
      momentId: null,
      expenseReminder: { skipCount: 0, movedToBell: false },
    });
  });

  it('include=checkins thiếu date: 400', async () => {
    const res = await get(`/trips/${tripId}/clusters?include=checkins`);
    expect(res.status).toBe(400);
  });

  it('include lạ: 400', async () => {
    const res = await get(`/trips/${tripId}/clusters?include=google`);
    expect(res.status).toBe(400);
  });

  it('người ngoài: 404 TRIP_NOT_FOUND', async () => {
    const res = await get(`/trips/${tripId}/clusters`, outsider.token);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TRIP_NOT_FOUND');
  });
});

describe('GET /api/trips/:tripId/places', () => {
  it('trả quán chưa archive của cả chuyến', async () => {
    const res = await get(`/trips/${tripId}/places`);
    expect(res.status).toBe(200);
    const labels = res.body.items.map((p: { label: string }) => p.label).sort();
    expect(labels).toEqual(['Bún quậy', 'Quán 3', 'Quán 4']);
    expect(res.body.items[0]).toMatchObject({ tripId, isArchived: false, source: 'manual' });
  });

  it('lọc theo clusterId, theo order', async () => {
    const res = await get(`/trips/${tripId}/places?clusterId=${ids['lunch']}`);
    expect(res.body.items.map((p: { label: string }) => p.label)).toEqual(['Quán 4', 'Quán 3']);
  });

  it('clusterId sai định dạng: 400', async () => {
    const res = await get(`/trips/${tripId}/places?clusterId=abc`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('người ngoài: 404', async () => {
    const res = await get(`/trips/${tripId}/places`, outsider.token);
    expect(res.status).toBe(404);
  });
});

describe('index', () => {
  it('quán cùng placeId trong cùng cụm bị chặn, quán archive thì không', async () => {
    const base = { tripId, clusterId: ids['lunch'], source: 'link' as const, label: 'X', lat: 1, lng: 1, placeId: 'ChIJ1' };
    await TripPlaceModel.create(base);
    await expect(TripPlaceModel.create(base)).rejects.toThrow(/duplicate key/);
    await expect(TripPlaceModel.create({ ...base, isArchived: true })).resolves.toBeTruthy();
  });

  it('mỗi check-in tối đa một khoản chi; thông báo unique theo (userId, dedupeKey)', async () => {
    const e = await ExpenseModel.findOne({});
    await expect(
      ExpenseModel.create({
        tripId,
        checkinId: e!.checkinId,
        tripPlaceId: ids['sang'],
        dayDate: '2026-11-23',
        amount: 1,
        enteredBy: hany.id,
      }),
    ).rejects.toThrow(/duplicate key/);

    const n = { userId: hany.id, tripId, type: 'rain' as const, dedupeKey: `rain:${tripId}:2026-11-23` };
    await NotificationModel.create(n);
    await expect(NotificationModel.create(n)).rejects.toThrow(/duplicate key/);
  });
});
