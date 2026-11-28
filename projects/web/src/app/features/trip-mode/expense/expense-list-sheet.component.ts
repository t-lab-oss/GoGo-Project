import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { ExpenseItem, ExpensesByDay } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { trapTab } from '../dialog-keys';
import { SwipeDirective } from '../swipe.directive';
import { formatDayLabel, formatVnd } from '../trip-mode.logic';
import { TripModeService } from '../trip-mode.service';
import type { ExpenseTarget } from './expense-entry-sheet.component';

/** Tổng chi cả chuyến và từng khoản theo ngày. Chạm một khoản để nhập bù hoặc sửa. */
@Component({
  selector: 'app-expense-list-sheet',
  imports: [SwipeDirective],
  templateUrl: './expense-list-sheet.component.html',
  styleUrl: './expense-sheet.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseListSheetComponent implements OnInit {
  private readonly api = inject(TripModeService);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  readonly tripId = input.required<string>();
  readonly edit = output<ExpenseTarget>();
  readonly closed = output<void>();

  protected readonly data = signal<ExpensesByDay | null>(null);
  protected readonly error = signal('');
  protected readonly formatVnd = formatVnd;
  protected readonly formatDay = formatDayLabel;

  constructor() {
    afterNextRender(() => this.panel().nativeElement.querySelector<HTMLElement>('[data-autofocus]')?.focus());
  }

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.error.set('');
    this.api.expensesByDay(this.tripId()).subscribe({
      next: (data) => this.data.set(data),
      error: (err: unknown) => this.error.set(toApiError(err).message),
    });
  }

  protected open(item: ExpenseItem): void {
    this.edit.emit({
      checkinId: item.checkinId,
      placeLabel: item.placeLabel,
      subtitle: `${item.clusterName} · Ngày ${item.dayIndex}`,
      amount: item.amount,
      note: item.note ?? '',
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closed.emit();
      return;
    }
    trapTab(this.panel().nativeElement, event);
  }
}
