import {
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import * as L from 'leaflet';
import type { Subscription } from 'rxjs';
import type { Cluster, PlaceRoute, TripPlace } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { TripsApi } from '../../../core/api/trips.api';
import { BackLinkComponent } from '../../../ui/back-link.component';
import { BottomSheetComponent } from '../../../ui/bottom-sheet.component';
import {
  directionsUrl,
  formatDistance,
  haversineKm,
  looksLikeLink,
  normalizeLink,
} from '../../trip-mode/trip-mode.logic';
import { TripModeService } from '../../trip-mode/trip-mode.service';
import { DEFAULT_RADIUS, RADII, readAnchor, saveAnchor, withinRadius, type Anchor } from './map-anchor';

/**
 * Ảnh nền bản đồ: dữ liệu OpenStreetMap, kiểu HOT, do OpenStreetMap France phục vụ (không cần khoá,
 * chỉ hợp với lượng dùng nhỏ; chạy thật nhiều người thì đổi sang nhà cung cấp có khoá). Không dùng
 * openstreetmap.org vì có mạng không phân giải được tên miền này. Tách ra để đổi một chỗ và để test
 * không gọi mạng.
 */
export const MAP_TILE_URL = new InjectionToken<string>('MAP_TILE_URL', {
  providedIn: 'root',
  factory: () => 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
});

/** Màu pin theo thứ tự cụm, hết màu thì quay vòng. Không dùng đỏ: đỏ dành riêng cho mốc. */
export const PIN_COLORS = ['#17709F', '#0F8B8D', '#B86E00', '#2E7D52', '#7B4FC9', '#0B2F4A', '#7A5546', '#5B6B7F'];

/** Ghim đỏ của mốc kèm hai vòng sóng lan ra ở chân ghim (hiệu ứng nằm trong styles.css). */
const ANCHOR_HTML =
  '<span class="gg-anchor__wave"></span><span class="gg-anchor__wave gg-anchor__wave--late"></span>' +
  '<svg width="44" height="56" viewBox="0 0 44 56" aria-hidden="true"><path d="M22 2C11 2 2 10.600 2 21.500 2 36.500 22 54 22 54s20-17.500 20-32.500C42 10.600 33 2 22 2z" fill="#E11D2E" stroke="#fff" stroke-width="3"/><path d="M22 11l3.200 6.600 7.200 1-5.200 5 1.300 7.100-6.500-3.400-6.500 3.400 1.300-7.100-5.200-5 7.200-1z" fill="#fff"/></svg>';

interface Pin {
  place: TripPlace & { lat: number; lng: number };
  clusterName: string;
  color: string;
}

const hasPosition = (p: TripPlace): p is TripPlace & { lat: number; lng: number } =>
  p.lat !== null && p.lng !== null;

/** Chỉ ghép màu cố định của app vào SVG; chữ người dùng nhập không bao giờ đi qua đây. */
const pinSvg = (color: string) =>
  `<svg width="32" height="42" viewBox="0 0 32 42" aria-hidden="true"><path d="M16 1C7.7 1 1 7.600 1 15.800 1 27 16 41 16 41s15-14 15-25.200C31 7.600 24.300 1 16 1z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="5.500" fill="#fff"/></svg>`;

/**
 * Quán của chuyến trên bản đồ, pin phân màu theo cụm (FR-11). Đặt mốc bằng tên và link Google Maps
 * thì lần sau mở bản đồ chỉ hiện quán trong bán kính quanh mốc. Chạm một quán thì thấy đường ngắn
 * nhất từ mốc. Mở kèm `?place=` thì chọn sẵn quán đó, kể cả khi nó nằm ngoài bán kính.
 */
@Component({
  selector: 'app-trip-map',
  imports: [FormsModule, RouterLink, BackLinkComponent, BottomSheetComponent],
  templateUrl: './trip-map.component.html',
})
export class TripMapComponent {
  private readonly api = inject(TripsApi);
  private readonly tileUrl = inject(MAP_TILE_URL);
  private readonly links = inject(TripModeService);
  private readonly injector = inject(Injector);
  private readonly snapshot = inject(ActivatedRoute).snapshot;
  readonly tripId = this.snapshot.paramMap.get('tripId') ?? '';
  /** Quán cần xem ngay, khi mở từ thẻ quán ở Trip Mode. */
  private readonly focusId = this.snapshot.queryParamMap.get('place') ?? '';
  private readonly fromMode = this.snapshot.queryParamMap.get('from') === 'mode';
  /** Quay lại đúng nơi đã mở bản đồ; về Trip Mode thì giữ nguyên cụm đang xem. */
  readonly backLink = this.fromMode ? ['/trips', this.tripId, 'mode'] : ['/trips', this.tripId];
  readonly backQuery: Record<string, string> =
    this.fromMode && this.snapshot.queryParamMap.has('cluster')
      ? { cluster: this.snapshot.queryParamMap.get('cluster')! }
      : {};

  private readonly mapHost = viewChild<ElementRef<HTMLElement>>('map');
  private map: L.Map | null = null;
  private readonly markers = new Map<string, L.Marker>();
  /** Mốc và vòng bán kính. */
  private around: L.Layer[] = [];
  private routeLine: L.Polyline | null = null;
  private routeRequest: Subscription | undefined;
  /** Đường từ mốc đến quán đang chọn. null khi chưa chọn quán hoặc chưa đặt mốc. */
  readonly route = signal<{ state: 'loading' | 'ok' | 'failed'; data?: PlaceRoute; message?: string } | null>(null);

  private readonly saved = readAnchor(this.tripId);
  readonly anchor = signal<Anchor | null>(this.saved.anchor);
  readonly radiusKm = signal(this.saved.radiusKm);
  readonly radii = RADII;

  // Bảng đặt mốc: tên, link Google Maps, bán kính.
  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly formError = signal('');
  draft = { name: '', link: '', radiusKm: DEFAULT_RADIUS as number };
  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('anchorName');
  private lookup: Subscription | undefined;
  private opener: HTMLElement | null = null;

  private readonly clusters = signal<Cluster[] | null>(null);
  readonly loading = computed(() => this.clusters() === null);
  readonly error = signal('');
  /** Cụm đang lọc, rỗng là tất cả. */
  readonly filter = signal('');
  private readonly selectedId = signal(this.focusId);

  private readonly groups = computed(() =>
    (this.clusters() ?? []).map((c, i) => ({
      id: c.id,
      name: c.name,
      color: PIN_COLORS[i % PIN_COLORS.length]!,
      places: c.places ?? [],
    })),
  );
  private readonly pins = computed<(Pin & { clusterId: string })[]>(() =>
    this.groups().flatMap((g) =>
      g.places
        .filter(hasPosition)
        .map((place) => ({ place, clusterId: g.id, clusterName: g.name, color: g.color })),
    ),
  );
  readonly total = computed(() => this.pins().length);
  /** Quán trong bán kính quanh mốc (chưa đặt mốc thì là tất cả). */
  private readonly nearby = computed(() => {
    const inside = withinRadius(this.pins(), { anchor: this.anchor(), radiusKm: this.radiusKm() });
    // Quán được yêu cầu xem thì luôn hiện, dù ở ngoài bán kính.
    const focus = this.pins().find((p) => p.place.id === this.focusId);
    return focus && !inside.includes(focus) ? [...inside, focus] : inside;
  });
  /** Quán được yêu cầu xem nhưng chưa có toạ độ. */
  readonly focusMissing = computed(() => this.missing().find((m) => m.place.id === this.focusId) ?? null);
  readonly shownCount = computed(() => this.nearby().length);
  /** Chỉ các cụm có quán đang hiện mới thành nút lọc. */
  readonly legend = computed(() =>
    this.groups()
      .map((g) => ({ ...g, count: this.nearby().filter((p) => p.clusterId === g.id).length }))
      .filter((g) => g.count > 0),
  );
  readonly missing = computed(() =>
    this.groups().flatMap((g) =>
      g.places.filter((p) => !hasPosition(p)).map((place) => ({ place, clusterName: g.name })),
    ),
  );
  private readonly visible = computed(() =>
    this.nearby().filter((p) => !this.filter() || p.clusterId === this.filter()),
  );
  readonly selected = computed(() => this.visible().find((p) => p.place.id === this.selectedId()) ?? null);
  /** Đổi quán hoặc đổi mốc mới tính lại đường. */
  private readonly routeKey = computed(() => {
    const pin = this.selected();
    const anchor = this.anchor();
    return pin && anchor ? `${pin.place.id}|${anchor.lat}|${anchor.lng}` : '';
  });
  /** Khoảng cách đường chim bay, dùng khi chưa tính được đường đi. */
  readonly straight = computed(() => {
    const pin = this.selected();
    const anchor = this.anchor();
    return pin && anchor ? formatDistance(haversineKm(anchor, pin.place)) : '';
  });
  readonly formatDistance = formatDistance;
  readonly directionsUrl = directionsUrl;

  constructor() {
    this.load();
    // Khung bản đồ có rồi, hoặc đổi bộ lọc, mốc, bán kính: vẽ lại.
    effect(() => {
      const host = this.mapHost()?.nativeElement;
      const pins = this.visible();
      const anchor = this.anchor();
      const radiusKm = this.radiusKm();
      untracked(() => this.draw(host, pins, anchor, radiusKm));
    });
    effect(() => {
      this.routeKey();
      untracked(() => this.loadRoute());
    });
    effect(() => {
      this.route();
      untracked(() => this.drawRoute());
    });
    effect(() => saveAnchor(this.tripId, { anchor: this.anchor(), radiusKm: this.radiusKm() }));
    effect(() => {
      const id = this.selected()?.place.id;
      for (const [placeId, marker] of this.markers) {
        marker.getElement()?.classList.toggle('gg-pin--on', placeId === id);
        marker.setZIndexOffset(placeId === id ? 1000 : 0);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.lookup?.unsubscribe();
      this.routeRequest?.unsubscribe();
      this.map?.remove();
    });
  }

  load(): void {
    this.error.set('');
    this.clusters.set(null);
    this.api.listClusters(this.tripId, true).subscribe({
      next: (items) => this.clusters.set(items),
      error: (err) => this.error.set(toApiError(err).message),
    });
  }

  setFilter(clusterId: string): void {
    this.filter.set(clusterId);
    this.selectedId.set('');
  }

  // ---------- Đường đi ----------

  loadRoute(): void {
    this.routeRequest?.unsubscribe();
    const pin = this.selected();
    const anchor = this.anchor();
    if (!pin || !anchor) {
      this.route.set(null);
      return;
    }
    this.route.set({ state: 'loading' });
    this.routeRequest = this.api.routeToPlace(this.tripId, pin.place.id, anchor).subscribe({
      next: (data) => this.route.set({ state: 'ok', data }),
      error: (err: unknown) => this.route.set({ state: 'failed', message: toApiError(err).message }),
    });
  }

  private drawRoute(): void {
    this.routeLine?.remove();
    this.routeLine = null;
    const path = this.route()?.data?.path;
    if (!this.map || !path || path.length < 2) return;
    this.routeLine = L.polyline(path, { color: '#E11D2E', weight: 5, opacity: 0.85, interactive: false }).addTo(this.map);
    // Thấy trọn đường đi từ mốc đến quán.
    this.map.fitBounds(this.routeLine.getBounds(), { padding: [40, 60], maxZoom: 16, animate: false });
  }

  // ---------- Mốc ----------

  openAnchor(): void {
    const anchor = this.anchor();
    this.draft = {
      name: anchor?.label ?? '',
      link: anchor?.mapsUrl ?? '',
      radiusKm: anchor ? this.radiusKm() : DEFAULT_RADIUS,
    };
    this.formError.set('');
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.editing.set(true);
    afterNextRender(() => this.nameField()?.nativeElement.focus(), { injector: this.injector });
  }

  closeAnchor(): void {
    this.lookup?.unsubscribe();
    this.saving.set(false);
    this.editing.set(false);
    const opener = this.opener;
    this.opener = null;
    afterNextRender(() => opener?.isConnected && opener.focus(), { injector: this.injector });
  }

  /** Link mới thì nhờ máy chủ đọc toạ độ; link không đổi thì chỉ cập nhật tên và bán kính. */
  submitAnchor(): void {
    if (this.saving()) return;
    this.formError.set('');
    const name = this.draft.name.trim();
    const link = this.draft.link.trim();
    const current = this.anchor();

    if (!link && !current) {
      this.formError.set('Hãy dán link Google Maps của điểm làm mốc.');
      return;
    }
    if (link && !looksLikeLink(link)) {
      this.formError.set('Đây chưa phải link. Mở địa điểm trong Google Maps, bấm Chia sẻ rồi dán link vào đây.');
      return;
    }
    const url = link ? normalizeLink(link) : '';
    if (current && (!url || url === current.mapsUrl)) {
      this.applyAnchor({ ...current, label: name || current.label });
      return;
    }
    this.saving.set(true);
    this.lookup = this.links.lookupLink(this.tripId, url).subscribe({
      next: (found) =>
        this.applyAnchor({ lat: found.lat, lng: found.lng, label: name || found.label || 'Mốc', mapsUrl: url }),
      error: (err: unknown) => {
        this.saving.set(false);
        const error = toApiError(err);
        this.formError.set(
          error.code === 'PLACE_NOT_RESOLVED'
            ? 'Link này không có toạ độ. Mở đúng một địa điểm trong Google Maps, bấm Chia sẻ rồi dán link mới.'
            : error.message,
        );
      },
    });
  }

  removeAnchor(): void {
    this.setFilter('');
    this.anchor.set(null);
    this.closeAnchor();
  }

  private applyAnchor(anchor: Anchor): void {
    this.setFilter('');
    this.radiusKm.set(this.draft.radiusKm);
    this.anchor.set(anchor);
    this.closeAnchor();
  }

  private createMap(host: HTMLElement): L.Map {
    const map = L.map(host, { zoomControl: true });
    L.tileLayer(this.tileUrl, {
      maxZoom: 19,
      subdomains: 'abc',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> · ' +
        'kiểu <a href="https://www.hotosm.org/" target="_blank" rel="noopener noreferrer">HOT</a> · ' +
        '<a href="https://www.openstreetmap.fr/" target="_blank" rel="noopener noreferrer">OSM France</a> · ' +
        'đường đi <a href="https://valhalla1.openstreetmap.de/" target="_blank" rel="noopener noreferrer">Valhalla</a>',
    }).addTo(map);
    return map;
  }

  private draw(host: HTMLElement | undefined, pins: Pin[], anchor: Anchor | null, radiusKm: number): void {
    if (this.map && this.map.getContainer() !== host) {
      this.map.remove();
      this.map = null;
      this.routeLine = null;
    }
    if (!host) return;
    this.map ??= this.createMap(host);
    for (const layer of [...this.markers.values(), ...this.around]) layer.remove();
    this.markers.clear();
    this.around = [];

    // Khung hình phải đặt trước khi thêm pin.
    this.map.invalidateSize();
    const selectedId = this.selectedId();
    const chosen = pins.find((p) => p.place.id === selectedId);
    if (!anchor && chosen) {
      this.map.setView([chosen.place.lat, chosen.place.lng], 16, { animate: false });
    } else if (anchor && radiusKm > 0) {
      // Vừa đủ thấy cả vòng bán kính, dù trong đó chưa có quán nào.
      this.map.fitBounds(L.latLng(anchor.lat, anchor.lng).toBounds(radiusKm * 2000), { padding: [12, 12], animate: false });
    } else {
      const points: L.LatLngTuple[] = pins.map((p) => [p.place.lat, p.place.lng]);
      if (anchor) points.push([anchor.lat, anchor.lng]);
      if (points.length === 0) return;
      this.map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16, animate: false });
    }

    if (anchor) {
      if (radiusKm > 0) {
        this.around.push(
          L.circle([anchor.lat, anchor.lng], {
            radius: radiusKm * 1000,
            color: '#17709F',
            weight: 1.5,
            fillOpacity: 0.08,
            interactive: false,
          }).addTo(this.map),
        );
      }
      this.around.push(
        // Không nhận chạm để pin quán nằm dưới vẫn bấm được.
        L.marker([anchor.lat, anchor.lng], {
          icon: L.divIcon({ className: 'gg-anchor', html: ANCHOR_HTML, iconSize: [44, 56], iconAnchor: [22, 54] }),
          interactive: false,
          keyboard: false,
          zIndexOffset: 2000,
        }).addTo(this.map),
      );
    }

    for (const pin of pins) {
      const marker = L.marker([pin.place.lat, pin.place.lng], {
        icon: L.divIcon({ className: 'gg-pin', html: pinSvg(pin.color), iconSize: [32, 42], iconAnchor: [16, 41] }),
        title: `${pin.place.label} · ${pin.clusterName}`,
      }).addTo(this.map);
      if (pin.place.id === selectedId) {
        marker.getElement()?.classList.add('gg-pin--on');
        marker.setZIndexOffset(1000);
      }
      const select = () => this.selectedId.set(pin.place.id);
      marker.on('click', select);
      marker.on('keypress', (e) => {
        if ((e as L.LeafletKeyboardEvent).originalEvent.key === 'Enter') select();
      });
      this.markers.set(pin.place.id, marker);
    }
    // Vẽ lại khung nhìn thì đường đang xem vẫn phải còn.
    this.drawRoute();
  }
}
