import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { Notification } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { trapTab } from '../dialog-keys';
import type { ExpenseTarget } from '../expense/expense-entry-sheet.component';
import { notificationText, relativeTime } from '../trip-mode.logic';
import { TripModeService } from '../trip-mode.service';

/**
 * Bảng thông báo xổ ra dưới chuông (FR-26). Chưa đọc thì có chấm đỏ, chạm vào một dòng là đánh dấu
 * đã đọc; dòng nhắc tiền còn thiếu thì mở luôn ô nhập tiền.
 */
@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent implements OnInit {
  private readonly api = inject(TripModeService);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  readonly tripId = input.required<string>();
  readonly tz = input.required<string>();

  readonly enterExpense = output<ExpenseTarget>();
  /** Số chưa đọc đổi, để chấm đỏ trên chuông cập nhật. */
  readonly unreadChange = output<number>();
  readonly closed = output<void>();

  protected readonly items = signal<Notification[]>([]);
  protected readonly unread = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');

  /** Bảng có thể đã đóng khi máy chủ trả lời, lúc đó không phát output nữa. */
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    afterNextRender(() => this.panel().nativeElement.focus());
  }

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.error.set('');
    this.api.notifications(this.tripId()).subscribe({
      next: (res) => {
        if (this.destroyed) return;
        this.items.set(res.items);
        this.setUnread(res.unreadCount);
        this.loaded.set(true);
      },
      error: (err: unknown) => this.error.set(toApiError(err).message),
    });
  }

  protected text(n: Notification) {
    return notificationText(n);
  }

  protected when(n: Notification): string {
    return relativeTime(n.createdAt, new Date(), this.tz());
  }

  protected open(n: Notification): void {
    this.markRead(n);
    if (!notificationText(n).needsAmount || !n.refId) return;
    this.enterExpense.emit({
      checkinId: n.refId,
      placeLabel: String(n.payload['label'] ?? 'Chi tiêu'),
      subtitle: 'Nhập bù',
      amount: null,
      note: '',
    });
  }

  /** Đổi giao diện ngay, máy chủ báo lỗi thì trả lại như cũ. */
  private markRead(n: Notification): void {
    if (n.readAt) return;
    this.error.set('');
    this.replace({ ...n, readAt: new Date().toISOString() });
    this.setUnread(Math.max(0, this.unread() - 1));
    this.api.markNotificationRead(this.tripId(), n.id).subscribe({
      next: (saved) => this.replace(saved),
      error: (err: unknown) => {
        if (this.destroyed) return;
        this.replace(n);
        this.setUnread(this.unread() + 1);
        this.error.set(toApiError(err).message);
      },
    });
  }

  protected markAll(): void {
    this.api.markAllNotificationsRead(this.tripId()).subscribe({
      next: () => {
        if (!this.destroyed) this.load();
      },
      error: (err: unknown) => this.error.set(toApiError(err).message),
    });
  }

  private replace(saved: Notification): void {
    this.items.update((list) => list.map((x) => (x.id === saved.id ? saved : x)));
  }

  private setUnread(count: number): void {
    this.unread.set(count);
    this.unreadChange.emit(count);
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
