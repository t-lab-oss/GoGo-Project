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
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of, switchMap, tap } from 'rxjs';
import type { Checkin, Cluster, Moment, TripPlace } from 'shared';
import { toApiError } from '../../core/api/api-error';
import { CameraComponent, type PhotoFlight } from './camera/camera.component';
import type { CheckinOutcome } from './camera/checkin-submission';
import { PlaceCardComponent } from './place-card/place-card.component';
import { PlaceSheetComponent } from './place-sheet/place-sheet.component';
import {
  applyCheckin,
  checkinMoment,
  clusterRange,
  dayNumber,
  findCheckin,
  nearestPlace,
  formatDayLabel,
  formatVnd,
  haversineKm,
  pickActiveCluster,
  sortClusters,
  timeOf,
  zonedParts,
  type SwipeDirection,
} from './trip-mode.logic';
import { SwipeDirective } from './swipe.directive';
import { ExpenseEntrySheetComponent, type ExpenseTarget } from './expense/expense-entry-sheet.component';
import { ExpenseListSheetComponent } from './expense/expense-list-sheet.component';
import { AlbumComponent } from './album/album.component';
import { NotificationsComponent } from './notifications/notifications.component';
import { isNetworkError } from '../../core/offline/network';
import { OutboxService } from '../../core/offline/outbox.service';
import { OfflineBannerComponent } from './offline/offline-banner.component';
import { pendingReminder, queuedMomentModel, queuedSpent, withQueuedCheckins } from './offline/offline.logic';
import { AuthService } from '../../core/auth/auth.service';
import { OutsideTripDaysError, TripModeData, TripModeService } from './trip-mode.service';

/** Khoảng cách giữa hai thẻ (px) và độ rộng thẻ, dùng để đổi vị trí cuộn sang chỉ số thẻ. */
const CARD_WIDTH = 268;
const CARD_GAP = 12;

@Component({
  selector: 'app-trip-mode',
  imports: [RouterLink, PlaceCardComponent, PlaceSheetComponent, CameraComponent, SwipeDirective, ExpenseEntrySheetComponent, ExpenseListSheetComponent, AlbumComponent, NotificationsComponent, OfflineBannerComponent],
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

  /** Màn camera check-in đang mở cho quán nào. */
  protected readonly camera = signal<{
    mode: 'checkin' | 'moment';
    placeId: string;
    placeName: string;
    clusterName: string;
    clusterId: string | null;
  } | null>(null);
  protected readonly albumOpen = signal(false);
  private albumOpener: HTMLElement | null = null;
  private readonly auth = inject(AuthService);
  protected readonly userId = computed(() => this.auth.user()?.id ?? '');
  private cameraOpener: HTMLElement | null = null;
  /** Thông báo ngắn sau khi check-in. */
  protected readonly notice = signal('');
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  /** Ảnh mới nhất của album, hiện ở ô nhỏ cạnh nút chụp. */
  protected readonly latestMoment = signal<Moment | null>(null);

  /** Ảnh của hôm nay, thay ảnh thẻ cho quán đã check-in. */
  private readonly dayMoments = signal<Moment[]>([]);

  /** Ảnh đang bay từ màn xem lại xuống ô album. */
  protected readonly flying = signal<{ url: string; left: number; top: number; size: number } | null>(null);
  private readonly albumThumb = viewChild<ElementRef<HTMLElement>>('albumThumb');

  /** Check-in mới nhất còn thiếu tiền. */
  private readonly pending = signal<Checkin | null>(null);
  /** Đã bỏ qua trong lần mở app này: lần mở sau mới nhắc lại. */
  private readonly dismissed = signal<readonly string[]>([]);
  protected readonly reminder = computed(() => {
    const trip = this.trip();
    const c = trip ? pendingReminder(this.pending(), this.queued(), trip.tz) : null;
    return c && !this.dismissed().includes(c.id) ? c : null;
  });
  protected readonly expenseListOpen = signal(false);
  protected readonly expenseTarget = signal<ExpenseTarget | null>(null);
  /** Mở bàn phím số từ danh sách hay từ chuông thì đóng xong quay lại đó. */
  private expenseReturnTo: 'list' | 'notifications' | null = null;
  protected readonly notificationsOpen = signal(false);
  protected readonly unread = signal(0);
  private expenseOpener: HTMLElement | null = null;

  /** Vị trí thiết bị để tính khoảng cách. Từ chối hoặc lỗi thì giữ null và ẩn khoảng cách. */
  private readonly position = signal<{ lat: number; lng: number } | null>(null);

  protected readonly trip = computed(() => this.data()?.trip ?? null);
  private readonly outbox = inject(OutboxService);
  /** Việc chờ gửi của chuyến đang xem. */
  private readonly queued = computed(() => {
    const id = this.trip()?.id;
    return this.outbox.items().filter((i) => i.tripId === id);
  });
  protected readonly clusters = computed(() => {
    const d = this.data();
    if (!d) return [];
    return sortClusters(withQueuedCheckins(d.clusters, this.queued(), d.date, d.trip.tz));
  });
  /** Link tạm của ảnh đang chờ gửi, theo seq trong hàng đợi. */
  private readonly queuedUrls = new Map<number, string>();
  private readonly queuedMoments = computed(() => {
    const tz = this.trip()?.tz;
    if (!tz) return [];
    const username = this.auth.user()?.username ?? '';
    return this.queued().flatMap((item) => {
      const op = item.op;
      if ((op.kind !== 'checkin' && op.kind !== 'moment') || !op.photo || !op.momentId) return [];
      let url = this.queuedUrls.get(item.seq);
      if (!url) {
        url = URL.createObjectURL(op.photo.photo);
        this.queuedUrls.set(item.seq, url);
      }
      return [queuedMomentModel(item, op, url, username, tz)];
    });
  });
  /** Ảnh ở ô album: ảnh mới chụp đang chờ gửi được ưu tiên. */
  protected readonly albumPreview = computed(() => this.queuedMoments().at(-1) ?? this.latestMoment());
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
  protected readonly totalSpent = computed(() =>
    formatVnd((this.trip()?.totalSpent ?? 0) + queuedSpent(this.queued())),
  );

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
    // Có mục vừa gửi xong thì tải lại dữ liệu thật.
    let synced = this.outbox.syncedCount();
    effect(() => {
      const count = this.outbox.syncedCount();
      if (count === synced) return;
      synced = count;
      untracked(() => this.refresh());
    });
    // Gỡ link tạm của ảnh đã gửi xong.
    effect(() => {
      const alive = new Set(this.outbox.items().map((i) => i.seq));
      for (const [seq, url] of this.queuedUrls) {
        if (alive.has(seq)) continue;
        URL.revokeObjectURL(url);
        this.queuedUrls.delete(seq);
      }
    });
    this.destroyRef.onDestroy(() => this.queuedUrls.forEach((url) => URL.revokeObjectURL(url)));
    effect(() => {
      this.places();
      this.status();
      // Đợi DOM dựng xong thẻ mới áp hiệu ứng ban đầu.
      requestAnimationFrame(() => this.applyCardEffects());
    });
    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.rafId);
      clearTimeout(this.noticeTimer);
      this.endFlight();
    });
    this.watchPosition();
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          this.status.set('loading');
          this.camera.set(null);
          this.latestMoment.set(null);
          this.dayMoments.set([]);
          this.albumOpen.set(false);
          this.pending.set(null);
          this.unread.set(0);
          this.notificationsOpen.set(false);
          this.expenseListOpen.set(false);
          this.expenseTarget.set(null);
          return this.api.load(params.get('id') ?? '').pipe(
            tap((data) => {
              if (data.fromCache) this.outbox.markOffline();
              this.data.set(data);
              this.status.set('ready');
              this.loadLatestMoment(data.trip.id);
              this.loadDayMoments(data.trip.id, data.date);
              this.loadReminder(data.trip.id);
              this.loadUnread(data.trip.id);
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

  protected openCamera(place: TripPlace): void {
    const data = this.data();
    if (!data) return;
    // Chỉ check-in cho hôm nay: qua ngày mới thì tải lại dữ liệu trước.
    if (zonedParts(new Date(), data.trip.tz).date !== data.date) {
      this.showNotice('Đã sang ngày mới, danh sách vừa được cập nhật.');
      this.refresh();
      return;
    }
    this.cameraOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const cluster = this.clusters().find((c) => c.id === place.clusterId);
    this.camera.set({
      mode: 'checkin',
      placeId: place.id,
      placeName: place.label,
      clusterName: cluster?.name ?? '',
      clusterId: place.clusterId,
    });
  }

  /** Nút "Lưu khoảnh khắc": mở thẳng camera, địa điểm gợi ý là quán đang ở gần (FR-20). */
  protected openMomentCamera(): void {
    this.cameraOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const near = nearestPlace(this.clusters().flatMap((c) => c.places ?? []), this.position());
    this.camera.set({
      mode: 'moment',
      placeId: near?.id ?? '',
      placeName: near?.label ?? '',
      clusterName: '',
      clusterId: null,
    });
  }

  protected openAlbum(): void {
    this.albumOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.albumOpen.set(true);
  }

  protected closeAlbum(): void {
    this.albumOpen.set(false);
    const opener = this.albumOpener;
    this.albumOpener = null;
    afterNextRender(() => opener?.isConnected && opener.focus(), { injector: this.injector });
  }

  /** Sửa hoặc xoá ảnh trong album thì thẻ và ô album cập nhật theo. */
  protected onAlbumChanged(): void {
    this.refresh();
  }

  protected onCameraClosed(event: { attempted: boolean }): void {
    this.dismissCamera();
    // Lần gửi lỗi có thể đã tới server, tải lại cho chắc.
    if (event.attempted) this.refresh();
  }

  protected onPhotoFlight({ blob, from }: PhotoFlight): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.endFlight();
    this.flying.set({ url: URL.createObjectURL(blob), left: from.left, top: from.top, size: from.width });
  }

  /** Ảnh nhảy lên một nhịp rồi thu nhỏ rơi vào ô album, ô album nảy khi đón ảnh. */
  protected runFlight(image: HTMLImageElement): void {
    const flight = this.flying();
    const target = this.albumThumb()?.nativeElement;
    if (!flight || !target?.animate) {
      this.endFlight();
      return;
    }
    const box = target.getBoundingClientRect();
    const scale = box.width / flight.size;
    const dx = box.left - flight.left;
    const dy = box.top - flight.top;
    const animation = image.animate(
      [
        { transform: 'translate(0, 0) scale(1) rotate(0deg)', borderRadius: '40px' },
        {
          transform: `translate(${dx * 0.25}px, ${dy * 0.05 - 40}px) scale(${0.65}) rotate(-5deg)`,
          borderRadius: '44px',
          offset: 0.35,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0deg)`, borderRadius: `${14 / scale}px` },
      ],
      { duration: 760, easing: 'cubic-bezier(0.5, 0, 0.35, 1)', fill: 'forwards' },
    );
    animation.onfinish = () => {
      target.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(0.92)' }, { transform: 'scale(1)' }],
        { duration: 420, easing: 'ease-out' },
      );
      this.endFlight();
    };
    animation.oncancel = () => this.endFlight();
  }

  private endFlight(): void {
    const flight = this.flying();
    if (!flight) return;
    URL.revokeObjectURL(flight.url);
    this.flying.set(null);
  }

  protected onCheckinDone(outcome: CheckinOutcome): void {
    const open = this.camera();
    if (!open) return;
    if (outcome.kind === 'queued') {
      if (open.mode === 'checkin') this.selectedClusterId.set(open.clusterId);
      this.flippedPlaceId.set(null);
      this.dismissCamera();
      this.showNotice('Đang offline: đã lưu trên máy, sẽ tự gửi khi có mạng.');
      return;
    }
    if (outcome.kind === 'moment') {
      this.latestMoment.set(outcome.moment);
      this.dismissCamera();
      this.showNotice('Đã lưu vào album.');
      this.refresh();
      return;
    }
    const checkin = outcome.checkin;
    if (checkin) {
      this.data.update((d) =>
        d && checkin.dayDate === d.date ? { ...d, clusters: applyCheckin(d.clusters, checkin) } : d,
      );
    }
    // Ở lại cụm vừa check-in để thấy "✓ Đã đi".
    this.selectedClusterId.set(open.clusterId);
    this.flippedPlaceId.set(null);
    this.dismissCamera();
    this.showNotice(
      outcome.kind === 'created'
        ? `Đã check-in ${open.placeName}.`
        : outcome.kind === 'joined'
          ? 'Quán đã được check-in hôm nay. Ảnh của bạn đã vào album.'
          : 'Quán đã được check-in hôm nay.',
    );
    const moment = outcome.moment;
    if (moment) {
      this.latestMoment.set(moment);
      this.dayMoments.update((list) => [moment, ...list.filter((m) => m.id !== moment.id)]);
    }
    this.refresh();
  }

  private dismissCamera(): void {
    this.camera.set(null);
    const opener = this.cameraOpener;
    this.cameraOpener = null;
    afterNextRender(() => opener?.isConnected && opener.focus(), { injector: this.injector });
  }

  private showNotice(message: string): void {
    clearTimeout(this.noticeTimer);
    this.notice.set(message);
    this.noticeTimer = setTimeout(() => this.notice.set(''), 4000);
  }

  /** Tải lại dữ liệu mà không hiện màn chờ. Lỗi thì giữ dữ liệu đang có. */
  private refresh(): void {
    const id = this.trip()?.id;
    if (!id) return;
    this.api
      .load(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          if (this.trip()?.id !== data.trip.id) return;
          this.data.set(data);
          this.loadDayMoments(data.trip.id, data.date);
        },
        error: () => undefined,
      });
    this.loadLatestMoment(id);
    this.loadReminder(id);
    this.loadUnread(id);
  }

  private loadReminder(tripId: string): void {
    this.api
      .pendingExpense(tripId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (c) => {
          if (this.trip()?.id === tripId) this.pending.set(c);
        },
        // Khung nhắc chỉ là gợi ý: lỗi thì ẩn, lần tải sau thử lại.
        error: () => undefined,
      });
  }

  protected skipReminder(checkin: Checkin): void {
    this.dismissed.update((list) => [...list, checkin.id]);
    // Check-in còn chờ gửi thì lời bỏ qua phải xếp sau nó.
    if (this.outbox.hasCheckin(checkin.id)) {
      void this.queueSkip(checkin);
      return;
    }
    this.api
      .skipExpenseReminder(checkin.tripId, checkin.id, checkin.expenseReminder.skipCount + 1)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          if (updated.expenseReminder.movedToBell) {
            this.showNotice('Đã chuyển lời nhắc vào chuông thông báo.');
            this.loadReminder(updated.tripId);
            this.loadUnread(updated.tripId);
          }
        },
        error: (err: unknown) => {
          if (isNetworkError(err)) {
            this.outbox.markOffline();
            void this.queueSkip(checkin);
            return;
          }
          this.skipFailed(checkin);
        },
      });
  }

  private async queueSkip(checkin: Checkin): Promise<void> {
    try {
      await this.outbox.enqueue(checkin.tripId, {
        kind: 'skip',
        checkinId: checkin.id,
        placeLabel: checkin.placeLabel,
        skipCount: checkin.expenseReminder.skipCount + 1,
      });
    } catch {
      this.skipFailed(checkin);
    }
  }

  private skipFailed(checkin: Checkin): void {
    this.dismissed.update((list) => list.filter((id) => id !== checkin.id));
    this.showNotice('Chưa bỏ qua được. Hãy kiểm tra mạng rồi thử lại.');
  }

  protected onReminderSwipe(direction: SwipeDirection, checkin: Checkin): void {
    if (direction === 'left' || direction === 'right') this.skipReminder(checkin);
  }

  protected enterExpense(checkin: Checkin): void {
    const cluster = this.clusters().find((c) => c.id === checkin.clusterId);
    this.rememberExpenseOpener();
    this.expenseReturnTo = null;
    this.expenseTarget.set({
      checkinId: checkin.id,
      placeLabel: checkin.placeLabel,
      subtitle: cluster?.name ?? '',
      amount: null,
      note: '',
    });
  }

  protected openExpenseList(): void {
    this.rememberExpenseOpener();
    this.expenseListOpen.set(true);
  }

  protected editExpense(target: ExpenseTarget): void {
    this.expenseReturnTo = 'list';
    this.expenseListOpen.set(false);
    this.expenseTarget.set(target);
  }

  protected openNotifications(): void {
    if (!this.trip()) return;
    this.rememberExpenseOpener();
    this.notificationsOpen.set(true);
  }

  protected closeNotifications(): void {
    this.notificationsOpen.set(false);
    this.restoreExpenseFocus();
  }

  protected enterExpenseFromBell(target: ExpenseTarget): void {
    this.expenseReturnTo = 'notifications';
    this.notificationsOpen.set(false);
    this.expenseTarget.set(target);
  }

  private loadUnread(tripId: string): void {
    this.api
      .notifications(tripId, { unread: 'true', limit: 1 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (this.trip()?.id === tripId) this.unread.set(res.unreadCount);
        },
        error: () => undefined,
      });
  }

  protected onExpenseSaved({ queued }: { queued: boolean }): void {
    this.closeExpenseEntry();
    this.showNotice(queued ? 'Đã lưu trên máy, sẽ tự gửi khi có mạng.' : 'Đã lưu chi tiêu.');
    if (!queued) this.refresh();
  }

  protected closeExpenseEntry(): void {
    this.expenseTarget.set(null);
    const back = this.expenseReturnTo;
    this.expenseReturnTo = null;
    if (back === 'list') this.expenseListOpen.set(true);
    else if (back === 'notifications') this.notificationsOpen.set(true);
    else this.restoreExpenseFocus();
  }

  protected closeExpenseList(): void {
    this.expenseListOpen.set(false);
    this.restoreExpenseFocus();
  }

  private rememberExpenseOpener(): void {
    this.expenseOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  private restoreExpenseFocus(): void {
    const opener = this.expenseOpener;
    this.expenseOpener = null;
    afterNextRender(() => opener?.isConnected && opener.focus(), { injector: this.injector });
  }

  private loadLatestMoment(tripId: string): void {
    this.api
      .latestMoment(tripId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (m) => {
          if (this.trip()?.id === tripId) this.latestMoment.set(m);
        },
        // Ô album chỉ để xem trước: lỗi thì giữ nền mặc định.
        error: () => undefined,
      });
  }

  private loadDayMoments(tripId: string, date: string): void {
    this.api
      .momentsOfDay(tripId, date)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          if (this.trip()?.id === tripId) this.dayMoments.set(list);
        },
        // Không lấy được ảnh thì thẻ giữ ảnh minh hoạ.
        error: () => undefined,
      });
  }

  protected ratingFor(placeId: string): number | null {
    const cluster = this.selected();
    return (cluster && findCheckin(cluster, placeId)?.rating) || null;
  }

  protected reviewFor(placeId: string): string {
    const cluster = this.selected();
    return (cluster && findCheckin(cluster, placeId)?.review) || '';
  }

  protected captionFor(placeId: string): string {
    const cluster = this.selected();
    return (cluster && findCheckin(cluster, placeId)?.caption) || '';
  }

  protected checkinPhotoFor(placeId: string): Moment | null {
    const cluster = this.selected();
    const checkin = cluster ? findCheckin(cluster, placeId) : null;
    return checkin ? checkinMoment([...this.queuedMoments(), ...this.dayMoments()], checkin) : null;
  }

  /** Ảnh trên thẻ lỗi vì link hết hạn thì xin link mới. */
  protected onCardPhotoError(moment: Moment): void {
    const data = this.data();
    if (data && Date.parse(moment.urlExpiresAt) <= Date.now()) {
      this.loadDayMoments(moment.tripId, data.date);
    }
  }

  /** Link ảnh hết hạn thì xin link mới, lỗi khác thì quay về nền mặc định. */
  protected onAlbumImageError(moment: Moment): void {
    this.latestMoment.set(null);
    if (Date.parse(moment.urlExpiresAt) <= Date.now()) this.loadLatestMoment(moment.tripId);
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

  /** Lướt ngang ngoài vùng thẻ để sang cụm kế tiếp hoặc trước đó. */
  protected onPageSwipe(direction: SwipeDirection): void {
    if (direction !== 'left' && direction !== 'right') return;
    const list = this.clusters();
    const at = list.findIndex((c) => c.id === this.selected()?.id);
    const next = list[at + (direction === 'left' ? 1 : -1)];
    if (at >= 0 && next) this.selectCluster(next);
  }

  /** Lướt lên hoặc xuống trên thẻ đang giữa để lật. */
  protected onCardSwipe(direction: SwipeDirection, placeId: string, index: number): void {
    if ((direction === 'up' || direction === 'down') && index === this.activeIndex()) {
      this.onCardTap(placeId, index);
    }
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
