import { AppError } from './app-error';
import { now } from './clock';
import type { Coords } from './weather';

/**
 * Đường đi ngắn nhất cho xe máy, tính bằng máy chủ Valhalla công cộng của FOSSGIS (dữ liệu
 * OpenStreetMap, không cần khoá, chỉ hợp lượng dùng nhỏ; chạy thật nhiều người thì đổi nhà cung cấp).
 */
const ROUTE_URL = 'https://valhalla1.openstreetmap.de/route';
const PROFILE = 'motor_scooter';
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
/** Valhalla chỉ ghi tên ứng dụng để máy chủ nhận diện, không đưa thông tin cá nhân. */
const USER_AGENT = 'GoGoTripApp/0.1 (personal project)';
/** Mã lỗi của Valhalla nghĩa là hai điểm không nối được (không có đường, quá xa, không gần đường nào). */
const NO_ROUTE_CODES = new Set([154, 170, 171, 442]);

export interface Route {
  distanceKm: number;
  durationMinutes: number;
  /** Các điểm [lat, lng] dọc đường đi. */
  path: [number, number][];
}

const cache = new Map<string, { expiresAt: number; route: Route }>();

export function clearRouteCache(): void {
  cache.clear();
}

/** Giải mã polyline của Valhalla (định dạng Google, 6 chữ số thập phân). */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push([lat / 1e6, lng / 1e6]);
  }
  return points;
}

const upstreamError = () =>
  new AppError(502, 'ROUTE_UPSTREAM_ERROR', 'Chưa tính được đường đi, hãy thử lại sau ít phút.');
const noRoute = () => new AppError(422, 'ROUTE_NOT_FOUND', 'Không có đường đi giữa hai điểm này.');

async function requestRoute(from: Coords, to: Coords): Promise<Route> {
  let res: Response;
  let data: {
    error_code?: number;
    trip?: { summary?: { length?: unknown; time?: unknown }; legs?: { shape?: unknown }[] };
  };
  try {
    res = await fetch(ROUTE_URL, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
      body: JSON.stringify({
        locations: [
          { lat: from.lat, lon: from.lng },
          { lat: to.lat, lon: to.lng },
        ],
        costing: PROFILE,
        // Tính theo quãng đường ngắn nhất thay vì thời gian nhanh nhất.
        costing_options: { [PROFILE]: { shortest: true } },
        units: 'kilometers',
        directions_type: 'none',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    data = (await res.json()) as typeof data;
  } catch {
    throw upstreamError();
  }
  if (!res.ok) {
    throw data.error_code !== undefined && NO_ROUTE_CODES.has(data.error_code) ? noRoute() : upstreamError();
  }
  const length = data.trip?.summary?.length;
  const time = data.trip?.summary?.time;
  const shapes = data.trip?.legs?.map((leg) => leg.shape);
  if (typeof length !== 'number' || typeof time !== 'number' || !shapes?.every((s) => typeof s === 'string')) {
    throw upstreamError();
  }
  return {
    distanceKm: length,
    durationMinutes: Math.max(1, Math.round(time / 60)),
    path: shapes.flatMap((s) => decodePolyline(s as string)),
  };
}

export async function shortestRoute(from: Coords, to: Coords): Promise<Route> {
  // 5 chữ số thập phân là khoảng 1 m.
  const key = [from.lat, from.lng, to.lat, to.lng].map((n) => n.toFixed(5)).join(',');
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now().getTime()) return hit.route;
  const route = await requestRoute(from, to);
  cache.delete(key);
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { expiresAt: now().getTime() + CACHE_TTL_MS, route });
  return route;
}
