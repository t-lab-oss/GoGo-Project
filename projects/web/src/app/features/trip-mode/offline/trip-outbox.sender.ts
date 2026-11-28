import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import type { OutboxSender, SendResult } from '../../../core/offline/outbox.sender';
import type { OutboxOp } from '../../../core/offline/outbox.types';
import { CheckinSubmission } from '../camera/checkin-submission';
import { MomentSubmission } from '../camera/moment-submission';
import { TripModeService } from '../trip-mode.service';

/** Gửi việc đang chờ bằng đúng các lệnh dùng khi có mạng, giữ nguyên ID đã sinh. */
@Injectable({ providedIn: 'root' })
export class TripOutboxSender implements OutboxSender {
  private readonly api = inject(TripModeService);
  private readonly http = inject(HttpClient);

  async send(tripId: string, op: OutboxOp): Promise<SendResult> {
    switch (op.kind) {
      case 'checkin': {
        const submission = new CheckinSubmission(this.api, {
          tripId,
          placeId: op.placeId,
          takenAt: new Date(op.takenAt),
          photo: op.photo,
          location: Promise.resolve(op.location),
          checkinId: op.checkinId,
          momentId: op.momentId,
        });
        submission.rating = op.rating;
        submission.review = op.review;
        submission.caption = op.caption;
        const outcome = await submission.submit();
        return 'existingCheckinId' in outcome ? { existingCheckinId: outcome.existingCheckinId } : {};
      }
      case 'moment': {
        const submission = new MomentSubmission(this.api, {
          tripId,
          place: op.place,
          takenAt: new Date(op.takenAt),
          photo: op.photo,
          location: Promise.resolve(op.location),
          momentId: op.momentId,
        });
        submission.note = op.note;
        submission.mood = op.mood;
        submission.placeLabel = op.placeLabel;
        await submission.submit();
        return {};
      }
      case 'expense':
        await firstValueFrom(this.api.putExpense(tripId, op.checkinId, op.amount, op.note));
        return {};
      case 'skip':
        await firstValueFrom(this.api.skipExpenseReminder(tripId, op.checkinId, op.skipCount).pipe(timeout(30_000)));
        return {};
    }
  }

  async ping(): Promise<boolean> {
    try {
      await firstValueFrom(this.http.get('/api/health').pipe(timeout(8000)));
      return true;
    } catch {
      return false;
    }
  }
}
