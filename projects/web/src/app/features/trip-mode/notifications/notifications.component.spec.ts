import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import type { Notification } from 'shared';
import type { ExpenseTarget } from '../expense/expense-entry-sheet.component';
import { TripModeService } from '../trip-mode.service';
import { NotificationsComponent } from './notifications.component';

const note = (id: string, over: Partial<Notification> = {}): Notification => ({
  id,
  tripId: 't1',
  type: 'rain',
  refId: null,
  payload: {},
  dedupeKey: id,
  readAt: null,
  createdAt: '2026-11-26T03:00:00Z',
  ...over,
});

describe('bảng thông báo', () => {
  function setup(items: Notification[]) {
    const api = jasmine.createSpyObj<TripModeService>('TripModeService', [
      'notifications',
      'markNotificationRead',
      'markAllNotificationsRead',
    ]);
    api.notifications.and.returnValue(of({ items, unreadCount: items.filter((n) => !n.readAt).length }));
    api.markNotificationRead.and.callFake((_trip: string, id: string) =>
      of({ ...items.find((n) => n.id === id)!, readAt: '2026-11-26T04:00:00Z' }),
    );
    TestBed.configureTestingModule({ providers: [{ provide: TripModeService, useValue: api }] });
    const fixture = TestBed.createComponent(NotificationsComponent);
    fixture.componentRef.setInput('tripId', 't1');
    fixture.componentRef.setInput('tz', 'Asia/Ho_Chi_Minh');
    const unread: number[] = [];
    const expenses: ExpenseTarget[] = [];
    fixture.componentInstance.unreadChange.subscribe((n) => unread.push(n));
    fixture.componentInstance.enterExpense.subscribe((t) => expenses.push(t));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const rows = () => Array.from(el.querySelectorAll<HTMLButtonElement>('li button'));
    const dots = () => el.querySelectorAll('[data-unread]').length;
    const tap = (index: number) => {
      rows()[index]!.click();
      fixture.detectChanges();
    };
    return { api, fixture, el, unread, expenses, dots, tap };
  }

  it('chỉ dòng chưa đọc có chấm đỏ; chạm vào thì đánh dấu đã đọc, chạm lại không gọi thêm', () => {
    const s = setup([note('a'), note('b', { readAt: '2026-11-26T03:30:00Z' })]);
    expect(s.dots()).toBe(1);
    s.tap(0);
    expect(s.dots()).toBe(0);
    expect(s.unread.at(-1)).toBe(0);
    s.tap(0);
    expect(s.api.markNotificationRead).toHaveBeenCalledTimes(1);
    expect(s.expenses).toEqual([]);
  });

  it('chạm lời nhắc tiền còn thiếu thì đánh dấu đã đọc và mở ô nhập tiền', () => {
    const s = setup([note('a', { type: 'expense_skipped', refId: 'c1', payload: { label: 'Quán 3' } })]);
    s.tap(0);
    expect(s.unread.at(-1)).toBe(0);
    expect(s.expenses.map((e) => [e.checkinId, e.placeLabel])).toEqual([['c1', 'Quán 3']]);
  });

  it('máy chủ báo lỗi thì chấm đỏ trở lại', () => {
    const s = setup([note('a')]);
    s.api.markNotificationRead.and.returnValue(throwError(() => new Error('mất mạng')));
    s.tap(0);
    expect(s.dots()).toBe(1);
    expect(s.unread.at(-1)).toBe(1);
    expect(s.el.querySelector('[role="alert"]')).not.toBeNull();
  });
});
