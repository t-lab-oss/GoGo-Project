import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TripStatus, TripSummary } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { TripsApi } from '../../../core/api/trips.api';
import { AuthService } from '../../../core/auth/auth.service';
import { STATUS_LABEL, formatDM, gradientFor } from '../../../core/format';

interface Group {
  status: TripStatus;
  title: string;
  trips: TripSummary[];
}

@Component({
  selector: 'app-trip-list',
  imports: [RouterLink],
  templateUrl: './trip-list.component.html',
})
export class TripListComponent {
  private readonly auth = inject(AuthService);
  private readonly api = inject(TripsApi);

  readonly username = computed(() => this.auth.user()?.username ?? '');
  readonly initial = computed(() => this.username().charAt(0).toUpperCase());

  readonly trips = signal<TripSummary[] | null>(null);
  readonly error = signal('');

  readonly groups = computed<Group[]>(() => {
    const all = this.trips() ?? [];
    const defs: [TripStatus, string][] = [
      ['ongoing', 'ĐANG ĐI'],
      ['upcoming', 'SẮP ĐI'],
      ['finished', 'ĐÃ XONG'],
    ];
    return defs
      .map(([status, title]) => ({ status, title, trips: all.filter((t) => t.status === status) }))
      .filter((g) => g.trips.length > 0);
  });

  readonly statusLabel = STATUS_LABEL;
  readonly formatDM = formatDM;
  readonly gradientFor = gradientFor;

  constructor() {
    this.load();
  }

  load(): void {
    this.error.set('');
    this.api.listTrips().subscribe({
      next: (items) => this.trips.set(items),
      error: (err) => this.error.set(toApiError(err).message),
    });
  }

  /** Chuyến đã xong mở recap, các chuyến còn lại mở trang chuẩn bị. */
  linkFor(trip: TripSummary): string[] {
    return trip.status === 'finished' ? ['/trips', trip.id, 'recap'] : ['/trips', trip.id];
  }

  pillClass(status: TripStatus): string {
    if (status === 'ongoing') return 'bg-brand-soft text-brand';
    if (status === 'upcoming') return 'bg-accent-soft text-danger';
    return 'bg-[#EEF1F4] text-muted';
  }
}
