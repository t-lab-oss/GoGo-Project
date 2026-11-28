import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import type { Moment, Trip, TripSummary } from 'shared';
import { TripsApi } from '../../core/api/trips.api';
import { AuthService } from '../../core/auth/auth.service';
import { TripModeService } from '../trip-mode/trip-mode.service';
import { dayColor, endedDay, markSeen, pickStampPhotos, seenKey } from './day-wrap.logic';
import { DayWrap, DayWrapService } from './day-wrap.service';

const days = [
  { date: '2026-11-27', index: 1 },
  { date: '2026-11-28', index: 2 },
];

const moment = (id: string, hour: number, isHighlight = false) =>
  ({ id, takenAt: `2026-11-27T${String(hour).padStart(2, '0')}:00:00Z`, isHighlight }) as Moment;

describe('tổng kết ngày', () => {
  beforeEach(() => localStorage.removeItem('gogo.daywrap.seen'));
  afterEach(() => localStorage.removeItem('gogo.daywrap.seen'));

  it('chỉ nhận ngày hôm qua, kể cả sau ngày cuối chuyến', () => {
    expect(endedDay(days, '2026-11-27')).toBeNull();
    expect(endedDay(days, '2026-11-28')?.index).toBe(1);
    expect(endedDay(days, '2026-11-29')?.index).toBe(2);
    expect(endedDay(days, '2026-11-30')).toBeNull();
  });

  it('mỗi ngày một màu, hết bảng màu thì quay vòng', () => {
    expect(dayColor(1)).not.toEqual(dayColor(2));
    expect(dayColor(8)).toEqual(dayColor(1));
  });

  it('lấy tối đa 5 ảnh, giữ ảnh nổi bật và không trùng', () => {
    const list = Array.from({ length: 12 }, (_, i) => moment(`m${i}`, i + 6, i === 11));
    const picked = pickStampPhotos(list);
    expect(picked.length).toBe(5);
    expect(picked[0]!.id).toBe('m11');
    expect(new Set(picked.map((m) => m.id)).size).toBe(5);
  });

  function find(visits: number): DayWrap | null {
    const api = jasmine.createSpyObj<TripsApi>('TripsApi', ['listTrips', 'getTrip', 'dayRecap']);
    api.listTrips.and.returnValue(of([{ id: 't1', status: 'ongoing', endDate: '2026-11-28' } as TripSummary]));
    api.getTrip.and.returnValue(
      of({ id: 't1', name: 'Đà Lạt', destination: 'Đà Lạt', tz: 'Asia/Ho_Chi_Minh', days } as Trip),
    );
    api.dayRecap.and.returnValue(
      of({ date: '2026-11-27', index: 1, totalSpent: 0, visits: Array(visits).fill({}), moments: [] }),
    );
    const tripMode = jasmine.createSpyObj<TripModeService>('TripModeService', ['momentsOfDay']);
    tripMode.momentsOfDay.and.returnValue(of([]));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: TripsApi, useValue: api },
        { provide: TripModeService, useValue: tripMode },
        { provide: AuthService, useValue: { user: () => ({ id: 'u1' }) } },
      ],
    });
    let result: DayWrap | null = null;
    // 00:30 ngày 28 giờ Việt Nam.
    TestBed.inject(DayWrapService)
      .find(new Date('2026-11-27T17:30:00Z'))
      .subscribe((w) => (result = w));
    return result;
  }

  it('hiện sau nửa đêm theo múi giờ chuyến, đã xem rồi thì thôi', () => {
    expect(find(2)!.date).toBe('2026-11-27');
    markSeen(seenKey('u1', 't1', '2026-11-27'));
    expect(find(2)).toBeNull();
  });

  it('ngày không có gì thì không hiện', () => {
    expect(find(0)).toBeNull();
  });
});
