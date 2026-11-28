import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { setNow } from '../src/lib/clock';
import { clearRouteCache, decodePolyline } from '../src/lib/routing';
import { UserModel } from '../src/modules/users/user.model';

let mongod: MongoMemoryServer;
const app = createApp();
const PASSWORD = 'MatKhau-Test-1';
let owner: string;
let outsider: string;
let tripId: string;
let placeId: string;

async function makeUser(username: string, publicId: string) {
  await UserModel.create({ username, passwordHash: await bcrypt.hash(PASSWORD, 4), publicId });
  const login = await request(app).post('/api/sessions').send({ username, password: PASSWORD });
  return login.body.accessToken as string;
}

const call = (method: 'get' | 'post', path: string, token = owner) =>
  request(app)[method](`/api${path}`).set('Authorization', `Bearer ${token}`);

const route = (query = 'fromLat=10.2&fromLng=103.96', token = owner, id = placeId) =>
  call('get', `/trips/${tripId}/places/${id}/route?${query}`, token);

/** Mã hoá polyline 6 chữ số, dùng để dựng phản hồi giả. */
function encode(points: [number, number][]): string {
  let previous = [0, 0];
  let out = '';
  for (const p of points) {
    const now = [Math.round(p[0] * 1e6), Math.round(p[1] * 1e6)];
    for (const i of [0, 1]) {
      const delta = now[i]! - previous[i]!;
      let v = delta < 0 ? ~(delta << 1) : delta << 1;
      while (v >= 0x20) {
        out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
        v >>= 5;
      }
      out += String.fromCharCode(v + 63);
    }
    previous = now;
  }
  return out;
}

const PATH: [number, number][] = [
  [10.2, 103.96],
  [10.205, 103.958],
  [10.21, 103.95],
];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = () => json({ trip: { summary: { length: 2.345, time: 400 }, legs: [{ shape: encode(PATH) }] } });
const mockFetch = (reply: () => Response) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => reply());

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
  clearRouteCache();
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  owner = await makeUser('hany', 'GG-TEST22');
  outsider = await makeUser('nguoila', 'GG-TEST44');
  const trip = await call('post', '/trips').send({
    name: 'PQ',
    destination: 'Phú Quốc',
    startDate: '2026-11-22',
    endDate: '2026-11-24',
  });
  tripId = trip.body.trip.id;
  const place = await call('post', `/trips/${tripId}/places`).send({ label: 'A', address: 'A', lat: 10.21, lng: 103.95 });
  placeId = place.body.place.id;
});

afterEach(() => {
  setNow(null);
  vi.restoreAllMocks();
});

describe('đường đi ngắn nhất đến quán', () => {
  it('giải mã đúng polyline 6 chữ số, kể cả số âm', () => {
    const points: [number, number][] = [[-33.865143, 151.2099], [10.000001, -103.96]];
    expect(decodePolyline(encode(points))).toEqual(points);
  });

  it('hỏi đường ngắn nhất cho xe máy từ mốc đến quán', async () => {
    const spy = mockFetch(ok);
    const res = await route();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ distanceKm: 2.345, durationMinutes: 7, path: PATH });
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe('https://valhalla1.openstreetmap.de/route');
    const body = JSON.parse(String(init!.body));
    expect(body.costing).toBe('motor_scooter');
    expect(body.costing_options.motor_scooter.shortest).toBe(true);
    expect(body.locations).toEqual([{ lat: 10.2, lon: 103.96 }, { lat: 10.21, lon: 103.95 }]);
  });

  it('cùng hai điểm thì dùng cache một giờ', async () => {
    const spy = mockFetch(ok);
    await route();
    await route();
    expect(spy).toHaveBeenCalledTimes(1);
    setNow(new Date('2026-11-23T06:01:00Z'));
    await route();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('người ngoài chuyến, quán không tồn tại, thiếu toạ độ mốc đều không gọi mạng', async () => {
    const spy = mockFetch(ok);
    expect((await route(undefined, outsider)).status).toBe(404);
    expect((await route(undefined, owner, 'f'.repeat(24))).status).toBe(404);
    for (const q of ['', 'fromLat=10.2', 'fromLat=&fromLng=', 'fromLat=91&fromLng=0', 'fromLat=x&fromLng=1']) {
      expect((await route(q)).status).toBe(400);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('quán chưa có vị trí: 422', async () => {
    const spy = mockFetch(ok);
    const bare = await call('post', `/trips/${tripId}/places`).send({ label: 'B', address: 'B' });
    const res = await route(undefined, owner, bare.body.place.id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PLACE_WITHOUT_LOCATION');
    expect(spy).not.toHaveBeenCalled();
  });

  it('không nối được hai điểm: 422; dịch vụ lỗi: 502 và không lưu cache', async () => {
    mockFetch(() => json({ error_code: 442 }, 400));
    expect((await route()).body.error.code).toBe('ROUTE_NOT_FOUND');
    vi.restoreAllMocks();
    mockFetch(() => json({}, 500));
    expect((await route()).body.error.code).toBe('ROUTE_UPSTREAM_ERROR');
    vi.restoreAllMocks();
    mockFetch(ok);
    expect((await route()).status).toBe(200);
  });
});
