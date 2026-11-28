import bcrypt from 'bcryptjs';
import mongoose, { type Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { setNow } from '../src/lib/clock';
import { setStorage, type PhotoStorage, type StoredFile } from '../src/lib/storage';
import { CheckinModel } from '../src/modules/checkins/checkin.model';
import { ExpenseModel } from '../src/modules/expenses/expense.model';
import { NotificationModel } from '../src/modules/notifications/notification.model';
import { ClusterModel } from '../src/modules/clusters/cluster.model';
import { MomentModel } from '../src/modules/moments/moment.model';
import { TripPlaceModel } from '../src/modules/places/trip-place.model';
import { TripModel } from '../src/modules/trips/trip.model';
import { UserModel } from '../src/modules/users/user.model';

let mongod: MongoMemoryServer;
const app = createApp();
const PASSWORD = 'MatKhau-Test-1';
const NOW = new Date('2026-11-23T05:00:00Z');
const TAKEN = '2026-11-23T05:00:00.000Z';

/** Kho ảnh giả: chỉ nhớ những file "đã tải lên". */
class FakeStorage implements PhotoStorage {
  files = new Map<string, StoredFile>();
  signedUploads: string[] = [];
  async createUploadUrl(path: string) {
    this.signedUploads.push(path);
    return `https://storage.test/upload/${path}?token=t`;
  }
  async stat(path: string) {
    return this.files.get(path) ?? null;
  }
  async createDownloadUrls(paths: string[]) {
    return new Map(paths.filter((p) => this.files.has(p)).map((p) => [p, `https://storage.test/view/${p}`]));
  }
  async remove(paths: string[]) {
    for (const p of paths) this.files.delete(p);
  }
  put(trip: string, momentId: string, photo: Partial<StoredFile> = {}, thumb: Partial<StoredFile> = {}) {
    const base = `trips/${trip}/moments/${momentId}`;
    this.files.set(`${base}.jpg`, { size: 400_000, contentType: 'image/jpeg', ...photo });
    this.files.set(`${base}.thumb.jpg`, { size: 40_000, contentType: 'image/jpeg', ...thumb });
  }
}

let storage: FakeStorage;
let hany: string;
let friend: string;
let outsider: string;
let hanyId: Types.ObjectId;
let tripId: string;
let otherTripId: string;
let placeId: string;
let place2Id: string;
let otherPlaceId: string;
let clusterId: Types.ObjectId;

async function makeUser(username: string, publicId: string) {
  const user = await UserModel.create({ username, passwordHash: await bcrypt.hash(PASSWORD, 4), publicId });
  const login = await request(app).post('/api/sessions').send({ username, password: PASSWORD });
  return { oid: user._id, token: login.body.accessToken as string };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const hex = (n: number) => n.toString(16).padStart(24, '0');
const C1 = hex(0xc1);
const C2 = hex(0xc2);
const M1 = hex(0xa1);
const M2 = hex(0xa2);
const photo = { width: 1080, height: 1080, bytes: 400_000 };

const putCheckin = (id: string, body: object, token = hany, trip = tripId) =>
  request(app).put(`/api/trips/${trip}/checkins/${id}`).set(auth(token)).send(body);
const putMoment = (id: string, body: object, token = hany, trip = tripId) =>
  request(app).put(`/api/trips/${trip}/moments/${id}`).set(auth(token)).send(body);
const upload = (body: object, token = hany, trip = tripId) =>
  request(app).post(`/api/trips/${trip}/uploads`).set(auth(token)).send(body);
const listMoments = (query: object = {}, token = hany) =>
  request(app).get(`/api/trips/${tripId}/moments`).query(query).set(auth(token));
const base = (over: object = {}) => ({ tripPlaceId: placeId, takenAt: TAKEN, ...over });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  setStorage(null);
  setNow(null);
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  setNow(NOW);
  storage = new FakeStorage();
  setStorage(storage);
  await mongoose.connection.dropDatabase();
  await Promise.all([UserModel, TripModel, ClusterModel, TripPlaceModel, CheckinModel, MomentModel, ExpenseModel, NotificationModel].map((m) => m.init()));

  const h = await makeUser('hany', 'GG-TEST22');
  const f = await makeUser('tiencuto', 'GG-TEST33');
  const o = await makeUser('nguoila', 'GG-TEST44');
  hany = h.token;
  hanyId = h.oid;
  friend = f.token;
  outsider = o.token;

  const common = { destination: 'Phú Quốc', startDate: '2026-11-22', endDate: '2026-11-25', tz: 'Asia/Ho_Chi_Minh' };
  const trip = await TripModel.create({ ...common, name: 'Phú Quốc', ownerId: h.oid, memberIds: [h.oid, f.oid] });
  const other = await TripModel.create({ ...common, name: 'Khác', ownerId: h.oid, memberIds: [h.oid] });
  tripId = trip._id.toString();
  otherTripId = other._id.toString();

  const cluster = await ClusterModel.create({ tripId: trip._id, name: 'Ăn trưa', type: 'lunch', startTime: '11:00', endTime: '14:00', order: 1 });
  const otherCluster = await ClusterModel.create({ tripId: other._id, name: 'Ăn trưa', type: 'lunch', startTime: '11:00', endTime: '14:00', order: 1 });
  clusterId = cluster._id;
  const makePlace = (t: Types.ObjectId, c: Types.ObjectId, label: string) =>
    TripPlaceModel.create({ tripId: t, clusterId: c, source: 'manual', label, address: 'x', order: 1, addedBy: h.oid });
  placeId = (await makePlace(trip._id, cluster._id, 'Quán 3'))._id.toString();
  place2Id = (await makePlace(trip._id, cluster._id, 'Quán 4'))._id.toString();
  otherPlaceId = (await makePlace(other._id, otherCluster._id, 'Quán lạ'))._id.toString();
});

const url = (path = '') => `/api/trips/${tripId}/checkins${path}`;
const putExpense = (id: string, body: object, token = hany) =>
  request(app).put(url(`/${id}/expense`)).set(auth(token)).send(body);
const skip = (id: string, skipCount: number, token = hany) =>
  request(app).patch(url(`/${id}`)).set(auth(token)).send({ expenseReminder: { skipCount } });
const list = (query: object = {}) => request(app).get(url()).query(query).set(auth(hany));
const summary = (query: object = {}) =>
  request(app).get(`/api/trips/${tripId}/expenses`).query(query).set(auth(hany));
const reminder = () => list({ expenseStatus: 'missing', reminder: 'active', sort: '-takenAt', limit: 1 });

/** Hai check-in trong ngày: C1 sớm hơn C2. */
async function twoCheckins() {
  await putCheckin(C1, base({ takenAt: '2026-11-23T04:00:00.000Z' })).expect(201);
  await putCheckin(C2, base({ tripPlaceId: place2Id })).expect(201);
}

describe('chi tiêu của check-in', () => {
  it('nhập mới 201, sửa 200, đọc và xoá được; tổng chuyến cập nhật theo', async () => {
    await twoCheckins();
    const created = await putExpense(C1, { amount: 85000, note: '2 tô' });
    expect(created.status).toBe(201);
    expect(created.body.expense).toMatchObject({ checkinId: C1, amount: 85000, note: '2 tô' });
    const edited = await putExpense(C1, { amount: 90000 }, friend);
    expect(edited.status).toBe(200);
    expect(edited.body.expense).toMatchObject({ amount: 90000, note: '' });
    expect(await ExpenseModel.countDocuments()).toBe(1);

    const trip = await request(app).get(`/api/trips/${tripId}`).set(auth(hany));
    expect(trip.body.trip.totalSpent).toBe(90000);

    await request(app).delete(url(`/${C1}/expense`)).set(auth(hany)).expect(204);
    const gone = await request(app).get(url(`/${C1}/expense`)).set(auth(hany));
    expect(gone.status).toBe(404);
    expect(gone.body.error.code).toBe('EXPENSE_NOT_FOUND');
  });

  it('hai lần nhập song song chỉ tạo một khoản', async () => {
    await twoCheckins();
    const [a, b] = await Promise.all([putExpense(C1, { amount: 1000 }), putExpense(C1, { amount: 2000 })]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await ExpenseModel.countDocuments()).toBe(1);
  });

  it('số tiền sai 400, check-in lạ 404, người ngoài 404', async () => {
    await twoCheckins();
    for (const amount of [-1, 1.5, 1_000_000_001]) {
      expect((await putExpense(C1, { amount })).status).toBe(400);
    }
    expect((await putExpense(hex(0xdead), { amount: 1 })).body.error.code).toBe('CHECKIN_NOT_FOUND');
    expect((await putExpense(C1, { amount: 1 }, outsider)).body.error.code).toBe('TRIP_NOT_FOUND');
  });
});

describe('nhắc nhập tiền', () => {
  it('lấy check-in mới nhất chưa nhập tiền', async () => {
    await twoCheckins();
    expect((await reminder()).body.items.map((c: { id: string }) => c.id)).toEqual([C2]);
    await putExpense(C2, { amount: 5000 });
    expect((await reminder()).body.items.map((c: { id: string }) => c.id)).toEqual([C1]);
    const entered = await list({ expenseStatus: 'entered', include: 'expense' });
    expect(entered.body.items[0].expense.amount).toBe(5000);
  });

  it('bỏ qua là giá trị tuyệt đối; lần 2 chuyển vào chuông và tạo đúng một thông báo', async () => {
    await twoCheckins();
    const first = await skip(C2, 1);
    expect(first.body.checkin.expenseReminder).toEqual({ skipCount: 1, movedToBell: false });
    await skip(C2, 1);
    expect(await NotificationModel.countDocuments()).toBe(0);

    const second = await skip(C2, 2);
    expect(second.body.checkin.expenseReminder).toEqual({ skipCount: 2, movedToBell: true });
    // Gửi lại giá trị cũ không làm giảm, không tạo thêm thông báo.
    const resent = await skip(C2, 1);
    expect(resent.body.checkin.expenseReminder.skipCount).toBe(2);
    await skip(C2, 2);
    expect(await NotificationModel.countDocuments()).toBe(1);
    expect((await NotificationModel.findOne())!.type).toBe('expense_skipped');
    expect((await reminder()).body.items.map((c: { id: string }) => c.id)).toEqual([C1]);
  });
});

describe('GET expenses', () => {
  it('gom theo ngày, quán chưa nhập có amount null', async () => {
    await twoCheckins();
    await putExpense(C1, { amount: 85000 });
    const byDay = await summary();
    expect(byDay.body.total).toBe(85000);
    expect(byDay.body.missingCount).toBe(1);
    expect(byDay.body.days[0].items.map((i: { amount: number | null }) => i.amount)).toEqual([85000, null]);
    const byPlace = await summary({ groupBy: 'place' });
    expect(byPlace.body.places).toHaveLength(2);
  });
});

describe('thông báo (chuông)', () => {
  const nurl = (path = '') => `/api/trips/${tripId}/notifications${path}`;
  const inbox = (token = hany, query: object = {}) => request(app).get(nurl()).query(query).set(auth(token));
  const create = (body: object, token = hany) => request(app).post(nurl()).set(auth(token)).send(body);
  const rain = { type: 'rain', dedupeKey: 'rain:t:2026-11-23', payload: { date: '2026-11-23' } };

  it('mỗi người chỉ thấy thông báo của mình; nhập tiền thì lời nhắc tự đánh dấu đã đọc', async () => {
    await twoCheckins();
    await skip(C2, 2);
    expect((await inbox()).body).toMatchObject({ unreadCount: 1 });
    expect((await inbox()).body.items[0]).toMatchObject({ type: 'expense_skipped', refId: C2, readAt: null });
    expect((await inbox(friend)).body).toEqual({ items: [], unreadCount: 0 });

    await putExpense(C2, { amount: 42000 }, friend);
    const after = await inbox();
    expect(after.body.unreadCount).toBe(0);
    expect(after.body.items[0].payload.amount).toBe(42000);

    await request(app).delete(url(`/${C2}/expense`)).set(auth(hany)).expect(204);
    expect((await inbox()).body.items[0].payload.amount).toBeUndefined();
  });

  it('tạo idempotent theo dedupeKey; client không tạo được expense_skipped', async () => {
    const first = await create(rain);
    expect(first.status).toBe(201);
    const again = await create(rain);
    expect(again.status).toBe(200);
    expect(again.body.notification.id).toBe(first.body.notification.id);
    expect((await create({ ...rain, type: 'expense_skipped' })).status).toBe(400);
    expect((await create({ ...rain, dedupeKey: 'expense_skipped:x' })).status).toBe(400);
  });

  it('đánh dấu một cái hoặc tất cả; của người khác thì 404', async () => {
    const a = (await create(rain)).body.notification.id;
    await create({ ...rain, dedupeKey: 'rain:t:2026-11-24' });
    const read = { read: true };
    const foreign = await request(app).patch(nurl(`/${a}`)).set(auth(friend)).send(read);
    expect(foreign.body.error.code).toBe('NOTIFICATION_NOT_FOUND');
    const one = await request(app).patch(nurl(`/${a}`)).set(auth(hany)).send(read);
    expect(one.body.notification.readAt).not.toBeNull();
    expect((await inbox(hany, { unread: 'true' })).body.items).toHaveLength(1);
    await request(app).patch(nurl('?unread=true')).set(auth(hany)).send(read).expect(204);
    expect((await inbox()).body.unreadCount).toBe(0);
    expect((await inbox(outsider)).body.error.code).toBe('TRIP_NOT_FOUND');
  });
});

