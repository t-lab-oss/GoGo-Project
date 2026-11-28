import type { Checkin, Cluster, Moment } from 'shared';
import type { OutboxItem, QueuedCheckin, QueuedMoment } from '../../../core/offline/outbox.types';
import { applyCheckin, zonedParts } from '../trip-mode.logic';
import type { TripModeData } from '../trip-mode.service';

/**
 * Dữ liệu đã lưu dùng được cho hôm nay khi mất mạng (FR-18). Lưu hôm nay thì giữ nguyên; lưu hôm khác
 * thì vẫn xem được quán nhưng coi như hôm nay chưa check-in gì. Ngoài ngày chuyến thì null.
 */
export function offlineData(cached: TripModeData, today: string): TripModeData | null {
  if (cached.date === today) return cached;
  if (!cached.trip.days.some((d) => d.date === today)) return null;
  return {
    trip: cached.trip,
    date: today,
    clusters: cached.clusters.map((c) => ({ ...c, checkins: [], state: 'upcoming' as const })),
  };
}

export function queuedCheckinModel(item: OutboxItem, op: QueuedCheckin, tz: string): Checkin {
  return {
    id: op.checkinId,
    tripId: item.tripId,
    clusterId: op.clusterId,
    tripPlaceId: op.placeId,
    placeLabel: op.placeLabel,
    userId: item.userId,
    dayDate: zonedParts(new Date(op.takenAt), tz).date,
    takenAt: op.takenAt,
    lat: op.location?.lat ?? null,
    lng: op.location?.lng ?? null,
    momentId: op.momentId,
    rating: op.rating,
    review: op.review,
    caption: op.caption,
    expenseReminder: { skipCount: 0, movedToBell: false },
  };
}

/** Ảnh đang chờ gửi, hiện bằng link tạm trong trình duyệt. */
export function queuedMomentModel(
  item: OutboxItem,
  op: QueuedCheckin | QueuedMoment,
  url: string,
  username: string,
  tz: string,
): Moment {
  const isCheckin = op.kind === 'checkin';
  return {
    id: op.momentId!,
    tripId: item.tripId,
    user: { id: item.userId, username },
    source: isCheckin ? 'checkin' : 'camera',
    checkinId: isCheckin ? op.checkinId : null,
    tripPlaceId: isCheckin ? op.placeId : (op.place?.id ?? null),
    photoUrl: url,
    thumbUrl: url,
    urlExpiresAt: '9999-12-31T00:00:00.000Z',
    width: op.photo!.width,
    height: op.photo!.height,
    note: isCheckin ? op.caption || op.review : op.note,
    mood: isCheckin ? null : op.mood,
    takenAt: op.takenAt,
    dayDate: zonedParts(new Date(op.takenAt), tz).date,
    lat: op.location?.lat ?? null,
    lng: op.location?.lng ?? null,
    placeLabel: isCheckin ? op.placeLabel : op.placeLabel || null,
    isPrivate: false,
    isHighlight: false,
  };
}

/** Cụm hiển thị = dữ liệu đã có cộng các check-in của ngày đang chờ gửi. */
export function withQueuedCheckins(
  clusters: Cluster[],
  items: readonly OutboxItem[],
  date: string,
  tz: string,
): Cluster[] {
  return items.reduce((result, item) => {
    if (item.op.kind !== 'checkin') return result;
    const checkin = queuedCheckinModel(item, item.op, tz);
    return checkin.dayDate === date ? applyCheckin(result, checkin) : result;
  }, clusters);
}

/**
 * Check-in cần nhắc nhập tiền. Đã có tiền hoặc lời bỏ qua đang chờ gửi thì thôi; check-in mới chụp lúc
 * mất mạng được nhắc trước bản từ máy chủ.
 */
export function pendingReminder(
  fromServer: Checkin | null,
  items: readonly OutboxItem[],
  tz: string,
): Checkin | null {
  const handled = new Set(
    items.flatMap((i) => (i.op.kind === 'expense' || i.op.kind === 'skip' ? [i.op.checkinId] : [])),
  );
  for (let at = items.length - 1; at >= 0; at--) {
    const item = items[at]!;
    if (item.op.kind === 'checkin' && !handled.has(item.op.checkinId)) {
      return queuedCheckinModel(item, item.op, tz);
    }
  }
  return fromServer && !handled.has(fromServer.id) ? fromServer : null;
}

export function queuedSpent(items: readonly OutboxItem[]): number {
  return items.reduce((sum, i) => sum + (i.op.kind === 'expense' ? i.op.amount : 0), 0);
}

export function describeOp(item: OutboxItem): string {
  const op = item.op;
  switch (op.kind) {
    case 'checkin':
      return `Check-in ${op.placeLabel}${op.photo ? ' + ảnh' : ''}`;
    case 'moment':
      return `Khoảnh khắc${op.placeLabel ? ` · ${op.placeLabel}` : ''}`;
    case 'expense':
      return `Chi tiêu · ${op.placeLabel}`;
    case 'skip':
      return `Bỏ qua nhắc tiền · ${op.placeLabel}`;
  }
}
