import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { Cluster, Trip } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { TripsApi } from '../../../core/api/trips.api';
import { STATUS_LABEL, formatDM, formatVnd } from '../../../core/format';
import { BackLinkComponent } from '../../../ui/back-link.component';
import { BottomSheetComponent } from '../../../ui/bottom-sheet.component';

/** Trang "Chuẩn bị chuyến": thông tin chuyến, thành viên và các cụm quán. */
@Component({
  selector: 'app-trip-detail',
  imports: [RouterLink, FormsModule, BackLinkComponent, BottomSheetComponent],
  templateUrl: './trip-detail.component.html',
})
export class TripDetailComponent {
  private readonly api = inject(TripsApi);
  readonly tripId = inject(ActivatedRoute).snapshot.paramMap.get('tripId') ?? '';

  readonly trip = signal<Trip | null>(null);
  readonly clusters = signal<Cluster[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly showAdd = signal(false);
  readonly newCluster = { name: '', startTime: '08:00', endTime: '10:00' };
  readonly adding = signal(false);
  readonly addError = signal('');

  readonly statusLabel = STATUS_LABEL;
  readonly formatDM = formatDM;
  readonly formatVnd = formatVnd;
  readonly initials = computed(() =>
    (this.trip()?.members ?? []).map((m) => m.username.charAt(0).toUpperCase()),
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.getTrip(this.tripId).subscribe({
      next: (trip) => {
        this.trip.set(trip);
        this.api.listClusters(this.tripId).subscribe({
          next: (items) => {
            this.clusters.set(items);
            this.loading.set(false);
          },
          error: (err) => this.fail(err),
        });
      },
      error: (err) => this.fail(err),
    });
  }

  placeSummary(c: Cluster): string {
    const count = c.placeCount === 0 ? 'chưa có quán' : `${c.placeCount} quán`;
    return `${c.startTime}–${c.endTime} · ${count}`;
  }

  openAdd(): void {
    this.newCluster.name = '';
    this.newCluster.startTime = '08:00';
    this.newCluster.endTime = '10:00';
    this.addError.set('');
    this.showAdd.set(true);
  }

  addCluster(): void {
    this.adding.set(true);
    this.addError.set('');
    this.api.createCluster(this.tripId, this.newCluster).subscribe({
      next: (cluster) => {
        this.clusters.update((list) => [...list, cluster]);
        this.adding.set(false);
        this.showAdd.set(false);
      },
      error: (err) => {
        this.adding.set(false);
        this.addError.set(toApiError(err).message);
      },
    });
  }

  private fail(err: unknown): void {
    this.error.set(toApiError(err).message);
    this.loading.set(false);
  }
}
