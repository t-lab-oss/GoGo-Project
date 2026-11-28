import bcrypt from 'bcryptjs';
import mongoose, { type Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { setNow } from '../src/lib/clock';
import { setStorage, type PhotoStorage, type StoredFile } from '../src/lib/storage';
import { CheckinModel } from '../src/modules/checkins/checkin.model';
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
  await Promise.all([UserModel, TripModel, ClusterModel, TripPlaceModel, CheckinModel, MomentModel].map((m) => m.init()));

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

describe('POST /uploads', () => {
  it('trả signed URL cho ảnh và thumbnail theo đường dẫn do server suy ra', async () => {
    const res = await upload({ momentIds: [M1, M2], contentType: 'image/jpeg', path: '../hack' });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].momentId).toBe(M1);
    expect(res.body.items[0].photo.uploadUrl).toContain(`trips/${tripId}/moments/${M1}.jpg`);
    expect(res.body.items[0].thumb.uploadUrl).toContain(`${M1}.thumb.jpg`);
    expect(res.body.expiresAt).toBe('2026-11-23T07:00:00.000Z');
    expect(storage.signedUploads.every((p) => p.startsWith(`trips/${tripId}/moments/`))).toBe(true);
  });

  it('kiểm tra số lượng, định dạng ID và loại ảnh', async () => {
    const many = Array.from({ length: 21 }, (_, i) => hex(i + 1));
    for (const body of [
      { momentIds: [], contentType: 'image/jpeg' },
      { momentIds: many, contentType: 'image/jpeg' },
      { momentIds: ['../x'], contentType: 'image/jpeg' },
      { momentIds: [M1], contentType: 'image/png' },
    ]) {
      const res = await upload(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('không cho ghi đè ảnh của người khác hoặc chuyến khác', async () => {
    storage.put(tripId, M1);
    await putCheckin(C1, base({ momentId: M1, photo })).expect(201);
    const byFriend = await upload({ momentIds: [M1], contentType: 'image/jpeg' }, friend);
    expect(byFriend.status).toBe(409);
    expect(byFriend.body.error.code).toBe('ID_CONFLICT');
    const otherTrip = await upload({ momentIds: [M1], contentType: 'image/jpeg' }, hany, otherTripId);
    expect(otherTrip.status).toBe(409);
    // Chính chủ gửi lại thì vẫn được.
    await upload({ momentIds: [M1], contentType: 'image/jpeg' }).expect(201);
  });

  it('người ngoài nhận 404, chưa đăng nhập nhận 401', async () => {
    const res = await upload({ momentIds: [M1], contentType: 'image/jpeg' }, outsider);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TRIP_NOT_FOUND');
    await request(app).post(`/api/trips/${tripId}/uploads`).send({}).expect(401);
  });
});

describe('PUT /checkins/:checkinId', () => {
  it('check-in không ảnh: 201, tính dayDate, cụm thành done', async () => {
    const res = await putCheckin(C1, base({ lat: 10.2, lng: 103.9 }));
    expect(res.status).toBe(201);
    expect(res.body.moment).toBeNull();
    expect(res.body.checkin).toMatchObject({
      id: C1, tripPlaceId: placeId, clusterId: clusterId.toString(), placeLabel: 'Quán 3',
      userId: hanyId.toString(), dayDate: '2026-11-23', lat: 10.2, lng: 103.9, momentId: null,
      expenseReminder: { skipCount: 0, movedToBell: false },
    });
    const clusters = await request(app).get(`/api/trips/${tripId}/clusters`).query({ date: '2026-11-23', include: 'checkins' }).set(auth(hany));
    expect(clusters.body.items[0].state).toBe('done');
    expect(clusters.body.items[0].checkins[0].id).toBe(C1);
  });

  it('dayDate theo múi giờ chuyến (khuya UTC là hôm sau ở Việt Nam)', async () => {
    const res = await putCheckin(C1, base({ takenAt: '2026-11-22T18:30:00.000Z' }));
    expect(res.body.checkin.dayDate).toBe('2026-11-23');
  });

  it('có ảnh: tạo moment nguồn checkin kèm signed URL', async () => {
    storage.put(tripId, M1);
    const res = await putCheckin(C1, base({ momentId: M1, photo }));
    expect(res.status).toBe(201);
    expect(res.body.checkin.momentId).toBe(M1);
    expect(res.body.moment).toMatchObject({
      id: M1, source: 'checkin', checkinId: C1, tripPlaceId: placeId, placeLabel: 'Quán 3',
      user: { username: 'hany' }, width: 1080, dayDate: '2026-11-23',
      urlExpiresAt: '2026-11-23T06:00:00.000Z',
    });
    expect(res.body.moment.photoUrl).toContain(`${M1}.jpg`);
    expect(res.body.moment.thumbUrl).toContain(`${M1}.thumb.jpg`);
  });

  it('gửi lại cùng ID trả 200 với bản đã có, không đổi gì', async () => {
    storage.put(tripId, M1);
    await putCheckin(C1, base({ momentId: M1, photo })).expect(201);
    const again = await putCheckin(C1, base({ tripPlaceId: place2Id, momentId: M1, photo }));
    expect(again.status).toBe(200);
    expect(again.body.checkin.tripPlaceId).toBe(placeId);
    expect(again.body.moment.id).toBe(M1);
    expect(await CheckinModel.countDocuments()).toBe(1);
    expect(await MomentModel.countDocuments()).toBe(1);
  });

  it('hai request cùng ID chạy song song chỉ tạo một check-in', async () => {
    const [a, b] = await Promise.all([putCheckin(C1, base()), putCheckin(C1, base())]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await CheckinModel.countDocuments()).toBe(1);
  });

  it('hai request có ảnh chạy song song cũng chỉ tạo một check-in và một ảnh', async () => {
    storage.put(tripId, M1);
    const body = base({ momentId: M1, photo });
    const [a, b] = await Promise.all([putCheckin(C1, body), putCheckin(C1, body)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await CheckinModel.countDocuments()).toBe(1);
    expect(await MomentModel.countDocuments()).toBe(1);
  });

  it('dùng lại moment đã ghi dở của chính check-in này', async () => {
    storage.put(tripId, M1);
    await putCheckin(C1, base({ momentId: M1, photo })).expect(201);
    await CheckinModel.deleteMany({});
    const res = await putCheckin(C1, base({ momentId: M1, photo }));
    expect(res.status).toBe(201);
    expect(await MomentModel.countDocuments()).toBe(1);
  });

  it('momentId và photo phải đi cùng nhau', async () => {
    for (const extra of [{ momentId: M1 }, { photo }]) {
      const res = await putCheckin(C1, base(extra));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('từ chối ID, thời điểm, dung lượng sai định dạng', async () => {
    expect((await putCheckin('abc', base())).status).toBe(400);
    expect((await putCheckin(C1, base({ takenAt: 'hôm qua' }))).status).toBe(400);
    expect((await putCheckin(C1, base({ momentId: M1, photo: { ...photo, bytes: 9_000_000 } }))).status).toBe(400);
  });

  it('422 PHOTO_NOT_FOUND khi thiếu ảnh hoặc thumbnail, không ghi gì', async () => {
    const none = await putCheckin(C1, base({ momentId: M1, photo }));
    expect(none.status).toBe(422);
    expect(none.body.error.code).toBe('PHOTO_NOT_FOUND');
    storage.put(tripId, M1);
    storage.files.delete(`trips/${tripId}/moments/${M1}.thumb.jpg`);
    expect((await putCheckin(C1, base({ momentId: M1, photo }))).status).toBe(422);
    expect(await CheckinModel.countDocuments()).toBe(0);
    expect(await MomentModel.countDocuments()).toBe(0);
  });

  it('ảnh tải lên quá lớn hoặc sai loại thì 400', async () => {
    storage.put(tripId, M1, { size: 5_000_000 });
    expect((await putCheckin(C1, base({ momentId: M1, photo }))).status).toBe(400);
    storage.put(tripId, M1, { contentType: 'text/html' });
    expect((await putCheckin(C1, base({ momentId: M1, photo }))).status).toBe(400);
  });

  it('422 DATE_OUT_OF_RANGE ngoài ngày của chuyến', async () => {
    const res = await putCheckin(C1, base({ takenAt: '2026-12-01T05:00:00.000Z' }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('DATE_OUT_OF_RANGE');
  });

  it('409 ALREADY_CHECKED_IN kèm checkinId; quán khác hoặc ngày khác vẫn được', async () => {
    await putCheckin(C1, base()).expect(201);
    const res = await putCheckin(C2, base(), friend);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_CHECKED_IN');
    expect(res.body.error.details).toEqual({ checkinId: C1 });
    await putCheckin(C2, base({ tripPlaceId: place2Id }), friend).expect(201);
    await putCheckin(hex(0xc3), base({ takenAt: '2026-11-24T05:00:00.000Z' })).expect(201);
  });

  it('409 ID_CONFLICT khi ID thuộc người khác, chuyến khác, hoặc moment đã dùng', async () => {
    storage.put(tripId, M1);
    await putCheckin(C1, base({ momentId: M1, photo })).expect(201);
    const byFriend = await putCheckin(C1, base(), friend);
    expect(byFriend.status).toBe(409);
    expect(byFriend.body.error.code).toBe('ID_CONFLICT');
    const otherTrip = await putCheckin(C1, base({ tripPlaceId: otherPlaceId }), hany, otherTripId);
    expect(otherTrip.body.error.code).toBe('ID_CONFLICT');
    const reuseMoment = await putCheckin(C2, base({ tripPlaceId: place2Id, momentId: M1, photo }));
    expect(reuseMoment.body.error.code).toBe('ID_CONFLICT');
    expect(await CheckinModel.countDocuments()).toBe(1);
  });

  it('404 PLACE_NOT_FOUND: quán chuyến khác, đã archive hoặc ID sai', async () => {
    for (const tripPlaceId of [otherPlaceId, 'abc', hex(999)]) {
      const res = await putCheckin(C1, base({ tripPlaceId }));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PLACE_NOT_FOUND');
    }
    await TripPlaceModel.updateOne({ _id: placeId }, { isArchived: true });
    expect((await putCheckin(C1, base())).status).toBe(404);
  });

  it('người ngoài nhận 404 TRIP_NOT_FOUND', async () => {
    const res = await putCheckin(C1, base(), outsider);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TRIP_NOT_FOUND');
    await request(app).put(`/api/trips/${tripId}/checkins/${C1}`).send(base()).expect(401);
  });
});

describe('moments', () => {
  const body = (over: object = {}) => ({ source: 'camera', photo, takenAt: TAKEN, ...over });

  it('PUT tạo khoảnh khắc camera gắn check-in đã có; gửi lại trả 200', async () => {
    await putCheckin(C1, base()).expect(201);
    storage.put(tripId, M2);
    const res = await putMoment(M2, body({ checkinId: C1 }), friend);
    expect(res.status).toBe(201);
    expect(res.body.moment).toMatchObject({
      id: M2, source: 'camera', checkinId: C1, tripPlaceId: placeId, placeLabel: 'Quán 3', user: { username: 'tiencuto' },
    });
    const again = await putMoment(M2, body({ checkinId: C1 }), friend);
    expect(again.status).toBe(200);
    expect(await MomentModel.countDocuments()).toBe(1);
  });

  it('lỗi: nguồn checkin, ID của người khác, thiếu ảnh, sai ngày, check-in và quán lạ, người ngoài', async () => {
    storage.put(tripId, M1);
    expect((await putMoment(M1, body({ source: 'checkin' }))).status).toBe(400);
    await putMoment(M1, body()).expect(201);
    expect((await putMoment(M1, body(), friend)).body.error.code).toBe('ID_CONFLICT');
    expect((await putMoment(M2, body())).body.error.code).toBe('PHOTO_NOT_FOUND');
    expect((await putMoment(M2, body({ takenAt: '2026-12-01T05:00:00.000Z' }))).body.error.code).toBe('DATE_OUT_OF_RANGE');
    expect((await putMoment(M2, body({ checkinId: hex(5) }))).body.error.code).toBe('CHECKIN_NOT_FOUND');
    expect((await putMoment(M2, body({ tripPlaceId: otherPlaceId }))).body.error.code).toBe('PLACE_NOT_FOUND');
    expect((await putMoment(M2, body(), outsider)).body.error.code).toBe('TRIP_NOT_FOUND');
  });

  it('GET trả mới nhất trước, có limit và cursor, ẩn ngày ngoài chuyến', async () => {
    storage.put(tripId, M1);
    storage.put(tripId, M2);
    await putMoment(M1, body({ takenAt: '2026-11-23T01:00:00.000Z' })).expect(201);
    await putMoment(M2, body({ takenAt: '2026-11-24T01:00:00.000Z' })).expect(201);
    const first = await listMoments({ limit: 1 });
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.body.items.map((m: { id: string }) => m.id)).toEqual([M2]);
    expect(first.body.items[0].thumbUrl).toContain('thumb');
    const next = await listMoments({ limit: 1, cursor: first.body.nextCursor });
    expect(next.body.items.map((m: { id: string }) => m.id)).toEqual([M1]);
    expect(next.body.nextCursor).toBeNull();
    expect((await listMoments({ date: '2026-11-23' })).body.items).toHaveLength(1);
    await TripModel.updateOne({ _id: tripId }, { endDate: '2026-11-23' });
    expect((await listMoments()).body.items.map((m: { id: string }) => m.id)).toEqual([M1]);
    expect((await listMoments({}, outsider)).status).toBe(404);
  });
});

describe('PUT checkins, số sao', () => {
  it('lưu số sao chọn lúc đăng, không chọn thì null', async () => {
    const rated = await putCheckin(C1, base({ rating: 4 }));
    expect(rated.status).toBe(201);
    expect(rated.body.checkin.rating).toBe(4);

    const unrated = await putCheckin(C2, base({ tripPlaceId: place2Id }));
    expect(unrated.body.checkin.rating).toBeNull();
  });

  it('lưu câu đánh giá vào check-in và ghi chú của ảnh; quá 100 ký tự thì 400', async () => {
    storage.put(tripId, M1);
    const res = await putCheckin(C1, base({ momentId: M1, photo, review: '  Ngon lắm  ' }));
    expect(res.status).toBe(201);
    expect(res.body.checkin.review).toBe('Ngon lắm');
    expect(res.body.moment.note).toBe('Ngon lắm');

    const long = await putCheckin(C2, base({ tripPlaceId: place2Id, review: 'a'.repeat(101) }));
    expect(long.status).toBe(400);
  });

  it('chấm được nửa sao và lưu mô tả, mô tả được ưu tiên làm ghi chú ảnh', async () => {
    storage.put(tripId, M1);
    const res = await putCheckin(C1, base({ momentId: M1, photo, rating: 3.5, caption: 'Chiều ở biển', review: 'Ổn' }));
    expect(res.status).toBe(201);
    expect(res.body.checkin.rating).toBe(3.5);
    expect(res.body.checkin.caption).toBe('Chiều ở biển');
    expect(res.body.moment.note).toBe('Chiều ở biển');
  });

  it('số sao ngoài 0,5..5 hoặc lẻ hơn nửa sao thì 400', async () => {
    for (const rating of [0, 5.5, 3.2]) {
      const res = await putCheckin(C1, base({ rating }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('xem, sửa, xoá khoảnh khắc', () => {
  const one = (id: string) => `/api/trips/${tripId}/moments/${id}`;
  const make = async (id: string, token = hany) => {
    storage.put(tripId, id);
    await putMoment(id, { source: 'camera', photo, takenAt: TAKEN, mood: 'happy' }, token).expect(201);
  };

  it('thành viên khác sửa được ghi chú, địa điểm, bỏ tâm trạng', async () => {
    await make(M1);
    const res = await request(app).patch(one(M1)).set(auth(friend)).send({ note: ' Vui ', placeLabel: 'Bãi Sao', mood: null });
    expect(res.status).toBe(200);
    expect(res.body.moment).toMatchObject({ note: 'Vui', placeLabel: 'Bãi Sao', mood: null });
  });

  it('mỗi ngày chỉ một ảnh nổi bật; đổi giờ ra ngoài chuyến thì 422', async () => {
    await make(M1);
    await make(M2);
    await request(app).patch(one(M1)).set(auth(hany)).send({ isHighlight: true }).expect(200);
    await request(app).patch(one(M2)).set(auth(hany)).send({ isHighlight: true }).expect(200);
    expect(await MomentModel.countDocuments({ isHighlight: true })).toBe(1);
    const out = await request(app).patch(one(M1)).set(auth(hany)).send({ takenAt: '2026-12-30T05:00:00.000Z' });
    expect(out.body.error.code).toBe('DATE_OUT_OF_RANGE');
  });

  it('người đăng hoặc chủ chuyến mới xoá được; xoá cả file và gỡ khỏi check-in', async () => {
    await make(M1);
    const denied = await request(app).delete(one(M1)).set(auth(friend));
    expect(denied.status).toBe(403);
    storage.put(tripId, M2);
    await putCheckin(C1, base({ momentId: M2, photo }), friend).expect(201);
    // Chủ chuyến xoá ảnh của người khác.
    await request(app).delete(one(M2)).set(auth(hany)).expect(204);
    expect((await CheckinModel.findById(C1))!.momentId).toBeNull();
    expect([...storage.files.keys()].some((k) => k.includes(M2))).toBe(false);
    const gone = await request(app).get(one(M2)).set(auth(hany));
    expect(gone.body.error.code).toBe('MOMENT_NOT_FOUND');
  });
});

