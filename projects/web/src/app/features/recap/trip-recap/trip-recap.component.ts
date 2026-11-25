import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { Trip, TripRecap } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { TripsApi } from '../../../core/api/trips.api';
import { formatDM, formatVnd } from '../../../core/format';
import { BackLinkComponent } from '../../../ui/back-link.component';

@Component({
  selector: 'app-trip-recap',
  imports: [RouterLink, BackLinkComponent],
  templateUrl: './trip-recap.component.html',
})
export class TripRecapComponent {
  private readonly api = inject(TripsApi);
  readonly tripId = inject(ActivatedRoute).snapshot.paramMap.get('tripId') ?? '';

  readonly trip = signal<Trip | null>(null);
  readonly recap = signal<TripRecap | null>(null);
  readonly error = signal('');

  /** Chi tiêu trung bình mỗi ngày của chuyến. */
  readonly average = computed(() => {
    const r = this.recap();
    return r && r.stats.dayCount > 0 ? Math.round(r.stats.totalSpent / r.stats.dayCount) : 0;
  });

  /** Từng ngày kèm các nơi đã ghé, đánh số liên tục từ đầu chuyến đến cuối chuyến. */
  readonly days = computed(() => {
    const r = this.recap();
    if (!r) return [];
    let n = 0;
    return r.days.map((d) => ({
      ...d,
      percent: r.stats.totalSpent > 0 ? Math.round((d.totalSpent / r.stats.totalSpent) * 100) : 0,
      stops: r.route
        .filter((s) => s.dayDate === d.date)
        .map((s) => ({ ...s, n: ++n, time: this.timeText(s.takenAt) })),
    }));
  });

  readonly formatDM = formatDM;
  readonly formatVnd = formatVnd;

  constructor() {
    this.load();
  }

  load(): void {
    this.error.set('');
    this.api.getTrip(this.tripId).subscribe({
      next: (trip) => this.trip.set(trip),
      error: (err) => this.error.set(toApiError(err).message),
    });
    this.api.recap(this.tripId).subscribe({
      next: (recap) => this.recap.set(recap),
      error: (err) => this.error.set(toApiError(err).message),
    });
  }

  private timeText(iso: string): string {
    return new Date(iso).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
}
