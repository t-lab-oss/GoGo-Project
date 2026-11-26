import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type { DayRecap } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { TripsApi } from '../../../core/api/trips.api';
import { formatDM, formatVnd } from '../../../core/format';
import { BackLinkComponent } from '../../../ui/back-link.component';

@Component({
  selector: 'app-day-recap',
  imports: [BackLinkComponent],
  templateUrl: './day-recap.component.html',
})
export class DayRecapComponent {
  private readonly api = inject(TripsApi);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;
  readonly tripId = this.params.get('tripId') ?? '';
  readonly date = this.params.get('date') ?? '';

  readonly recap = signal<DayRecap | null>(null);
  readonly error = signal('');

  readonly formatDM = formatDM;
  readonly formatVnd = formatVnd;

  constructor() {
    this.load();
  }

  load(): void {
    this.error.set('');
    this.api.dayRecap(this.tripId, this.date).subscribe({
      next: (recap) => this.recap.set(recap),
      error: (err) => this.error.set(toApiError(err).message),
    });
  }
}
