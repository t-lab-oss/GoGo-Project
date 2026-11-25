import { isObjectId, type TripStatus } from '../../../../projects/shared/src/public-api';
import { AppError } from '../../lib/app-error';

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_TRIP_DAYS = 30;
export const DEFAULT_TZ = 'Asia/Ho_Chi_Minh';

const DAY_MS = 86_400_000;
const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`);

export function validDate(d: string): boolean {
  if (!DATE_RE.test(d)) return false;
  const t = toUtc(d);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
}

export function dayCountOf(start: string, end: string): number {
  return Math.round((toUtc(end) - toUtc(start)) / DAY_MS) + 1;
}

export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = toUtc(start); t <= toUtc(end); t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Ngày "YYYY-MM-DD" của một thời điểm theo múi giờ chuyến. */
export function dayDateOf(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Giờ "HH:mm" của một thời điểm theo múi giờ chuyến. */
export function timeOf(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function tripStatus(start: string, end: string, today: string): TripStatus {
  if (today < start) return 'upcoming';
  if (today > end) return 'finished';
  return 'ongoing';
}

export function parseObjectId(value: unknown, code: 'TRIP_NOT_FOUND' | 'PLACE_NOT_FOUND' | 'CLUSTER_NOT_FOUND' | 'CHECKIN_NOT_FOUND' | 'USER_NOT_FOUND', message: string): string {
  if (!isObjectId(value)) throw new AppError(404, code, message);
  return value;
}
