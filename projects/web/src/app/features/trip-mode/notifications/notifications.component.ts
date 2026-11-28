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
import type { Notification } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { trapTab } from '../dialog-keys';
import type { ExpenseTarget } from '../expense/expense-entry-sheet.component';
import { SwipeDirective } from '../swipe.directive';
import { notificationText, relativeTime, type SwipeDirection } from '../trip-mode.logic';
import { TripModeService } from '../trip-mode.service';

/** Danh sách thông báo của chuông (FR-26). Lướt trái một thẻ để đánh dấu đã đọc. */
@Component({
  selector: 'app-notifications',
  imports: [SwipeDirective],
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

  constructor() {
    afterNextRender(() => this.panel().nativeElement.querySelector<HTMLElement>('[data-autofocus]')?.focus());
  }

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.error.set('');
    this.api.notifications(this.tripId()).subscribe({
      next: (res) => {
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

  protected onSwipe(direction: SwipeDirection, n: Notification): void {
    if (direction === 'left') this.markRead(n);
  }

  protected markRead(n: Notification): void {
    if (n.readAt) return;
    this.api.markNotificationRead(this.tripId(), n.id).subscribe({
      next: (saved) => {
        this.items.update((list) => list.map((x) => (x.id === saved.id ? saved : x)));
        this.setUnread(Math.max(0, this.unread() - 1));
      },
      error: (err: unknown) => this.error.set(toApiError(err).message),
    });
  }

  protected markAll(): void {
    this.api.markAllNotificationsRead(this.tripId()).subscribe({
      next: () => this.load(),
      error: (err: unknown) => this.error.set(toApiError(err).message),
    });
  }

  protected openExpense(n: Notification): void {
    if (!n.refId) return;
    this.enterExpense.emit({
      checkinId: n.refId,
      placeLabel: String(n.payload['label'] ?? 'Chi tiêu'),
      subtitle: 'Nhập bù',
      amount: null,
      note: '',
    });
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
