import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of, switchMap, tap } from 'rxjs';
import type { Cluster, TripPlace } from 'shared';
import { toApiError } from '../../core/api/api-error';
import { PlaceCardComponent } from './place-card/place-card.component';
import { PlaceSheetComponent } from './place-sheet/place-sheet.component';
import {
  clusterRange,
  dayNumber,
  findCheckin,
  formatDayLabel,
  formatVnd,
  haversineKm,
  pickActiveCluster,
  sortClusters,
  timeOf,
} from './trip-mode.logic';
import { OutsideTripDaysError, TripModeData, TripModeService } from './trip-mode.service';

/** Khoảng cách giữa hai thẻ (px) và độ rộng thẻ, dùng để đổi vị trí cuộn sang chỉ số thẻ. */
const CARD_WIDTH = 268;
const CARD_GAP = 12;

@Component({
  selector: 'app-trip-mode',
  imports: [RouterLink, PlaceCardComponent, PlaceSheetComponent],
  templateUrl: './trip-mode.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripModeComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(TripModeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private readonly track = viewChild<ElementRef<HTMLElement>>('track');

  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly errorMessage = signal('');
  protected readonly data = signal<TripModeData | null>(null);

  /** Cụm người dùng đang xem. null thì xem cụm đang tới. */
  private readonly selectedClusterId = signal<string | null>(null);
  protected readonly activeIndex = signal(0);
  protected readonly flippedPlaceId = signal<string | null>(null);

  /** Sheet thêm hoặc sửa quán. place = null là thêm mới. */
  protected readonly sheet = signal<{ place: TripPlace | null } | null>(null);
  private sheetOpener: HTMLElement | null = null;

  /** Vị trí thiết bị để tính khoảng cách. Từ chối hoặc lỗi thì giữ null và ẩn khoảng cách. */
  private readonly position = signal<{ lat: number; lng: number } | null>(null);

  protected readonly trip = computed(() => this.data()?.trip ?? null);
  protected readonly clusters = computed(() => sortClusters(this.data()?.clusters ?? []));
  protected readonly selected = computed<Cluster | null>(() => {
    const id = this.selectedClusterId();
    const list = this.clusters();
    return list.find((c) => c.id === id) ?? pickActiveCluster(list);
  });
  protected readonly places = computed(() => this.selected()?.places ?? []);

  protected readonly dayText = computed(() => {
    const d = this.data();
    if (!d) return '';
    const n = dayNumber(d.trip, d.date);
    return `Ngày ${n ?? '?'} / ${d.trip.days.length} · ${formatDayLabel(d.date)}`;
  });
  protected readonly totalSpent = computed(() => formatVnd(this.trip()?.totalSpent ?? 0));

  protected readonly formatRange = clusterRange;

  private rafId = 0;

  /**
   * Thẻ càng xa tâm càng nhỏ, mờ và nghiêng nhẹ theo chiều sâu. Ghi thẳng vào DOM mỗi khung hình
   * (không qua signal) để cuộn mượt, không kích hoạt change detection liên tục.
   */
  private applyCardEffects(): void {
    const el = this.track()?.nativeElement;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const position = el.scrollLeft / (CARD_WIDTH + CARD_GAP);
    el.querySelectorAll<HTMLElement>('[data-card]').forEach((card, i) => {
      const d = i - position;
      const a = Math.min(Math.abs(d), 1);
      const scale = 1 - 0.1 * a;
      card.style.opacity = String(1 - 0.5 * a);
      card.style.transform = reduce
        ? `scale(${scale})`
        : `translateZ(${-60 * a}px) rotateY(${Math.max(-1, Math.min(1, d)) * -16}deg) scale(${scale})`;
    });
  }

  constructor() {
    effect(() => {
      this.places();
      this.status();
      // Đợi DOM dựng xong thẻ mới áp hiệu ứng ban đầu.
      requestAnimationFrame(() => this.applyCardEffects());
    });
    this.destroyRef.onDestroy(() => cancelAnimationFrame(this.rafId));
    this.watchPosition();
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          this.status.set('loading');
          return this.api.load(params.get('id') ?? '').pipe(
            tap((data) => {
              this.data.set(data);
              this.status.set('ready');
            }),
            catchError((err: unknown) => {
              this.errorMessage.set(
                err instanceof OutsideTripDaysError
                  ? 'Hôm nay không nằm trong ngày của chuyến này.'
                  : toApiError(err).message,
              );
              this.status.set('error');
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private watchPosition(): void {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => this.position.set({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => undefined,
      { maximumAge: 30_000, timeout: 20_000, enableHighAccuracy: false },
    );
    this.destroyRef.onDestroy(() => navigator.geolocation.clearWatch(id));
  }

  /** Quán không có toạ độ (địa chỉ viết tay) hoặc chưa có vị trí thiết bị thì không có khoảng cách. */
  protected distanceFor(place: Pick<TripPlace, 'lat' | 'lng'>): number | null {
    const pos = this.position();
    if (!pos || place.lat === null || place.lng === null) return null;
    return haversineKm(pos, { lat: place.lat, lng: place.lng });
  }

  protected openSheet(place: TripPlace | null): void {
    this.sheetOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.sheet.set({ place });
  }

  protected closeSheet(): void {
    this.sheet.set(null);
    const opener = this.sheetOpener;
    this.sheetOpener = null;
    // Trả focus về nút đã mở sheet sau khi sheet gỡ khỏi DOM.
    afterNextRender(() => opener?.isConnected && opener.focus(), { injector: this.injector });
  }

  /** Cập nhật danh sách quán ngay sau khi lưu, không cần tải lại trang. */
  protected onPlaceSaved(saved: TripPlace): void {
    this.data.update((d) =>
      d
        ? {
            ...d,
            clusters: d.clusters.map((c) => {
              const others = (c.places ?? []).filter((p) => p.id !== saved.id);
              const places =
                c.id === saved.clusterId
                  ? [...others, saved].sort((a, b) => a.order - b.order)
                  : others;
              return { ...c, places, placeCount: places.length };
            }),
          }
        : d,
    );
    this.selectedClusterId.set(saved.clusterId);
    this.flippedPlaceId.set(null);
    const index = Math.max(0, this.places().findIndex((p) => p.id === saved.id));
    this.activeIndex.set(index);
    this.closeSheet();
    afterNextRender(
      () => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.track()?.nativeElement.scrollTo({
          left: index * (CARD_WIDTH + CARD_GAP),
          behavior: reduce ? 'auto' : 'smooth',
        });
      },
      { injector: this.injector },
    );
  }

  protected checkinTimeFor(placeId: string): string | null {
    const cluster = this.selected();
    const trip = this.trip();
    if (!cluster || !trip) return null;
    const checkin = findCheckin(cluster, placeId);
    return checkin ? timeOf(checkin.takenAt, trip.tz) : null;
  }

  protected clusterLabel(c: Cluster): string {
    return c.name.replace(/^Ăn\s+/, '');
  }

  protected selectCluster(c: Cluster): void {
    if (c.id === this.selected()?.id) return;
    this.selectedClusterId.set(c.id);
    this.activeIndex.set(0);
    this.flippedPlaceId.set(null);
    this.track()?.nativeElement.scrollTo({ left: 0 });
  }

  protected onTrackScroll(): void {
    const el = this.track()?.nativeElement;
    if (!el) return;
    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = 0;
        this.applyCardEffects();
      });
    }
    const index = Math.round(el.scrollLeft / (CARD_WIDTH + CARD_GAP));
    const clamped = Math.max(0, Math.min(index, this.places().length - 1));
    if (clamped !== this.activeIndex()) {
      this.activeIndex.set(clamped);
      this.flippedPlaceId.set(null);
    }
  }

  /** Chạm thẻ đang giữa thì lật, chạm thẻ bên cạnh thì đưa nó vào giữa. */
  protected onCardTap(placeId: string, index: number): void {
    if (index !== this.activeIndex()) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.track()?.nativeElement.scrollTo({
        left: index * (CARD_WIDTH + CARD_GAP),
        behavior: reduce ? 'auto' : 'smooth',
      });
      return;
    }
    this.flippedPlaceId.update((cur) => (cur === placeId ? null : placeId));
  }
}
