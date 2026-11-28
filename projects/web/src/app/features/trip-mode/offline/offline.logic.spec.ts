import type { OutboxItem, OutboxOp } from '../../../core/offline/outbox.types';
import type { TripModeData } from '../trip-mode.service';
import { offlineData, pendingReminder, queuedSpent, withQueuedCheckins } from './offline.logic';

const TZ = 'Asia/Ho_Chi_Minh';
const item = (seq: number, op: OutboxOp): OutboxItem => ({
  seq,
  userId: 'u',
  tripId: 't',
  createdAt: '',
  error: null,
  op,
});
const checkinOp: OutboxOp = {
  kind: 'checkin',
  checkinId: 'c1',
  momentId: null,
  placeId: 'p1',
  placeLabel: 'Quán 3',
  clusterId: 'lunch',
  takenAt: '2026-11-26T05:00:00.000Z',
  location: null,
  photo: null,
  rating: 4,
  review: '',
  caption: '',
};
const expenseOp: OutboxOp = { kind: 'expense', checkinId: 'c1', placeLabel: 'Quán 3', amount: 85000, note: '' };

describe('offline.logic', () => {
  const cached = {
    trip: { days: [{ date: '2026-11-26' }, { date: '2026-11-27' }] },
    date: '2026-11-26',
    clusters: [{ id: 'lunch', state: 'done', checkins: [{ id: 'x' }] }],
  } as unknown as TripModeData;

  it('bản lưu hôm khác vẫn xem được quán nhưng chưa check-in; ngoài chuyến thì null', () => {
    expect(offlineData(cached, '2026-11-26')).toBe(cached);
    const next = offlineData(cached, '2026-11-27')!;
    expect(next.clusters[0]!.checkins).toEqual([]);
    expect(next.clusters[0]!.state).toBe('upcoming');
    expect(offlineData(cached, '2026-12-30')).toBeNull();
  });

  it('check-in đang chờ làm cụm thành đã xong, đúng ngày mới tính', () => {
    const clusters = [{ id: 'lunch', state: 'current', checkins: [] }] as never;
    const items = [item(1, checkinOp)];
    expect(withQueuedCheckins(clusters, items, '2026-11-26', TZ)[0]!.state).toBe('done');
    expect(withQueuedCheckins(clusters, items, '2026-11-27', TZ)[0]!.state).toBe('current');
  });

  it('nhắc tiền cho check-in chờ gửi, thôi nhắc khi tiền đã xếp hàng', () => {
    expect(pendingReminder(null, [item(1, checkinOp)], TZ)?.id).toBe('c1');
    const withMoney = [item(1, checkinOp), item(2, expenseOp)];
    expect(pendingReminder(null, withMoney, TZ)).toBeNull();
    expect(pendingReminder({ id: 'c1' } as never, [item(2, expenseOp)], TZ)).toBeNull();
    expect(queuedSpent(withMoney)).toBe(85000);
  });
});
