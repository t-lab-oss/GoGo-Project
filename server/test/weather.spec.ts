import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { setNow } from '../src/lib/clock';
import { clearWeatherCache } from '../src/lib/weather';
import { UserModel } from '../src/modules/users/user.model';

let mongod: MongoMemoryServer;
const app = createApp();
const PASSWORD = 'MatKhau-Test-1';

let owner: string;
let outsider: string;

async function makeUser(username: string, publicId: string) {
  await UserModel.create({ username, passwordHash: await bcrypt.hash(PASSWORD, 4), publicId });
  const login = await request(app).post('/api/sessions').send({ username, password: PASSWORD });
  return login.body.accessToken as string;
}

const call = (method: 'get' | 'post', path: string, token = owner) =>
  request(app)[method](`/api${path}`).set('Authorization', `Bearer ${token}`);

async function newTrip(over: Record<string, unknown> = {}) {
  const res = await call('post', '/trips').send({
    name: 'Đà Lạt',
    destination: 'Đà Lạt',
    startDate: '2026-11-22',
    endDate: '2026-11-25',
    ...over,
  });
  expect(res.status).toBe(201);
  return res.body.trip.id as string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const forecast = (days: [string, number | null][]) =>
  json({
    daily: {
      time: days.map(([d]) => d),
      temperature_2m_max: days.map(() => 24.6),
      temperature_2m_min: days.map(() => 14.2),
      precipitation_probability_max: days.map(([, p]) => p),
      precipitation_sum: days.map(() => 3.1),
    },
  });

/** Giả fetch theo host, ghi lại URL đã gọi. Không gọi mạng thật. */
function mockFetch(handlers: { geocode?: (url: URL) => Response; forecast?: (url: URL) => Response }) {
  const urls: URL[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    urls.push(url);
    if (url.hostname === 'geocoding-api.open-meteo.com' && handlers.geocode) return handlers.geocode(url);
    if (url.hostname === 'api.open-meteo.com' && handlers.forecast) return handlers.forecast(url);
    throw new Error(`Không mong đợi gọi mạng tới ${url.hostname}`);
  });
  return urls;
}

const found = () => json({ results: [{ latitude: 11.94646, longitude: 108.44193 }] });

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
  clearWeatherCache();
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  owner = await makeUser('hany', 'GG-TEST22');
  outsider = await makeUser('nguoila', 'GG-TEST44');
});

afterEach(() => {
  setNow(null);
  vi.restoreAllMocks();
});

describe('GET /api/trips/:tripId/weather', () => {
  it('người ngoài chuyến nhận 404 và không gọi mạng', async () => {
    const tripId = await newTrip();
    const urls = mockFetch({});
    expect((await call('get', `/trips/${tripId}/weather`, outsider)).status).toBe(404);
    expect(urls).toHaveLength(0);
  });

  it('tìm toạ độ theo điểm đến; ngày đã qua không có dự báo; mưa từ 60% trở lên', async () => {
    const tripId = await newTrip();
    const urls = mockFetch({
      geocode: found,
      forecast: () => forecast([['2026-11-23', 60], ['2026-11-24', 59], ['2026-11-25', null]]),
    });
    const res = await call('get', `/trips/${tripId}/weather`);
    expect(res.status).toBe(200);
    expect(res.body.days.map((d: { available: boolean; rain: boolean }) => [d.available, d.rain])).toEqual([
      [false, false],
      [true, true],
      [true, false],
      [true, false],
    ]);
    expect(res.body.days[1]).toMatchObject({ tempMin: 14, tempMax: 25, precipitationProbabilityMax: 60 });
    expect(res.body.rainAdvice).toBe('Nên chọn những quán có mái hiên.');
    expect(urls[0]!.searchParams.get('name')).toBe('Đà Lạt');
    expect(urls[1]!.searchParams.get('start_date')).toBe('2026-11-23');
    expect(urls[1]!.searchParams.get('end_date')).toBe('2026-11-25');
    expect(urls[1]!.searchParams.get('latitude')).toBe('11.95');
  });

  it('không ngày nào mưa thì rainAdvice là null', async () => {
    const tripId = await newTrip();
    mockFetch({ geocode: found, forecast: () => forecast([['2026-11-23', 10]]) });
    expect((await call('get', `/trips/${tripId}/weather`)).body.rainAdvice).toBeNull();
  });

  it('có toạ độ điểm đến thì dùng luôn, không tìm theo tên', async () => {
    const tripId = await newTrip({ destinationGeo: { lat: 10.2, lng: 103.96 } });
    const urls = mockFetch({ forecast: () => forecast([]) });
    await call('get', `/trips/${tripId}/weather`);
    expect(urls).toHaveLength(1);
    expect(urls[0]!.searchParams.get('latitude')).toBe('10.20');
  });

  it('chưa có toạ độ điểm đến thì lấy trung bình các quán', async () => {
    const tripId = await newTrip();
    for (const [label, lat] of [['A', 10], ['B', 12]] as const) {
      await call('post', `/trips/${tripId}/places`).send({ label, address: label, lat, lng: 100 });
    }
    const urls = mockFetch({ forecast: () => forecast([]) });
    await call('get', `/trips/${tripId}/weather`);
    expect(urls[0]!.searchParams.get('latitude')).toBe('11.00');
  });

  it('tên đầy đủ không ra thì thử phần trước dấu phẩy; không ra nữa thì mọi ngày không có dự báo', async () => {
    const tripId = await newTrip({ destination: 'Xứ Lạ, Miền Xa' });
    const urls = mockFetch({ geocode: () => json({}) });
    const res = await call('get', `/trips/${tripId}/weather`);
    expect(res.status).toBe(200);
    expect(res.body.days.every((d: { available: boolean }) => !d.available)).toBe(true);
    expect(urls.map((u) => u.searchParams.get('name'))).toEqual(['Xứ Lạ, Miền Xa', 'Xứ Lạ']);
  });

  it('chuyến còn quá xa hoặc đã xong thì không gọi mạng', async () => {
    const far = await newTrip({ startDate: '2027-02-01', endDate: '2027-02-02' });
    const past = await newTrip({ startDate: '2026-10-01', endDate: '2026-10-02' });
    const urls = mockFetch({});
    for (const id of [far, past]) {
      expect((await call('get', `/trips/${id}/weather`)).status).toBe(200);
    }
    expect(urls).toHaveLength(0);
  });

  it('chỉ hỏi những ngày trong 16 ngày tới', async () => {
    const tripId = await newTrip({ startDate: '2026-12-06', endDate: '2026-12-12' });
    const urls = mockFetch({ geocode: found, forecast: () => forecast([]) });
    await call('get', `/trips/${tripId}/weather`);
    expect(urls[1]!.searchParams.get('end_date')).toBe('2026-12-08');
  });

  it('Open-Meteo lỗi: 502, lần sau gọi lại; thành công thì lưu cache 30 phút', async () => {
    const tripId = await newTrip();
    let attempts = 0;
    mockFetch({
      geocode: found,
      forecast: () => (attempts++ === 0 ? json({}, 500) : forecast([['2026-11-23', 10]])),
    });
    const failed = await call('get', `/trips/${tripId}/weather`);
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe('WEATHER_UPSTREAM_ERROR');
    expect((await call('get', `/trips/${tripId}/weather`)).status).toBe(200);
    await call('get', `/trips/${tripId}/weather`);
    expect(attempts).toBe(2);
    setNow(new Date('2026-11-23T05:31:00Z'));
    await call('get', `/trips/${tripId}/weather`);
    expect(attempts).toBe(3);
  });
});
