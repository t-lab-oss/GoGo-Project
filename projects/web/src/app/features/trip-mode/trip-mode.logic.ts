import type { Notification, Mood, Moment, Checkin, Cluster, PlaceImage, PlaceImageResult, Trip, TripPlace } from 'shared';

const WEEKDAYS = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];

/** Ngày "YYYY-MM-DD" và giờ "HH:mm" của một thời điểm theo múi giờ của chuyến. */
export function zonedParts(now: Date, tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Sắp cụm theo giờ bắt đầu (thiết kế xếp theo giờ), cùng giờ thì theo `order`. */
export function sortClusters(clusters: readonly Cluster[]): Cluster[] {
  return [...clusters].sort(
    (a, b) => toMinutes(a.startTime) - toMinutes(b.startTime) || a.order - b.order,
  );
}

/** Cụm hiển thị mặc định: đang tới, không có thì cụm sắp tới đầu tiên, không có nữa thì cụm cuối. */
export function pickActiveCluster(sorted: readonly Cluster[]): Cluster | null {
  return (
    sorted.find((c) => c.state === 'current') ??
    sorted.find((c) => c.state === 'upcoming') ??
    sorted[sorted.length - 1] ??
    null
  );
}

/** Số thứ tự ngày trong chuyến (1..N), hoặc null nếu ngày nằm ngoài chuyến. */
export function dayNumber(trip: Pick<Trip, 'days'>, date: string): number | null {
  return trip.days.find((d) => d.date === date)?.index ?? null;
}

/** "Thứ Hai, 23/11" */
export function formatDayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return `${WEEKDAYS[weekday]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** "240.000 đ" */
export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)} đ`;
}

/** Nhãn khoảng giờ của cụm: "11:00–14:00". */
export function clusterRange(c: Pick<Cluster, 'startTime' | 'endTime'>): string {
  return `${c.startTime}–${c.endTime}`;
}

/** Nhận ra chuỗi người dùng gõ vào ô Địa chỉ là link (chứ không phải địa chỉ viết tay). */
export function looksLikeLink(text: string): boolean {
  return /^(https?:\/\/|www\.|maps\.app\.goo\.gl|goo\.gl\/|(www\.)?google\.[a-z.]+\/maps|maps\.google\.)/i.test(
    text.trim(),
  );
}

/** Thêm https:// cho link dán thiếu giao thức, vì server chỉ nhận https. */
export function normalizeLink(text: string): string {
  const t = text.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/**
 * Link chỉ đường: ưu tiên link Google Maps người dùng đã lưu, rồi đến toạ độ, cuối cùng là tìm
 * trên Google Maps theo địa chỉ viết tay (không có địa chỉ thì theo tên quán).
 */
export function directionsUrl(
  place: Pick<TripPlace, 'mapsUrl' | 'lat' | 'lng' | 'address' | 'label'>,
): string {
  if (place.mapsUrl) return place.mapsUrl;
  if (place.lat !== null && place.lng !== null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
  }
  const query = place.address.trim() || place.label;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Check-in của quán trong cụm hôm nay (nếu có). */
export function findCheckin(cluster: Pick<Cluster, 'checkins'>, placeId: string): Checkin | null {
  return cluster.checkins?.find((c) => c.tripPlaceId === placeId) ?? null;
}

/** Ghi check-in mới vào dữ liệu đang hiển thị: cụm đó chuyển "đã xong" ngay, không đợi tải lại. */
export function applyCheckin(clusters: readonly Cluster[], checkin: Checkin): Cluster[] {
  return clusters.map((c) =>
    c.id === checkin.clusterId
      ? {
          ...c,
          state: 'done',
          checkins: [...(c.checkins ?? []).filter((k) => k.id !== checkin.id), checkin],
        }
      : c,
  );
}

/** Giờ "HH:mm" của một thời điểm ISO theo múi giờ chuyến. */
export function timeOf(iso: string, tz: string): string {
  return zonedParts(new Date(iso), tz).time;
}

/** Gradient thay ảnh khi quán chưa có ảnh, ổn định theo vị trí thẻ. */
const GRADIENTS = [
  'linear-gradient(160deg,#FFB3CF,#17709F)',
  'linear-gradient(160deg,#9FD3EE,#0E4F75)',
  'linear-gradient(160deg,#FFD0E1,#3C8FBF)',
];
export function placeGradient(index: number): string {
  return GRADIENTS[index % GRADIENTS.length]!;
}

/** Khoảng cách đường chim bay giữa hai toạ độ, đơn vị km (công thức haversine). */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "850 m", "1,4 km", "12 km". */
export function formatDistance(km: number): string {
  if (km < 0.05) return '< 50 m';
  if (km < 1) return `${Math.round((km * 1000) / 10) * 10} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

/** Kết quả tìm ảnh thành ảnh lưu cùng quán, kèm tác giả, giấy phép và link nguồn của Wikimedia Commons. */
export function toPlaceImage(r: PlaceImageResult): PlaceImage {
  return {
    url: r.imageUrl,
    author: r.author,
    license: r.license,
    ...(r.licenseUrl ? { licenseUrl: r.licenseUrl } : {}),
    sourceUrl: r.sourceUrl,
  };
}

/** Kết quả tìm ảnh này có đang là ảnh đã chọn của quán không. */
export function isSelectedImage(selected: PlaceImage | null, r: PlaceImageResult): boolean {
  return selected !== null && selected.url === r.imageUrl;
}

/**
 * Ảnh chụp của một check-in: ảnh gắn lúc check-in, không có thì ảnh mới nhất mà thành viên khác
 * gửi kèm check-in đó. Check-in không ảnh thì null.
 */
export function checkinMoment(
  moments: readonly Moment[],
  checkin: Pick<Checkin, 'id' | 'momentId'>,
): Moment | null {
  return (
    moments.find((m) => m.id === checkin.momentId) ??
    moments.find((m) => m.checkinId === checkin.id) ??
    null
  );
}

/** Phần trăm tô của từng ngôi sao trong dãy 5 sao, hỗ trợ nửa sao. */
export function starFills(value: number): number[] {
  return [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, value - i)) * 100);
}

/** Số sao ứng với vị trí chạm (0 là mép trái, 1 là mép phải), làm tròn lên nửa sao. */
export function ratingFromPosition(fraction: number): number {
  return Math.max(0.5, Math.min(5, Math.ceil(fraction * 10) / 2));
}

export function formatStars(value: number): string {
  return String(value).replace('.', ',');
}

/** Lời nhận xét ngắn ứng với số sao đang chấm. */
export function ratingWord(value: number): string {
  if (value <= 1.5) return 'Chưa ổn';
  if (value <= 2.5) return 'Tạm được';
  if (value <= 3.5) return 'Khá ổn';
  if (value <= 4.5) return 'Rất thích';
  return 'Tuyệt vời';
}

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

/** Hướng lướt nếu đủ dài và nghiêng rõ về một trục, ngược lại null (coi như chạm hoặc kéo chéo). */
export function swipeDirection(dx: number, dy: number, minX: number, minY: number): SwipeDirection | null {
  const x = Math.abs(dx);
  const y = Math.abs(dy);
  if (x >= minX && x > y * 1.3) return dx < 0 ? 'left' : 'right';
  if (y >= minY && y > x * 1.3) return dy < 0 ? 'up' : 'down';
  return null;
}

const MAX_AMOUNT = 1_000_000_000;

/** Bấm một phím số: nối chữ số, bỏ số 0 thừa ở đầu, không vượt quá giới hạn số tiền. */
export function pressAmountKey(digits: string, key: string): string {
  if (key === '⌫') return digits.slice(0, -1);
  const joined = digits + key;
  const next = joined.replace(/^0+(?=\d)/, '').replace(/^0+$/, '0');
  return Number(next) > MAX_AMOUNT ? digits : next;
}

export const MOODS: readonly { value: Mood; label: string }[] = [
  { value: 'happy', label: 'Vui' },
  { value: 'excited', label: 'Wow' },
  { value: 'relaxed', label: 'Chill' },
  { value: 'tired', label: 'Mệt' },
  { value: 'sad', label: 'Buồn' },
];

/** Bán kính coi là "đang ở quán" khi tự gắn địa điểm cho khoảnh khắc. */
export const NEARBY_KM = 0.2;

/** Quán gần vị trí nhất trong bán kính, hoặc null. */
export function nearestPlace(
  places: readonly TripPlace[],
  position: { lat: number; lng: number } | null,
  maxKm = NEARBY_KM,
): TripPlace | null {
  if (!position) return null;
  let best: TripPlace | null = null;
  let bestKm = maxKm;
  for (const p of places) {
    if (p.lat === null || p.lng === null) continue;
    const km = haversineKm(position, { lat: p.lat, lng: p.lng });
    if (km <= bestKm) {
      best = p;
      bestKm = km;
    }
  }
  return best;
}

/** Gom ảnh (đã sắp mới nhất trước) theo ngày, giữ nguyên thứ tự. */
export function groupByDay<T extends { dayDate: string }>(items: readonly T[]): { date: string; items: T[] }[] {
  const groups: { date: string; items: T[] }[] = [];
  for (const item of items) {
    const group = groups.find((g) => g.date === item.dayDate);
    if (group) group.items.push(item);
    else groups.push({ date: item.dayDate, items: [item] });
  }
  return groups;
}

/** Tiêu đề, nội dung của một thông báo; needsAmount = chạm vào thì mở ô nhập tiền. */
export function notificationText(n: Pick<Notification, 'type' | 'payload'>): {
  title: string;
  body: string;
  needsAmount: boolean;
} {
  const label = String(n.payload['label'] ?? 'quán');
  switch (n.type) {
    case 'expense_skipped': {
      const amount = n.payload['amount'];
      return typeof amount === 'number'
        ? { title: label, body: `Đã nhập ${formatVnd(amount)}.`, needsAmount: false }
        : {
            title: `Thêm số tiền cho ${label}`,
            body: 'Chạm để nhập số tiền.',
            needsAmount: true,
          };
    }
    case 'rain':
      return { title: 'Trời có thể mưa', body: 'Nên chọn những quán có mái hiên.', needsAmount: false };
    case 'closing_soon':
      return { title: `${label} sắp đóng cửa`, body: 'Đi sớm kẻo lỡ.', needsAmount: false };
    case 'closed_early':
      return { title: `${label} đóng cửa sớm`, body: 'Quán đóng trước khi hết giờ của cụm.', needsAmount: false };
    case 'closed':
      return { title: `${label} đã đóng cửa`, body: 'Chọn quán khác trong cụm.', needsAmount: false };
  }
}

/** "HH:mm" nếu cùng ngày (theo múi giờ chuyến), "Hôm qua", còn lại "dd/MM". */
export function relativeTime(iso: string, now: Date, tz: string): string {
  const then = zonedParts(new Date(iso), tz);
  const today = zonedParts(now, tz).date;
  if (then.date === today) return then.time;
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (then.date === yesterday) return 'Hôm qua';
  const [, month, day] = then.date.split('-');
  return `${day}/${month}`;
}

