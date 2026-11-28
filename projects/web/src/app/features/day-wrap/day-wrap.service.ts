import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concatMap, first, forkJoin, from, map, of, switchMap } from 'rxjs';
import type { Moment, TripSummary } from 'shared';
import { TripsApi } from '../../core/api/trips.api';
import { AuthService } from '../../core/auth/auth.service';
import { zonedParts } from '../trip-mode/trip-mode.logic';
import { TripModeService } from '../trip-mode/trip-mode.service';
import { endedDay, isSeen, pickStampPhotos, previousDate, seenKey } from './day-wrap.logic';

export interface DayWrap {
  /** Khoá để nhớ là đã xem. */
  key: string;
  tripId: string;
  tripName: string;
  destination: string;
  date: string;
  index: number;
  visitedCount: number;
  photoCount: number;
  totalSpent: number;
  photos: Moment[];
}

@Injectable({ providedIn: 'root' })
export class DayWrapService {
  private readonly trips = inject(TripsApi);
  private readonly tripMode = inject(TripModeService);
  private readonly auth = inject(AuthService);

  /**
   * Ngày hôm qua của một chuyến mà người dùng chưa xem tổng kết, hoặc null. Lỗi hay mất mạng cũng
   * trả null: đây chỉ là lời mời xem recap, lần kiểm tra sau thử lại.
   */
  find(now: Date): Observable<DayWrap | null> {
    // Chừa 3 ngày vì múi giờ của chuyến có thể lệch với giờ máy.
    const oldest = previousDate(previousDate(previousDate(now.toISOString().slice(0, 10))));
    return this.trips.listTrips().pipe(
      switchMap((all) => from(all.filter((t) => t.status !== 'upcoming' && t.endDate >= oldest))),
      concatMap((trip) => this.wrapOf(trip, now).pipe(catchError(() => of(null)))),
      first((wrap): wrap is DayWrap => wrap !== null, null),
      catchError(() => of(null)),
    );
  }

  private wrapOf(summary: TripSummary, now: Date): Observable<DayWrap | null> {
    return this.trips.getTrip(summary.id).pipe(
      switchMap((trip) => {
        const day = endedDay(trip.days, zonedParts(now, trip.tz).date);
        const key = day && seenKey(this.auth.user()?.id ?? '', trip.id, day.date);
        if (!day || !key || isSeen(key)) return of(null);
        return forkJoin({
          recap: this.trips.dayRecap(trip.id, day.date),
          // Không lấy được ảnh thì vẫn tổng kết, chỉ thiếu tem ảnh.
          moments: this.tripMode.momentsOfDay(trip.id, day.date).pipe(catchError(() => of<Moment[]>([]))),
        }).pipe(
          map(({ recap, moments }): DayWrap | null => {
            // Ngày không ghé đâu, không có ảnh thì không có gì để xem lại.
            if (recap.visits.length === 0 && moments.length === 0) return null;
            return {
              key,
              tripId: trip.id,
              tripName: trip.name,
              destination: trip.destination,
              date: day.date,
              index: day.index,
              visitedCount: recap.visits.length,
              photoCount: moments.length,
              totalSpent: recap.totalSpent,
              photos: pickStampPhotos(moments),
            };
          }),
        );
      }),
    );
  }
}
