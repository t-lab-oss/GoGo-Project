import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { isNetworkError } from './network';
import { OfflineDb } from './offline-db';
import { OutboxService } from './outbox.service';
import { OUTBOX_SENDER, type SendResult } from './outbox.sender';
import type { OutboxOp, QueuedCheckin } from './outbox.types';

const offlineError = () => new HttpErrorResponse({ status: 0 });
const apiError = (status: number, code: string) =>
  new HttpErrorResponse({ status, error: { error: { code, message: code } } });

const checkin = (checkinId: string): QueuedCheckin => ({
  kind: 'checkin',
  checkinId,
  momentId: null,
  placeId: 'p',
  placeLabel: 'Quán 3',
  clusterId: 'c',
  takenAt: '2026-11-26T05:00:00.000Z',
  location: null,
  photo: null,
  rating: null,
  review: '',
  caption: '',
});
const expense = (checkinId: string, amount: number): OutboxOp => ({
  kind: 'expense',
  checkinId,
  placeLabel: 'Quán 3',
  amount,
  note: '',
});

describe('OutboxService', () => {
  let outbox: OutboxService;
  let sent: OutboxOp[];
  let reply: (op: OutboxOp) => Promise<SendResult>;
  const user = signal({ id: 'u1', username: 'hany', publicId: 'GG-1' });
  let n = 0;

  beforeEach(async () => {
    sent = [];
    reply = async () => ({});
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user } },
        {
          provide: OUTBOX_SENDER,
          useValue: {
            send: async (_trip: string, op: OutboxOp) => {
              sent.push(op);
              return reply(op);
            },
            ping: async () => true,
          },
        },
      ],
    });
    TestBed.inject(OfflineDb).name = `outbox-test-${Date.now()}-${n++}`;
    outbox = TestBed.inject(OutboxService);
    // Để lượt gửi lúc khởi động chạy xong trước khi test thêm mục.
    TestBed.flushEffects();
    await outbox.flush();
  });

  it('gửi đúng thứ tự tạo rồi làm rỗng hàng đợi', async () => {
    await outbox.enqueue('t', checkin('c1'));
    await outbox.enqueue('t', expense('c1', 5000));
    await outbox.flush();
    expect(sent.map((o) => o.kind)).toEqual(['checkin', 'expense']);
    expect(outbox.items()).toEqual([]);
    expect(outbox.syncedCount()).toBe(2);
  });

  it('mất mạng thì giữ nguyên, có mạng gửi lại không tạo trùng', async () => {
    await outbox.enqueue('t', checkin('c1'));
    reply = async () => Promise.reject(offlineError());
    await outbox.flush();
    expect(outbox.online()).toBeFalse();
    expect(outbox.items().length).toBe(1);
    expect(outbox.items()[0]!.error).toBeNull();
    reply = async () => ({});
    await outbox.flush();
    expect(outbox.items()).toEqual([]);
    expect(sent.map((o) => (o as QueuedCheckin).checkinId)).toEqual(['c1', 'c1']);
  });

  it('số tiền mới thay số tiền cũ đang chờ', async () => {
    await outbox.enqueue('t', expense('c1', 1000));
    await outbox.enqueue('t', expense('c1', 2000));
    expect(outbox.items().map((i) => (i.op as { amount: number }).amount)).toEqual([2000]);
  });

  it('máy chủ từ chối thì đánh dấu lỗi, tiền phụ thuộc được giữ lại; bỏ check-in thì bỏ cả tiền', async () => {
    await outbox.enqueue('t', checkin('c1'));
    await outbox.enqueue('t', expense('c1', 5000));
    reply = async (op) =>
      Promise.reject(op.kind === 'checkin' ? apiError(422, 'DATE_OUT_OF_RANGE') : apiError(404, 'CHECKIN_NOT_FOUND'));
    await outbox.flush();
    expect(outbox.items().map((i) => i.error)).toEqual(['DATE_OUT_OF_RANGE', null]);
    await outbox.discard(outbox.items()[0]!.seq);
    expect(outbox.items()).toEqual([]);
  });

  it('quán đã được người khác check-in thì tiền chuyển sang check-in đó', async () => {
    await outbox.enqueue('t', checkin('c1'));
    await outbox.enqueue('t', expense('c1', 5000));
    reply = async (op) => (op.kind === 'checkin' ? { existingCheckinId: 'other' } : {});
    await outbox.flush();
    expect((sent[1] as { checkinId: string }).checkinId).toBe('other');
  });
});

describe('isNetworkError', () => {
  it('phân biệt mất mạng với máy chủ từ chối', () => {
    expect(isNetworkError(offlineError())).toBeTrue();
    expect(isNetworkError(new HttpErrorResponse({ status: 504 }))).toBeTrue();
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBeTrue();
    expect(isNetworkError(new Error('UPLOAD_FAILED_503'))).toBeTrue();
    expect(isNetworkError(apiError(404, 'PLACE_NOT_FOUND'))).toBeFalse();
    expect(isNetworkError(apiError(502, 'STORAGE_UPSTREAM_ERROR'))).toBeFalse();
    expect(isNetworkError(new Error('UPLOAD_FAILED_400'))).toBeFalse();
  });
});
