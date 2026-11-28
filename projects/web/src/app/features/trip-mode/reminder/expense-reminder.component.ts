import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { Checkin } from 'shared';
import { ExpenseSaver } from '../expense/expense-saver';
import { formatVnd, pressAmountKey, swipeDirection } from '../trip-mode.logic';

/** Kéo sang phải quá quãng này (px) rồi thả thì bỏ qua lời nhắc. */
const SKIP_DISTANCE = 90;
/** Chưa quá quãng này thì chưa biết là chạm, cuộn hay kéo. */
const DRAG_START = 8;
/** Thời gian thẻ trượt ra khỏi màn hình, khớp với transition trong template. */
const LEAVE_MS = 180;

/** Chuỗi gõ vào thành chuỗi số hợp lệ, cùng quy tắc với bàn phím số của bảng nhập tiền. */
const toDigits = (text: string) => [...text.replace(/\D/g, '')].reduce(pressAmountKey, '');

/**
 * Lời nhắc nhập tiền ở đầu Trip Mode (FR-16): nhập và lưu ngay trên thẻ, lướt phải để bỏ qua.
 * Lúc mới hiện, thẻ rung nhẹ rồi nhích sang phải vài lần để lộ dải "Bỏ qua" cho người dùng biết.
 * Nút "Bỏ qua" dành cho bàn phím, chuột và trình đọc màn hình.
 */
@Component({
  selector: 'app-expense-reminder',
  templateUrl: './expense-reminder.component.html',
  styleUrl: './expense-reminder.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // Màn phía sau cũng nghe thao tác lướt ngang: kéo trên thẻ không được đổi cụm.
    'data-noswipe': '',
    class: 'block touch-pan-y touch-pinch-zoom',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'onPointerCancel()',
  },
})
export class ExpenseReminderComponent {
  private readonly saver = inject(ExpenseSaver);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly tripId = input.required<string>();
  readonly checkin = input.required<Checkin>();

  /** queued = lưu trên máy vì mất mạng. */
  readonly saved = output<{ queued: boolean }>();
  readonly skipped = output<void>();

  protected readonly digits = signal('');
  protected readonly amountText = computed(() =>
    this.digits() === '' ? '' : formatVnd(Number(this.digits())).replace(/\s*đ$/, ''),
  );
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  /** Quãng thẻ đang bị kéo sang phải (px). */
  protected readonly offset = signal(0);
  protected readonly dragging = signal(false);
  protected readonly leaving = signal(false);
  /** Kéo đủ xa, thả tay là bỏ qua. */
  protected readonly armed = computed(() => this.leaving() || this.offset() >= SKIP_DISTANCE);
  /** Người dùng đã chạm vào thẻ thì thôi rung và nhích gợi ý. */
  protected readonly touched = signal(false);
  /** Thẻ nghiêng nhẹ theo quãng kéo, như đang được cầm lên. */
  protected readonly transform = computed(() => {
    if (this.leaving()) return 'translateX(115%) rotate(4deg)';
    const x = this.offset();
    return x ? `translateX(${x}px) rotate(${Math.min(x / 60, 2.5)}deg)` : null;
  });

  private origin: { x: number; y: number; id: number } | null = null;
  private leaveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.leaveTimer));
  }

  protected onInput(event: Event): void {
    const field = event.target as HTMLInputElement;
    this.error.set('');
    this.digits.set(toDigits(field.value));
    // Ghi lại ngay vì giá trị có thể không đổi (gõ chữ), Angular sẽ không tự sửa ô.
    field.value = this.amountText();
  }

  protected save(event: Event): void {
    event.preventDefault();
    if (this.saving() || this.leaving()) return;
    if (this.digits() === '') {
      this.error.set('Hãy nhập số tiền. Nếu không tốn gì, nhập 0.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const { id, placeLabel } = this.checkin();
    this.saver
      .save(this.tripId(), { checkinId: id, placeLabel, amount: Number(this.digits()), note: '' })
      .subscribe({
        next: (result) => this.saved.emit(result),
        error: (err: Error) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }

  /** Trượt thẻ ra ngoài rồi mới báo bỏ qua. */
  protected skip(): void {
    if (this.saving() || this.leaving()) return;
    this.leaving.set(true);
    this.leaveTimer = setTimeout(() => this.skipped.emit(), LEAVE_MS);
  }

  protected onPointerDown(event: PointerEvent): void {
    this.origin = null;
    this.touched.set(true);
    if (!event.isPrimary || this.saving() || this.leaving()) return;
    // Kéo trong ô nhập là để chọn chữ.
    if ((event.target as Element).closest('input')) return;
    this.origin = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  protected onPointerMove(event: PointerEvent): void {
    const from = this.origin;
    if (!from || from.id !== event.pointerId) return;
    const dx = event.clientX - from.x;
    if (!this.dragging()) {
      const direction = swipeDirection(dx, event.clientY - from.y, DRAG_START, DRAG_START);
      if (!direction) return;
      if (direction !== 'right') {
        this.origin = null;
        return;
      }
      this.dragging.set(true);
      // Giữ con trỏ để kéo ra ngoài thẻ vẫn theo, và thả tay không bấm nhầm nút bên dưới.
      this.host.setPointerCapture?.(event.pointerId);
    }
    const wasArmed = this.armed();
    this.offset.set(Math.max(0, dx));
    // Máy hỗ trợ thì rung một cái khi đã kéo đủ xa.
    if (!wasArmed && this.armed()) navigator.vibrate?.(15);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (!this.origin || this.origin.id !== event.pointerId) return;
    const far = this.dragging() && this.armed();
    this.onPointerCancel();
    if (far) this.skip();
  }

  protected onPointerCancel(): void {
    this.origin = null;
    this.dragging.set(false);
    this.offset.set(0);
  }
}
