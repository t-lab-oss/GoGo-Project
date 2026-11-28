import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { formatDM, formatVnd, nowLocal } from '../../core/format';
import { trapTab } from '../trip-mode/dialog-keys';
import { dayColor, markSeen } from './day-wrap.logic';
import { DayWrap, DayWrapService } from './day-wrap.service';
import { StampArtComponent } from './stamp-art.component';

/** App đang mở sẵn qua nửa đêm thì vẫn nhận ra ngày mới. */
const RECHECK_MS = 10 * 60 * 1000;

/**
 * Màn tổng kết khi một ngày của chuyến vừa kết thúc: tem hoạt hoạ ở giữa, ảnh thật làm tem xung
 * quanh, mỗi ngày một màu. Bấm nút nào cũng tính là đã xem và không hiện lại.
 */
@Component({
  selector: 'app-day-wrap',
  imports: [StampArtComponent],
  templateUrl: './day-wrap.component.html',
  styleUrl: './day-wrap.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:visibilitychange)': 'check()' },
})
export class DayWrapComponent {
  private readonly service = inject(DayWrapService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly wrap = signal<DayWrap | null>(null);
  protected readonly color = computed(() => dayColor(this.wrap()?.index ?? 1));
  protected readonly formatDM = formatDM;
  protected readonly formatVnd = formatVnd;
  private checking = false;

  constructor() {
    this.check();
    const timer = setInterval(() => this.check(), RECHECK_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected check(): void {
    if (this.checking || this.wrap() || document.visibilityState === 'hidden') return;
    this.checking = true;
    this.service
      .find(nowLocal())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((wrap) => {
        this.checking = false;
        // Đang mở camera hay bảng nhập liệu thì không chen ngang, lần kiểm tra sau hiện.
        if (!wrap || document.querySelector('[role="dialog"]')) return;
        this.wrap.set(wrap);
        afterNextRender(
          () => this.panel()?.nativeElement.querySelector<HTMLElement>('[data-autofocus]')?.focus(),
          { injector: this.injector },
        );
      });
  }

  protected openRecap(): void {
    const wrap = this.wrap();
    if (!wrap) return;
    this.dismiss();
    void this.router.navigate(['/trips', wrap.tripId, 'recap', wrap.date]);
  }

  protected dismiss(): void {
    const wrap = this.wrap();
    if (wrap) markSeen(wrap.key);
    this.wrap.set(null);
  }

  /** Ảnh không tải được thì bỏ tem đó. */
  protected dropPhoto(id: string): void {
    this.wrap.update((w) => w && { ...w, photos: w.photos.filter((p) => p.id !== id) });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.dismiss();
      return;
    }
    const panel = this.panel()?.nativeElement;
    if (panel) trapTab(panel, event);
  }
}
