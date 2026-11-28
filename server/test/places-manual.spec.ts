import bcrypt from 'bcryptjs';
import mongoose, { type Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { setNow } from '../src/lib/clock';
import { ClusterModel } from '../src/modules/clusters/cluster.model';
import { TripPlaceModel } from '../src/modules/places/trip-place.model';
import { TripModel } from '../src/modules/trips/trip.model';
import { UserModel } from '../src/modules/users/user.model';

let mongod: MongoMemoryServer;
const app = createApp();
const PASSWORD = 'MatKhau-Test-1';
/** 12:00 giờ Việt Nam: cụm Ăn trưa (11:00-14:00) và Đi chơi (09:00-17:00) cùng chứa. */
const NOW_LUNCH = new Date('2026-11-23T05:00:00Z');

let hany: string;
let outsider: string;
let tripId: string;
let otherTripId: string;
const cluster: Record<string, Types.ObjectId> = {};
let otherCluster: Types.ObjectId;

async function makeUser(username: string, publicId: string) {
  const user = await UserModel.create({ username, passwordHash: await bcrypt.hash(PASSWORD, 4), publicId });
  const login = await request(app).post('/api/sessions').send({ username, password: PASSWORD });
  return { oid: user._id, token: login.body.accessToken as string };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const candidate = (url: string, token = hany) =>
  request(app).get(`/api/trips/${tripId}/place-candidate`).query({ url }).set(auth(token));
const post = (body: unknown, token = hany, id = tripId) =>
  request(app).post(`/api/trips/${id}/places`).set(auth(token)).send(body as object);
const patch = (placeId: string, body: unknown, token = hany) =>
  request(app).patch(`/api/trips/${tripId}/places/${placeId}`).set(auth(token)).send(body as object);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  setNow(NOW_LUNCH);
  await mongoose.connection.dropDatabase();
  await Promise.all([UserModel, TripModel, ClusterModel, TripPlaceModel].map((m) => m.init()));

  const h = await makeUser('hany', 'GG-TEST22');
  const t = await makeUser('tiencuto', 'GG-TEST33');
  const o = await makeUser('nguoila', 'GG-TEST44');
  hany = h.token;
  outsider = o.token;

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
    cluster[type] = (await ClusterModel.create({ tripId: trip._id, type, name, startTime, endTime, order }))._id;
  }

  const other = await TripModel.create({
    name: 'Đà Lạt',
    destination: 'Đà Lạt',
    startDate: '2026-11-22',
    endDate: '2026-11-25',
    ownerId: o.oid,
    memberIds: [o.oid],
  });
  otherTripId = other._id.toString();
  otherCluster = (
    await ClusterModel.create({
      tripId: other._id,
      type: 'lunch',
      name: 'Ăn trưa',
      startTime: '11:00',
      endTime: '14:00',
      order: 1,
    })
  )._id;
});

afterEach(() => {
  setNow(null);
  vi.restoreAllMocks();
});

const LONG =
  'https://www.google.com/maps/place/B%C3%A1nh+canh+H%E1%BA%BBm/@10.2,103.9,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d10.2123!4d103.9456';

const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

describe('GET /api/trips/:tripId/place-candidate', () => {
  it('link dài: đọc tên và toạ độ (ưu tiên !3d!4d), không gọi mạng', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const res = await candidate(LONG);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.candidate).toMatchObject({
      source: 'link',
      label: 'Bánh canh Hẻm',
      lat: 10.2123,
      lng: 103.9456,
      matchedBy: 'url',
    });
    expect(res.body.candidate.mapsUrl).toContain('google.com/maps/place');
    expect(spy).not.toHaveBeenCalled();
  });

  it('link chỉ có @lat,lng thì lấy toạ độ ở đó', async () => {
    const res = await candidate('https://www.google.com/maps/place/Qu%C3%A1n+A/@10.31,103.97,15z');
    expect(res.status).toBe(200);
    expect(res.body.candidate).toMatchObject({ label: 'Quán A', lat: 10.31, lng: 103.97 });
  });

  it('link ?q=lat,lng không có tên: label rỗng', async () => {
    const res = await candidate('https://www.google.com/maps?q=10.5,103.8');
    expect(res.status).toBe(200);
    expect(res.body.candidate).toMatchObject({ label: '', lat: 10.5, lng: 103.8 });
  });

  it('link rút gọn: theo chuyển hướng rồi đọc link đích', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirect('https://www.google.com/maps/place/Qu%C3%A1n+B/@10.1,103.8,17z'));
    const res = await candidate('https://maps.app.goo.gl/abc123');
    expect(res.status).toBe(200);
    expect(res.body.candidate).toMatchObject({ label: 'Quán B', lat: 10.1, lng: 103.8 });
    // mapsUrl giữ link người dùng dán để nút Chỉ đường dùng
    expect(res.body.candidate.mapsUrl).toBe('https://maps.app.goo.gl/abc123');
    expect(spy).toHaveBeenCalledTimes(1);
    const init = spy.mock.calls[0]![1]!;
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('manual');
    expect(init.credentials).toBe('omit');
  });

  it('nhiều bước chuyển hướng qua các host cho phép', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirect('https://maps.app.goo.gl/second'))
      .mockResolvedValueOnce(redirect('https://www.google.com/maps/place/C/@10.4,103.6,17z'));
    const res = await candidate('https://goo.gl/maps/first');
    expect(res.status).toBe(200);
    expect(res.body.candidate).toMatchObject({ label: 'C', lat: 10.4, lng: 103.6 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('chuyển hướng sang host lạ bị chặn, không gọi tiếp', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(redirect('https://evil.example.com/x'));
    const res = await candidate('https://maps.app.goo.gl/abc123');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'PLACE_NOT_RESOLVED', details: { reason: 'not_found' } });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('chuyển hướng về http hoặc host giả danh bị chặn', async () => {
    for (const target of ['http://maps.google.com/x', 'https://maps.google.com.evil.com/x', 'https://evilgoogle.com/maps/x']) {
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(redirect(target));
      const res = await candidate('https://maps.app.goo.gl/abc123');
      expect(res.status).toBe(422);
      expect(spy).toHaveBeenCalledTimes(1);
      vi.restoreAllMocks();
    }
  });

  it('chuyển hướng vòng quá 5 bước: dừng', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => redirect('https://maps.app.goo.gl/loop'));
    const res = await candidate('https://maps.app.goo.gl/loop');
    expect(res.status).toBe(422);
    expect(res.body.error.details.reason).toBe('not_found');
    expect(spy).toHaveBeenCalledTimes(5);
  });

  it('lỗi mạng hoặc quá giờ: 422 not_found', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('timeout'));
    const res = await candidate('https://maps.app.goo.gl/abc123');
    expect(res.status).toBe(422);
    expect(res.body.error.details.reason).toBe('not_found');
  });

  it('host sai hoặc sai giao thức: 400 INVALID_MAPS_URL', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const bad = [
      'https://evil.com/maps/place/x/@10,103,17z',
      'https://maps.google.com.evil.com/maps/@10,103,17z',
      'http://maps.google.com/maps/@10,103,17z',
      'https://www.google.com/search?q=10,103',
      'https://maps.google.com@evil.com/maps',
      'javascript:alert(1)',
      'khong-phai-link',
    ];
    for (const url of bad) {
      const res = await candidate(url);
      expect(res.status, url).toBe(400);
      expect(res.body.error.code, url).toBe('INVALID_MAPS_URL');
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('thiếu toạ độ: 422 no_coordinates', async () => {
    const res = await candidate('https://www.google.com/maps/place/Quan+khong+toa+do');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'PLACE_NOT_RESOLVED', details: { reason: 'no_coordinates' } });
  });

  it('link rút gọn dẫn tới trang không có toạ độ: no_coordinates', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(redirect('https://www.google.com/maps/place/Chi+co+ten'));
    const res = await candidate('https://maps.app.goo.gl/abc123');
    expect(res.status).toBe(422);
    expect(res.body.error.details.reason).toBe('no_coordinates');
  });

  it('thiếu url: 400 VALIDATION_ERROR', async () => {
    const res = await request(app).get(`/api/trips/${tripId}/place-candidate`).set(auth(hany));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('không token: 401, người ngoài chuyến: 404', async () => {
    expect((await request(app).get(`/api/trips/${tripId}/place-candidate`).query({ url: LONG })).status).toBe(401);
    const res = await candidate(LONG, outsider);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TRIP_NOT_FOUND');
  });

  it('không lưu gì vào database', async () => {
    await candidate(LONG);
    expect(await TripPlaceModel.countDocuments()).toBe(0);
  });
});

describe('POST /api/trips/:tripId/places', () => {
  /** Địa chỉ là link Google Maps, đã đọc được toạ độ. */
  const withLink = () => ({
    clusterId: cluster['lunch']!.toString(),
    label: ' Bánh canh Hẻm ',
    mapsUrl: 'https://maps.app.goo.gl/abc123',
    lat: 10.2123,
    lng: 103.9456,
  });
  /** Địa chỉ viết tay, không có toạ độ. */
  const withText = () => ({
    clusterId: cluster['dinner']!.toString(),
    label: 'Quán tối',
    address: '12 Trần Hưng Đạo, Dương Đông',
  });

  it('địa chỉ là link: 201 kèm Location, source link, có toạ độ, order nối tiếp', async () => {
    const first = await post(withLink());
    expect(first.status).toBe(201);
    expect(first.headers['location']).toBe(`/api/trips/${tripId}/places/${first.body.place.id}`);
    expect(first.body.place).toMatchObject({
      tripId,
      clusterId: cluster['lunch']!.toString(),
      source: 'link',
      placeId: null,
      label: 'Bánh canh Hẻm',
      address: '',
      mapsUrl: 'https://maps.app.goo.gl/abc123',
      lat: 10.2123,
      lng: 103.9456,
      order: 1,
      isArchived: false,
    });
    expect(first.body.place).not.toHaveProperty('manualRating');
    const second = await post({ ...withLink(), label: 'Quán khác', lat: 10.3 });
    expect(second.body.place.order).toBe(2);
  });

  it('địa chỉ viết tay: source manual, không có link và toạ độ', async () => {
    const res = await post(withText());
    expect(res.status).toBe(201);
    expect(res.body.place).toMatchObject({
      source: 'manual',
      address: '12 Trần Hưng Đạo, Dương Đông',
      mapsUrl: null,
      lat: null,
      lng: null,
      note: '',
      manualHours: null,
      manualPrice: null,
    });
  });

  it('link không đọc được toạ độ vẫn lưu được (lat, lng là null)', async () => {
    const res = await post({
      clusterId: cluster['lunch']!.toString(),
      label: 'Quán chỉ có link',
      mapsUrl: 'https://www.google.com/maps?cid=123',
      lat: null,
      lng: null,
    });
    expect(res.status).toBe(201);
    expect(res.body.place).toMatchObject({ source: 'link', mapsUrl: 'https://www.google.com/maps?cid=123', lat: null, lng: null });
  });

  it('chuỗi rỗng ở link coi như không nhập', async () => {
    const res = await post({ ...withText(), mapsUrl: '' });
    expect(res.status).toBe(201);
    expect(res.body.place.mapsUrl).toBeNull();
  });

  it('thiếu cả địa chỉ lẫn link: 400 ở trường address', async () => {
    for (const extra of [{}, { address: '   ' }, { address: '', mapsUrl: '' }]) {
      const res = await post({ clusterId: cluster['lunch']!.toString(), label: 'Quán trống', ...extra });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain('address');
    }
    expect(await TripPlaceModel.countDocuments()).toBe(0);
  });

  it('chỉ có vĩ độ hoặc chỉ có kinh độ: 400', async () => {
    const onlyLat = await post({ ...withLink(), lng: null });
    expect(onlyLat.status).toBe(400);
    expect(onlyLat.body.error.details.map((d: { field: string }) => d.field)).toContain('lng');
    const onlyLng = await post({ ...withLink(), lat: undefined });
    expect(onlyLng.status).toBe(400);
    expect(onlyLng.body.error.details.map((d: { field: string }) => d.field)).toContain('lat');
  });

  it('vẫn nhận giờ, giá, ghi chú cũ nếu có gửi', async () => {
    const res = await post({
      ...withText(),
      note: 'Đi sớm',
      manualHours: { open: '06:00', close: '13:30' },
      manualPrice: '30k–60k',
    });
    expect(res.status).toBe(201);
    expect(res.body.place).toMatchObject({
      note: 'Đi sớm',
      manualHours: { open: '06:00', close: '13:30' },
      manualPrice: '30k–60k',
    });
  });

  it('không gửi clusterId: tự xếp vào cụm chứa giờ hiện tại (cụ thể nhất)', async () => {
    const res = await post({ label: 'Quán ngẫu hứng', address: 'Gần chợ' });
    expect(res.status).toBe(201);
    expect(res.body.place.clusterId).toBe(cluster['lunch']!.toString());
  });

  it('không gửi clusterId và không cụm nào chứa giờ: vào cụm Đi chơi', async () => {
    setNow(new Date('2026-11-23T15:00:00Z')); // 22:00 giờ Việt Nam
    const res = await post({ label: 'Quán khuya', address: 'Gần bãi biển' });
    expect(res.status).toBe(201);
    expect(res.body.place.clusterId).toBe(cluster['activity']!.toString());
  });

  it('sai dữ liệu: 400 VALIDATION_ERROR nêu đúng trường', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ label: '' }, 'label'],
      [{ label: 'x'.repeat(81) }, 'label'],
      [{ address: 'x'.repeat(201) }, 'address'],
      [{ lat: 91 }, 'lat'],
      [{ lng: -181 }, 'lng'],
      [{ manualHours: { open: '6:00', close: '13:00' } }, 'manualHours.open'],
      [{ manualPrice: 'x'.repeat(41) }, 'manualPrice'],
      [{ note: 'x'.repeat(501) }, 'note'],
      [{ clusterId: 'khong-hop-le' }, 'clusterId'],
    ];
    for (const [patchBody, field] of cases) {
      const res = await post({ ...withLink(), ...patchBody });
      expect(res.status, field).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.map((d: { field: string }) => d.field), field).toContain(field);
    }
    expect(await TripPlaceModel.countDocuments()).toBe(0);
  });

  it('mapsUrl không phải Google Maps: 400 INVALID_MAPS_URL', async () => {
    for (const mapsUrl of ['https://evil.com/maps', 'javascript:alert(1)']) {
      const res = await post({ ...withLink(), mapsUrl });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_MAPS_URL');
    }
  });

  it('trùng quán trong cùng cụm: 409 kèm existingPlaceId; cụm khác thì được', async () => {
    const first = await post(withLink());
    const dup = await post({ ...withLink(), label: 'BÁNH CANH HẺM' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('PLACE_ALREADY_IN_CLUSTER');
    expect(dup.body.error.details.existingPlaceId).toBe(first.body.place.id);
    const elsewhere = await post({ ...withLink(), clusterId: cluster['dinner']!.toString() });
    expect(elsewhere.status).toBe(201);
  });

  it('quán không toạ độ: trùng tên và địa chỉ thì 409, khác địa chỉ hoặc có toạ độ thì được', async () => {
    const first = await post(withText());
    const dup = await post({ ...withText(), label: 'quán TỐI', address: ' 12 TRẦN HƯNG ĐẠO, dương đông ' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.existingPlaceId).toBe(first.body.place.id);
    expect((await post({ ...withText(), address: 'Địa chỉ khác' })).status).toBe(201);
    expect((await post({ ...withText(), mapsUrl: 'https://maps.app.goo.gl/x', lat: 10.1, lng: 103.9 })).status).toBe(201);
  });

  it('cụm của chuyến khác: 404 CLUSTER_NOT_FOUND', async () => {
    const res = await post({ ...withLink(), clusterId: otherCluster.toString() });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLUSTER_NOT_FOUND');
  });

  it('người ngoài chuyến: 404, không token: 401', async () => {
    const res = await post(withLink(), outsider);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TRIP_NOT_FOUND');
    const anon = await request(app).post(`/api/trips/${tripId}/places`).send(withLink());
    expect(anon.status).toBe(401);
  });

  it('quán mới hiện trong GET /places và GET /places/:id', async () => {
    const created = await post(withText());
    const list = await request(app).get(`/api/trips/${tripId}/places`).set(auth(hany));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].address).toBe('12 Trần Hưng Đạo, Dương Đông');
    const one = await request(app).get(`/api/trips/${tripId}/places/${created.body.place.id}`).set(auth(hany));
    expect(one.status).toBe(200);
    expect(one.body.place.id).toBe(created.body.place.id);
  });
});

describe('PATCH /api/trips/:tripId/places/:tripPlaceId', () => {
  let placeId: string;

  beforeEach(async () => {
    const res = await post({
      clusterId: cluster['lunch']!.toString(),
      label: 'Quán gốc',
      address: '1 Nguyễn Trãi',
    });
    placeId = res.body.place.id;
  });

  it('sửa tên, giữ nguyên các trường không gửi', async () => {
    const res = await patch(placeId, { label: 'Quán mới' });
    expect(res.status).toBe(200);
    expect(res.body.place).toMatchObject({
      id: placeId,
      label: 'Quán mới',
      address: '1 Nguyễn Trãi',
      clusterId: cluster['lunch']!.toString(),
      lat: null,
      lng: null,
    });
  });

  it('đổi địa chỉ chữ sang link có toạ độ', async () => {
    const res = await patch(placeId, {
      address: '',
      mapsUrl: 'https://maps.app.goo.gl/abc123',
      lat: 10.2,
      lng: 103.9,
    });
    expect(res.status).toBe(200);
    expect(res.body.place).toMatchObject({ address: '', mapsUrl: 'https://maps.app.goo.gl/abc123', lat: 10.2, lng: 103.9 });
  });

  it('đổi từ link sang địa chỉ chữ: xoá link và toạ độ bằng null', async () => {
    await patch(placeId, { mapsUrl: 'https://maps.app.goo.gl/abc123', lat: 10.2, lng: 103.9 });
    const res = await patch(placeId, { address: '5 Lê Lợi', mapsUrl: null, lat: null, lng: null });
    expect(res.status).toBe(200);
    expect(res.body.place).toMatchObject({ address: '5 Lê Lợi', mapsUrl: null, lat: null, lng: null });
  });

  it('xoá cả địa chỉ lẫn link: 400 ở trường address', async () => {
    const res = await patch(placeId, { address: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain('address');
    expect((await patch(placeId, { address: '  ' })).status).toBe(400);
  });

  it('chỉ gửi một trong hai toạ độ: 400', async () => {
    const res = await patch(placeId, { lat: 10.2 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('quán cũ chưa có địa chỉ vẫn đổi tên được (không ép nhập địa chỉ khi không đụng tới)', async () => {
    const legacy = await TripPlaceModel.create({
      tripId,
      clusterId: cluster['lunch'],
      source: 'manual',
      label: 'Quán seed',
      lat: 10.2,
      lng: 103.9,
    });
    const res = await patch(legacy._id.toString(), { label: 'Quán seed (sửa)' });
    expect(res.status).toBe(200);
    expect(res.body.place).toMatchObject({ label: 'Quán seed (sửa)', address: '', lat: 10.2 });
  });

  it('đổi cụm: sang cuối cụm mới', async () => {
    const res = await patch(placeId, { clusterId: cluster['dinner']!.toString() });
    expect(res.status).toBe(200);
    expect(res.body.place.clusterId).toBe(cluster['dinner']!.toString());
    expect(res.body.place.order).toBe(1);
  });

  it('body rỗng: 200, không đổi gì', async () => {
    const res = await patch(placeId, {});
    expect(res.status).toBe(200);
    expect(res.body.place.label).toBe('Quán gốc');
  });

  it('sai dữ liệu: 400; link lạ: 400 INVALID_MAPS_URL', async () => {
    const bad = await patch(placeId, { label: '' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const link = await patch(placeId, { mapsUrl: 'https://evil.com' });
    expect(link.status).toBe(400);
    expect(link.body.error.code).toBe('INVALID_MAPS_URL');
  });

  it('đổi tên thành trùng quán khác (cùng địa chỉ) trong cụm: 409', async () => {
    await post({ clusterId: cluster['lunch']!.toString(), label: 'Quán B', address: '1 Nguyễn Trãi' });
    const res = await patch(placeId, { label: 'quán b' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PLACE_ALREADY_IN_CLUSTER');
  });

  it('sửa chính nó giữ nguyên tên không bị coi là trùng', async () => {
    const res = await patch(placeId, { label: 'Quán gốc', address: '1 Nguyễn Trãi, Phú Quốc' });
    expect(res.status).toBe(200);
  });

  it('cụm chuyến khác: 404 CLUSTER_NOT_FOUND', async () => {
    const res = await patch(placeId, { clusterId: otherCluster.toString() });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLUSTER_NOT_FOUND');
  });

  it('quán không tồn tại, ID sai, quán đã archive hoặc quán của chuyến khác: 404 PLACE_NOT_FOUND', async () => {
    const missing = await patch(new mongoose.Types.ObjectId().toString(), { label: 'x' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('PLACE_NOT_FOUND');
    expect((await patch('abc', { label: 'x' })).status).toBe(404);

    await TripPlaceModel.updateOne({ _id: placeId }, { isArchived: true });
    expect((await patch(placeId, { label: 'x' })).status).toBe(404);

    const foreign = await TripPlaceModel.create({
      tripId: otherTripId,
      clusterId: otherCluster,
      source: 'manual',
      label: 'Của người khác',
      address: 'đâu đó',
    });
    expect((await patch(foreign._id.toString(), { label: 'x' })).status).toBe(404);
  });

  it('người ngoài chuyến: 404 TRIP_NOT_FOUND', async () => {
    const res = await patch(placeId, { label: 'x' }, outsider);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TRIP_NOT_FOUND');
  });
});
