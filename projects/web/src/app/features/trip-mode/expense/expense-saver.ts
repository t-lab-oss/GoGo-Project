import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, switchMap, tap, throwError } from 'rxjs';
import { toApiError } from '../../../core/api/api-error';
import { isNetworkError } from '../../../core/offline/network';
import { OutboxService } from '../../../core/offline/outbox.service';
import { TripModeService } from '../trip-mode.service';

export interface ExpenseInput {
  checkinId: string;
  placeLabel: string;
  amount: number;
  note: string;
}

/** Lưu một khoản chi, dùng chung cho bảng nhập tiền và thẻ nhắc ở đầu Trip Mode. */
@Injectable({ providedIn: 'root' })
export class ExpenseSaver {
  private readonly api = inject(TripModeService);
  private readonly outbox = inject(OutboxService);

  /**
   * queued = true khi lưu trên máy để gửi sau (mất mạng, hoặc check-in còn chờ gửi).
   * Lỗi trả về luôn là Error có câu chữ hiện thẳng cho người dùng được.
   */
  save(tripId: string, input: ExpenseInput): Observable<{ queued: boolean }> {
    // Check-in còn chờ gửi thì tiền phải xếp sau nó.
    if (this.outbox.hasCheckin(input.checkinId)) return this.queue(tripId, input);
    return this.api.putExpense(tripId, input.checkinId, input.amount, input.note).pipe(
      map(() => ({ queued: false })),
      catchError((err: unknown) => {
        if (!isNetworkError(err)) return throwError(() => new Error(toApiError(err).message));
        this.outbox.markOffline();
        return this.queue(tripId, input);
      }),
    );
  }

  private queue(tripId: string, input: ExpenseInput): Observable<{ queued: boolean }> {
    return from([input]).pipe(
      switchMap((i) => this.outbox.enqueue(tripId, { kind: 'expense', ...i })),
      catchError(() =>
        throwError(() => new Error('Máy chưa lưu được khoản chi. Hãy kiểm tra mạng rồi thử lại.')),
      ),
      tap(() => void this.outbox.flush()),
      map(() => ({ queued: true })),
    );
  }
}
