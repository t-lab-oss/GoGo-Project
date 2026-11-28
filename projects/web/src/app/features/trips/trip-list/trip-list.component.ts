import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { TripStatus, TripSummary } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { TripsApi } from '../../../core/api/trips.api';
import { AuthService } from '../../../core/auth/auth.service';
import { STATUS_LABEL, formatDM, gradientFor } from '../../../core/format';
import { TripModeService } from '../../trip-mode/trip-mode.service';
import { AvatarComponent } from '../../../ui/avatar.component';

interface Group {
  status: TripStatus;
  title: string;
  trips: TripSummary[];
}

/**
 * Danh sách chuyến (FR-4). Có chuyến đang đi thì mở thẳng Trip Mode làm trang chủ (FR-12).
 * Các link quay về danh sách kèm `?list=1` để không bị chuyển hướng lại.
 */
@Component({
  selector: 'app-trip-list',
  imports: [RouterLink, AvatarComponent],
  templateUrl: './trip-list.component.html',
})
export class TripListComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly tripMode = inject(TripModeService);
  private readonly api = inject(TripsApi);

  readonly username = computed(() => this.auth.user()?.username ?? '');
  readonly avatarUrl = computed(() => this.auth.user()?.avatarUrl ?? null);

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
    if (!inject(ActivatedRoute).snapshot.queryParamMap.has('list')) this.openOngoingTrip();
  }

  private openOngoingTrip(): void {
    this.tripMode.findOngoingTripId().subscribe({
      next: (id) => {
        if (id) void this.router.navigate(['/trips', id, 'mode'], { replaceUrl: true });
      },
      error: () => {
        // Không tìm được chuyến đang đi thì ở lại danh sách.
      },
    });
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
