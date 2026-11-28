import { haversineKm } from '../../trip-mode/trip-mode.logic';

/** Điểm làm mốc của bản đồ. */
export interface Anchor {
  lat: number;
  lng: number;
  label: string;
  /** Link Google Maps người dùng đã dán, để sửa lại không phải dán lần nữa. */
  mapsUrl?: string;
}

/** Các bán kính chọn được (km). 0 là hiện tất cả. */
export const RADII = [1, 3, 5, 10, 0] as const;
export const DEFAULT_RADIUS = 3;

export interface AnchorSetting {
  anchor: Anchor | null;
  radiusKm: number;
}

/** Quán nằm trong bán kính quanh mốc. Chưa đặt mốc hoặc chọn "Tất cả" thì giữ nguyên. */
export function withinRadius<T extends { place: { lat: number; lng: number } }>(
  items: T[],
  { anchor, radiusKm }: AnchorSetting,
): T[] {
  if (!anchor || radiusKm === 0) return items;
  return items.filter((i) => haversineKm(anchor, i.place) <= radiusKm);
}

const key = (tripId: string) => `gogo.mapAnchor.${tripId}`;

/** Mốc là lựa chọn riêng trên từng máy. Dữ liệu hỏng hoặc không đọc được thì coi như chưa đặt. */
export function readAnchor(tripId: string): AnchorSetting {
  const empty = { anchor: null, radiusKm: DEFAULT_RADIUS };
  try {
    const saved = JSON.parse(localStorage.getItem(key(tripId)) ?? 'null') as Partial<AnchorSetting> | null;
    const a = saved?.anchor;
    if (!a || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || Math.abs(a.lat) > 90 || Math.abs(a.lng) > 180) {
      return empty;
    }
    return {
      anchor: {
        lat: a.lat,
        lng: a.lng,
        label: String(a.label ?? ''),
        ...(typeof a.mapsUrl === 'string' ? { mapsUrl: a.mapsUrl } : {}),
      },
      radiusKm: (RADII as readonly number[]).includes(saved.radiusKm ?? -1) ? saved.radiusKm! : DEFAULT_RADIUS,
    };
  } catch {
    return empty;
  }
}

export function saveAnchor(tripId: string, setting: AnchorSetting): void {
  try {
    if (setting.anchor) localStorage.setItem(key(tripId), JSON.stringify(setting));
    else localStorage.removeItem(key(tripId));
  } catch {
    // Không lưu được thì lần sau phải đặt lại, bản đồ vẫn dùng bình thường.
  }
}
