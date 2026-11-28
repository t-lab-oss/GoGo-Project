import { AppError } from './app-error';
import { now } from './clock';

/** Dự báo lấy từ Open-Meteo (không cần khoá, dùng phi thương mại, phải ghi nguồn). */
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const TIMEOUT_MS = 6000;
const FORECAST_TTL_MS = 30 * 60 * 1000;
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

/** Số ngày có dự báo, tính cả hôm nay. */
export const FORECAST_DAYS = 16;
/** Xác suất mưa tối đa từ mức này trở lên thì coi là ngày mưa (API Contract mục 11). */
export const RAIN_PROBABILITY = 60;

export interface Coords {
  lat: number;
  lng: number;
}

export interface Forecast {
  tempMin: number;
  tempMax: number;
  precipitationProbabilityMax: number | null;
  precipitationSum: number;
  rain: boolean;
}

function createCache<T>(ttl: number) {
  const map = new Map<string, { expiresAt: number; value: T }>();
  return {
    async get(key: string, load: () => Promise<T>): Promise<T> {
      const hit = map.get(key);
      if (hit && hit.expiresAt > now().getTime()) return hit.value;
      // Lỗi thì ném ra ngoài, không lưu vào cache.
      const value = await load();
      map.delete(key);
      if (map.size >= CACHE_MAX_ENTRIES) map.delete(map.keys().next().value!);
      map.set(key, { expiresAt: now().getTime() + ttl, value });
      return value;
    },
    clear: () => map.clear(),
  };
}

const geocodeCache = createCache<Coords | null>(GEOCODE_TTL_MS);
const forecastCache = createCache<Map<string, Forecast>>(FORECAST_TTL_MS);

export function clearWeatherCache(): void {
  geocodeCache.clear();
  forecastCache.clear();
}

const upstreamError = () =>
  new AppError(502, 'WEATHER_UPSTREAM_ERROR', 'Chưa lấy được dự báo thời tiết, hãy thử lại sau ít phút.');

async function getJson(base: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw upstreamError();
    return await res.json();
  } catch {
    throw upstreamError();
  }
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

async function searchPlaceName(name: string): Promise<Coords | null> {
  const data = (await getJson(GEOCODING_URL, { name, count: '1', language: 'vi' })) as {
    results?: { latitude?: unknown; longitude?: unknown }[];
  };
  const first = data.results?.[0];
  return first && isNumber(first.latitude) && isNumber(first.longitude)
    ? { lat: first.latitude, lng: first.longitude }
    : null;
}

/** Toạ độ của tên điểm đến. "Đà Lạt, Lâm Đồng" không ra thì thử riêng phần trước dấu phẩy hoặc gạch. */
export function geocodeDestination(destination: string): Promise<Coords | null> {
  const full = destination.normalize('NFC').trim();
  return geocodeCache.get(full.toLocaleLowerCase('vi-VN'), async () => {
    const head = full.split(/[,–-]/)[0]!.trim();
    const found = await searchPlaceName(full);
    if (found || head.length < 2 || head === full) return found;
    return searchPlaceName(head);
  });
}

/** Dự báo từng ngày trong khoảng [start, end] (đã nằm trong khoảng có dự báo), theo múi giờ tz. */
export function fetchForecast(at: Coords, start: string, end: string, tz: string): Promise<Map<string, Forecast>> {
  // Hai chữ số thập phân (khoảng 1 km) là đủ cho dự báo và để dùng chung cache.
  const latitude = at.lat.toFixed(2);
  const longitude = at.lng.toFixed(2);
  return forecastCache.get([latitude, longitude, start, end, tz].join('|'), async () => {
    const data = (await getJson(FORECAST_URL, {
      latitude,
      longitude,
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
      timezone: tz,
      start_date: start,
      end_date: end,
    })) as { daily?: Record<string, unknown[]> };
    const daily = data.daily;
    if (!Array.isArray(daily?.['time'])) throw upstreamError();

    const out = new Map<string, Forecast>();
    daily['time'].forEach((date, i) => {
      const max = daily['temperature_2m_max']?.[i];
      const min = daily['temperature_2m_min']?.[i];
      if (typeof date !== 'string' || !isNumber(max) || !isNumber(min)) return;
      const probability = daily['precipitation_probability_max']?.[i];
      const sum = daily['precipitation_sum']?.[i];
      out.set(date, {
        tempMin: Math.round(min),
        tempMax: Math.round(max),
        precipitationProbabilityMax: isNumber(probability) ? probability : null,
        precipitationSum: isNumber(sum) ? sum : 0,
        rain: isNumber(probability) && probability >= RAIN_PROBABILITY,
      });
    });
    return out;
  });
}
