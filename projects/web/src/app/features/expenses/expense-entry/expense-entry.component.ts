import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { Checkin } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { TripsApi } from '../../../core/api/trips.api';
import { BackLinkComponent } from '../../../ui/back-link.component';

const MAX_DIGITS = 10;

/** Nhập tiền bằng bàn phím số lớn, dùng cho cả nhập lúc đi lẫn nhập bù sau chuyến. */
@Component({
  selector: 'app-expense-entry',
  imports: [FormsModule, BackLinkComponent],
  templateUrl: './expense-entry.component.html',
})
export class ExpenseEntryComponent {
  private readonly api = inject(TripsApi);
  private readonly router = inject(Router);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;
  readonly tripId = this.params.get('tripId') ?? '';
  readonly checkinId = this.params.get('checkinId') ?? '';

  readonly checkin = signal<Checkin | null>(null);
  readonly digits = signal('');
  note = '';
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly amount = computed(() => (this.digits() === '' ? 0 : Number(this.digits())));
  readonly amountText = computed(() => this.amount().toLocaleString('vi-VN'));
  readonly keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];

  constructor() {
    this.api.listCheckins(this.tripId, { withExpense: true }).subscribe({
      next: (items) => {
        const found = items.find((c) => c.id === this.checkinId) ?? null;
        this.checkin.set(found);
        if (found?.expense) {
          this.digits.set(found.expense.amount === 0 ? '' : String(found.expense.amount));
          this.note = found.expense.note;
        }
        this.loading.set(false);
        if (!found) this.error.set('Không tìm thấy check-in này.');
      },
      error: (err) => {
        this.error.set(toApiError(err).message);
        this.loading.set(false);
      },
    });
  }

  press(key: string): void {
    if (key === '⌫') {
      this.digits.update((d) => d.slice(0, -1));
      return;
    }
    this.digits.update((d) => {
      const next = (d + key).replace(/^0+/, '');
      return next.length > MAX_DIGITS ? d : next;
    });
  }

  save(): void {
    this.saving.set(true);
    this.error.set('');
    this.api.putExpense(this.tripId, this.checkinId, this.amount(), this.note.trim()).subscribe({
      next: () => void this.router.navigate(['/trips', this.tripId, 'expenses']),
      error: (err) => {
        this.saving.set(false);
        this.error.set(toApiError(err).message);
      },
    });
  }
}
