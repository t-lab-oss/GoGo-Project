import type { TripDay, TripStatus } from '../../../projects/shared/src/public-api';

const DAY_MS = 24 * 60 * 60 * 1000;

function parts(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  return map;
}

/** "YYYY-MM-DD" theo múi giờ của chuyến. */
export function dateIn(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${p['year']}-${p['month']}-${p['day']}`;
}

/** "HH:mm" theo múi giờ của chuyến. */
export function timeIn(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${p['hour']}:${p['minute']}`;
}

export function addDays(date: string, n: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function buildDays(startDate: string, endDate: string): TripDay[] {
  const count = diffDays(startDate, endDate) + 1;
  return Array.from({ length: count }, (_, i) => ({ date: addDays(startDate, i), index: i + 1 }));
}

export function tripStatus(startDate: string, endDate: string, today: string): TripStatus {
  if (today < startDate) return 'upcoming';
  if (today > endDate) return 'finished';
  return 'ongoing';
}
