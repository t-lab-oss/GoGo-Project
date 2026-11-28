import type { Moment, TripDay } from 'shared';

export interface DayColor {
  /** Màu nền phía trên và phía dưới, đủ đậm để chữ trắng đọc rõ. */
  top: string;
  bottom: string;
  /** Màu nhạt cùng tông cho tem hoạt hoạ. */
  soft: string;
}

export const DAY_COLORS: readonly DayColor[] = [
  { top: '#D6457F', bottom: '#6E1A43', soft: '#FFD6E6' },
  { top: '#1B7FB0', bottom: '#0B3856', soft: '#CDEBFA' },
  { top: '#CF5B17', bottom: '#6E2808', soft: '#FFE0C2' },
  { top: '#178563', bottom: '#083D30', soft: '#CBF0E1' },
  { top: '#6B4FC8', bottom: '#2C1C6B', soft: '#E3DAFF' },
  { top: '#A06B00', bottom: '#4F3000', soft: '#FFECB5' },
  { top: '#C63D32', bottom: '#63150F', soft: '#FFD5CF' },
];

/** Màu của ngày thứ `index` (từ 1). Chuyến dài hơn bảng màu thì quay vòng. */
export function dayColor(index: number): DayColor {
  return DAY_COLORS[(Math.max(1, index) - 1) % DAY_COLORS.length]!;
}

/** "YYYY-MM-DD" của ngày liền trước. */
export function previousDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/** Ngày của chuyến vừa kết thúc khi đã sang `today`: chỉ tính đúng hôm qua. */
export function endedDay(days: readonly TripDay[], today: string): TripDay | null {
  const yesterday = previousDate(today);
  return days.find((d) => d.date === yesterday) ?? null;
}

/** Tối đa `max` ảnh làm tem: ảnh nổi bật trước, còn lại rải đều từ sáng đến tối. */
export function pickStampPhotos(moments: readonly Moment[], max = 5): Moment[] {
  const sorted = [...moments].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  if (sorted.length <= max) return sorted;
  const highlights = sorted.filter((m) => m.isHighlight).slice(0, max);
  const rest = sorted.filter((m) => !highlights.includes(m));
  const need = max - highlights.length;
  const spread = Array.from({ length: need }, (_, i) => rest[Math.floor(((i + 0.5) * rest.length) / need)]!);
  return [...highlights, ...spread];
}

const SEEN_KEY = 'gogo.daywrap.seen';
/** Nhớ tạm khi trình duyệt không cho ghi localStorage. */
const seenInMemory = new Set<string>();

function readSeen(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function seenKey(userId: string, tripId: string, date: string): string {
  return `${userId}:${tripId}:${date}`;
}

export function isSeen(key: string): boolean {
  return seenInMemory.has(key) || readSeen().includes(key);
}

/** Đã xem thì không hiện lại trên máy này. */
export function markSeen(key: string): void {
  seenInMemory.add(key);
  try {
    const list = readSeen().filter((k) => k !== key);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...list, key].slice(-100)));
  } catch {
    // Không lưu được thì chỉ nhớ trong lần mở app này.
  }
}
