import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ExpensesByDay, ExpensesByPlace, Trip } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { TripsApi } from '../../../core/api/trips.api';
import { formatDM, formatVnd, gradientFor } from '../../../core/format';
import { BackLinkComponent } from '../../../ui/back-link.component';

type View = 'place' | 'day';

@Component({
  selector: 'app-expense-list',
  imports: [RouterLink, BackLinkComponent],
  templateUrl: './expense-list.component.html',
})
export class ExpenseListComponent {
  private readonly api = inject(TripsApi);
  readonly tripId = inject(ActivatedRoute).snapshot.paramMap.get('tripId') ?? '';

  readonly trip = signal<Trip | null>(null);
  readonly view = signal<View>('place');
  readonly byPlace = signal<ExpensesByPlace | null>(null);
  readonly byDay = signal<ExpensesByDay | null>(null);
  readonly error = signal('');

  readonly total = computed(
    () => (this.view() === 'place' ? this.byPlace()?.total : this.byDay()?.total) ?? 0,
  );
  readonly missing = computed(() => (this.byPlace() ?? this.byDay())?.missingCount ?? 0);
  readonly loaded = computed(() => this.byPlace() !== null && this.byDay() !== null);

  readonly formatVnd = formatVnd;
  readonly formatDM = formatDM;
  readonly gradientFor = gradientFor;

  constructor() {
    this.load();
  }

  load(): void {
    this.error.set('');
    this.api.getTrip(this.tripId).subscribe({
      next: (trip) => this.trip.set(trip),
      error: (err) => this.error.set(toApiError(err).message),
    });
    this.api.expensesByPlace(this.tripId).subscribe({
      next: (data) => this.byPlace.set(data),
      error: (err) => this.error.set(toApiError(err).message),
    });
    this.api.expensesByDay(this.tripId).subscribe({
      next: (data) => this.byDay.set(data),
      error: (err) => this.error.set(toApiError(err).message),
    });
  }
}
