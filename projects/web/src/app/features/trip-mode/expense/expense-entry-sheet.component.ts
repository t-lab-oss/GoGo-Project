import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toApiError } from '../../../core/api/api-error';
import { trapTab } from '../dialog-keys';
import { SwipeDirective } from '../swipe.directive';
import { formatVnd, pressAmountKey } from '../trip-mode.logic';
import { TripModeService } from '../trip-mode.service';

export interface ExpenseTarget {
  checkinId: string;
  placeLabel: string;
  subtitle: string;
  amount: number | null;
  note: string;
}

/** Nhập tiền bằng bàn phím số lớn (FR-16), dùng cho cả nhắc ở trang chủ lẫn nhập bù. */
@Component({
  selector: 'app-expense-entry-sheet',
  imports: [SwipeDirective],
  templateUrl: './expense-entry-sheet.component.html',
  styleUrl: './expense-sheet.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseEntrySheetComponent implements OnInit {
  private readonly api = inject(TripModeService);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  readonly tripId = input.required<string>();
  readonly target = input.required<ExpenseTarget>();

  readonly saved = output<void>();
  readonly closed = output<void>();

  protected readonly keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];
  protected readonly digits = signal('');
  protected readonly note = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly amountText = computed(() => formatVnd(Number(this.digits() || 0)).replace(/\s*đ$/, ''));

  constructor() {
    afterNextRender(() => this.panel().nativeElement.querySelector<HTMLElement>('[data-autofocus]')?.focus());
  }

  ngOnInit(): void {
    const t = this.target();
    this.digits.set(t.amount ? String(t.amount) : '');
    this.note.set(t.note);
  }

  protected press(key: string): void {
    this.error.set('');
    this.digits.update((d) => pressAmountKey(d, key));
  }

  protected onNote(event: Event): void {
    this.note.set((event.target as HTMLInputElement).value);
  }

  /** Gõ được bằng bàn phím cứng; trong ô ghi chú thì để gõ chữ bình thường. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (!(event.target instanceof HTMLInputElement)) {
      if (/^[0-9]$/.test(event.key)) return this.press(event.key);
      if (event.key === 'Backspace') return this.press('⌫');
    }
    trapTab(this.panel().nativeElement, event);
  }

  protected close(): void {
    if (!this.saving()) this.closed.emit();
  }

  protected save(): void {
    if (this.saving()) return;
    if (this.digits() === '') {
      this.error.set('Hãy nhập số tiền. Nếu không tốn gì, bấm 0.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api.putExpense(this.tripId(), this.target().checkinId, Number(this.digits()), this.note().trim()).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.emit();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(toApiError(err).message);
      },
    });
  }
}
