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
import type { Moment, TripDay } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { trapTab } from '../dialog-keys';
import { SwipeDirective } from '../swipe.directive';
import { MOODS, formatDayLabel, groupByDay, timeOf, type SwipeDirection } from '../trip-mode.logic';
import { TripModeService } from '../trip-mode.service';

/** Album chung (FR-28): ảnh vuông theo ngày; chạm để xem to, lướt ngang qua ảnh khác. */
@Component({
  selector: 'app-album',
  imports: [SwipeDirective],
  templateUrl: './album.component.html',
  styleUrl: './album.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlbumComponent implements OnInit {
  private readonly api = inject(TripModeService);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  readonly tripId = input.required<string>();
  readonly tripDays = input.required<readonly TripDay[]>();
  readonly tz = input.required<string>();
  readonly userId = input.required<string>();
  readonly isOwner = input(false);

  readonly changed = output<void>();
  readonly closed = output<void>();

  protected readonly items = signal<Moment[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');
  protected readonly groups = computed(() => groupByDay(this.items()));

  /** Ảnh đang xem to. */
  private readonly viewingId = signal<string | null>(null);
  protected readonly viewing = computed(() => this.items().find((m) => m.id === this.viewingId()) ?? null);
  protected readonly position = computed(() => this.items().findIndex((m) => m.id === this.viewingId()));
  protected readonly canDelete = computed(() => this.isOwner() || this.viewing()?.user.id === this.userId());

  protected readonly mode = signal<'view' | 'edit' | 'delete'>('view');
  protected readonly note = signal('');
  protected readonly place = signal('');
  protected readonly busy = signal(false);
  protected readonly actionError = signal('');

  private retriedExpired = false;

  constructor() {
    afterNextRender(() => this.panel().nativeElement.querySelector<HTMLElement>('[data-autofocus]')?.focus());
  }

  ngOnInit(): void {
    this.load(true);
  }

  protected load(reset = false): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.api.album(this.tripId(), reset ? null : this.cursor()).subscribe({
      next: (page) => {
        this.items.update((list) => (reset ? page.items : [...list, ...page.items]));
        this.cursor.set(page.nextCursor);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(toApiError(err).message);
      },
    });
  }

  /** Cuộn gần đáy thì tải trang tiếp. */
  protected onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (this.cursor() && !this.error() && el.scrollHeight - el.scrollTop - el.clientHeight < 300) this.load();
  }

  /** Link ảnh hết hạn (khoảng 1 giờ) thì tải lại một lần. */
  protected onImageError(m: Moment): void {
    if (this.retriedExpired || Date.parse(m.urlExpiresAt) > Date.now()) return;
    this.retriedExpired = true;
    this.load(true);
  }

  protected dayTitle(date: string): string {
    const day = this.tripDays().find((d) => d.date === date);
    return `${day ? `Ngày ${day.index} · ` : ''}${formatDayLabel(date)}`;
  }

  protected timeText(m: Moment): string {
    return timeOf(m.takenAt, this.tz());
  }

  protected moodLabel(m: Moment): string {
    return MOODS.find((x) => x.value === m.mood)?.label ?? '';
  }

  protected open(m: Moment): void {
    this.viewingId.set(m.id);
    this.resetActions();
    this.focus('#al-viewer-close');
  }

  protected closeViewer(): void {
    const id = this.viewingId();
    this.viewingId.set(null);
    this.resetActions();
    this.focus(`[data-moment="${id}"]`);
  }

  protected step(delta: number): void {
    const next = this.items()[this.position() + delta];
    if (!next) return;
    this.viewingId.set(next.id);
    this.resetActions();
    if (this.cursor() && this.position() >= this.items().length - 3) this.load();
  }

  protected onViewerSwipe(direction: SwipeDirection): void {
    if (this.mode() !== 'view') return;
    if (direction === 'left') this.step(1);
    else if (direction === 'right') this.step(-1);
    else if (direction === 'down') this.closeViewer();
  }

  protected startEdit(): void {
    const m = this.viewing();
    if (!m) return;
    this.note.set(m.note);
    this.place.set(m.placeLabel ?? '');
    this.mode.set('edit');
    this.focus('#al-note');
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected saveEdit(): void {
    const m = this.viewing();
    if (!m || this.busy()) return;
    this.busy.set(true);
    this.actionError.set('');
    const changes = { note: this.note().trim(), placeLabel: this.place().trim() };
    this.api.updateMoment(this.tripId(), m.id, changes).subscribe({
      next: (updated) => {
        this.items.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
        this.resetActions();
        this.changed.emit();
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  protected remove(): void {
    const m = this.viewing();
    if (!m || this.busy()) return;
    this.busy.set(true);
    this.actionError.set('');
    this.api.deleteMoment(this.tripId(), m.id).subscribe({
      next: () => {
        const at = this.position();
        this.items.update((list) => list.filter((x) => x.id !== m.id));
        this.resetActions();
        const next = this.items()[Math.min(at, this.items().length - 1)];
        this.viewingId.set(next?.id ?? null);
        this.focus(next ? '#al-viewer-close' : '[data-autofocus]');
        this.changed.emit();
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  protected resetActions(): void {
    this.mode.set('view');
    this.busy.set(false);
    this.actionError.set('');
  }

  private fail(err: unknown): void {
    this.busy.set(false);
    this.actionError.set(toApiError(err).message);
  }

  private focus(selector: string): void {
    setTimeout(() => this.panel().nativeElement.querySelector<HTMLElement>(selector)?.focus(), 0);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const viewing = this.viewing() !== null;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.mode() !== 'view') this.resetActions();
      else if (viewing) this.closeViewer();
      else this.closed.emit();
      return;
    }
    if (viewing && this.mode() === 'view' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      this.step(event.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    trapTab(this.panel().nativeElement, event);
  }
}
