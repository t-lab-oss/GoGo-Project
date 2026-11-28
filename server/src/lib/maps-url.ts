import { AppError } from './app-error';

/** Số bước chuyển hướng tối đa khi mở link rút gọn. */
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 5000;

const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);

/**
 * Chỉ nhận link Google Maps: maps.app.goo.gl, goo.gl, maps.google.com và google.com/maps.
 * So khớp host chính xác (không dùng endsWith) để `evilgoogle.com` hay `maps.google.com.evil.com`
 * không lọt. Chỉ https, không cổng riêng, không user:pass.
 */
export function isAllowedMapsUrl(url: URL): boolean {
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (SHORT_HOSTS.has(host) || host === 'maps.google.com') return true;
  if (host === 'google.com' || host === 'www.google.com') {
    return url.pathname === '/maps' || url.pathname.startsWith('/maps/');
  }
  return false;
}

/** Parse chuỗi thành URL được phép, sai thì ném 400 INVALID_MAPS_URL. */
export function parseAllowedMapsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw invalidMapsUrl();
  }
  if (!isAllowedMapsUrl(url)) throw invalidMapsUrl();
  return url;
}

function invalidMapsUrl(): AppError {
  return new AppError(
    400,
    'INVALID_MAPS_URL',
    'Đây chưa phải link Google Maps. Hãy mở quán trong Google Maps, bấm Chia sẻ rồi dán link vào đây.',
  );
}

export interface ParsedMapsPlace {
  label: string;
  lat: number | null;
  lng: number | null;
}

function validCoords(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Đọc tên và toạ độ từ URL Google Maps đầy đủ. Không gọi mạng. */
export function parseMapsPlace(url: URL): ParsedMapsPlace {
  let label = '';
  const nameMatch = /\/place\/([^/]+)/.exec(url.pathname);
  if (nameMatch?.[1]) {
    const plus = nameMatch[1].replace(/\+/g, ' ');
    try {
      label = decodeURIComponent(plus).trim();
    } catch {
      label = plus.trim();
    }
  }

  // Dùng href đã giải mã % để bắt được cả "!3d" lẫn "%213d".
  let text = url.href;
  try {
    text = decodeURIComponent(url.href);
  } catch {
    // giữ nguyên href nếu có chuỗi % lỗi
  }
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:&|$)/,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (validCoords(lat, lng)) return { label, lat, lng };
  }
  return { label, lat: null, lng: null };
}

function notResolved(reason: 'no_coordinates' | 'not_found'): AppError {
  const message =
    reason === 'no_coordinates'
      ? 'Link này không có toạ độ. Hãy mở quán trong Google Maps rồi dùng nút Chia sẻ, hoặc nhập toạ độ tay.'
      : 'Không đọc được link này. Hãy kiểm tra lại link hoặc nhập thông tin quán bằng tay.';
  return new AppError(422, 'PLACE_NOT_RESOLVED', message, { reason });
}

/**
 * Đổi link người dùng dán thành tên và toạ độ.
 * - Link dài: đọc thẳng, không gọi mạng.
 * - Link rút gọn: theo chuyển hướng thủ công (tối đa 5 bước, kiểm tra host ở mỗi bước, chống SSRF),
 *   chỉ GET, không gửi cookie, không đọc nội dung phản hồi nên không lo kích thước.
 */
export async function resolveMapsLink(raw: string): Promise<ParsedMapsPlace> {
  let url = parseAllowedMapsUrl(raw);

  for (let step = 0; SHORT_HOSTS.has(url.hostname.toLowerCase()); step++) {
    if (step >= MAX_REDIRECTS) throw notResolved('not_found');
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        headers: { 'user-agent': 'GoGo-link-reader/1.0', accept: 'text/html' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw notResolved('not_found');
    }
    // Không đọc nội dung: huỷ luồng ngay để giải phóng kết nối.
    await res.body?.cancel().catch(() => undefined);

    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) break;
    let next: URL;
    try {
      next = new URL(location, url);
    } catch {
      throw notResolved('not_found');
    }
    // Chuyển hướng sang host ngoài danh sách (hoặc http) thì dừng, không gọi tiếp.
    if (!isAllowedMapsUrl(next)) throw notResolved('not_found');
    url = next;
  }

  const parsed = parseMapsPlace(url);
  if (parsed.lat === null || parsed.lng === null) throw notResolved('no_coordinates');
  return parsed;
}
