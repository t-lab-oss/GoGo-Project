import type { Checkin, Cluster, PlaceImage, PlaceImageResult, Trip, TripPlace } from 'shared';

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
