import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, isDevMode, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { newClientId, type Checkin, type Cluster, type Trip, type TripPlace } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { TripsApi } from '../../../core/api/trips.api';
import {
  formatDM,
  clusterTheme,
  formatVnd,
  getDevDayOffset,
  gradientCss,
  gradientFor,
  nowLocal,
  setDevDayOffset,
  todayLocal,
} from '../../../core/format';
import { BackLinkComponent } from '../../../ui/back-link.component';
import { BottomSheetComponent } from '../../../ui/bottom-sheet.component';

interface PlaceDraft {
  note: string;
  open: string;
  close: string;
  manualPrice: string;
  mapsUrl: string;
}

/** Quán trong một cụm: thêm, sửa ghi chú/giờ/giá, xoá và đánh dấu đã ghé theo ngày. */
@Component({
  selector: 'app-cluster-detail',
  imports: [NgTemplateOutlet, RouterLink, FormsModule, BackLinkComponent, BottomSheetComponent],
  templateUrl: './cluster-detail.component.html',
})
export class ClusterDetailComponent {
  private readonly api = inject(TripsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly tripId = this.route.snapshot.paramMap.get('tripId') ?? '';

  readonly trip = signal<Trip | null>(null);
  readonly clusters = signal<Cluster[]>([]);
  readonly clusterId = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly actionError = signal('');

  readonly cluster = computed(() => this.clusters().find((c) => c.id === this.clusterId()) ?? null);
  readonly places = computed<TripPlace[]>(() => this.cluster()?.places ?? []);

  // Check-in theo thời gian thực: quán là kho chung của cụm, bấm "Đã ghé" thì ghi vào ngày và giờ hiện tại.
  /** Hôm nay nếu nằm trong khoảng ngày của chuyến, ngược lại rỗng. */
  readonly selectedDate = signal('');
  readonly checkins = signal<Checkin[]>([]);
  readonly busyPlaceId = signal('');
  readonly canCheckin = computed(() => this.selectedDate() !== '');
  readonly checkinHint = computed(() => {
    const t = this.trip();
    if (!t) return '';
    return todayLocal() < t.startDate
      ? `Chuyến bắt đầu ngày ${formatDM(t.startDate)}. Đến ngày đó bạn sẽ bấm “Đã ghé” ở quán nào thì quán đó được ghi vào ngày hôm đó.`
      : 'Chuyến đã kết thúc nên không check-in thêm được.';
  });

  // Sửa quán
  readonly editingId = signal('');
  draft: PlaceDraft = { note: '', open: '', close: '', manualPrice: '', mapsUrl: '' };
  readonly saving = signal(false);

  // Thêm quán
  readonly showAdd = signal(false);
  readonly newPlace = { label: '', mapsUrl: '', note: '' };
  readonly adding = signal(false);
  readonly addError = signal('');

  // Sửa cụm
  readonly showCluster = signal(false);
  readonly clusterDraft = { name: '', startTime: '', endTime: '' };
  readonly clusterSaving = signal(false);
  readonly clusterError = signal('');

  /** Màu của cụm đang xem. */
  readonly theme = computed(() => clusterTheme(this.cluster()?.type ?? 'custom'));
  readonly gradientCss = gradientCss;

  themeOf(c: Cluster) {
    return clusterTheme(c.type);
  }

  readonly formatDM = formatDM;
  readonly formatVnd = formatVnd;
  readonly gradientFor = gradientFor;

  constructor() {
    this.route.paramMap.subscribe((params) => {
      this.clusterId.set(params.get('clusterId') ?? '');
      this.editingId.set('');
      if (this.trip()) this.loadCheckins();
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.getTrip(this.tripId).subscribe({
      next: (trip) => {
        this.trip.set(trip);
        const today = todayLocal();
        this.selectedDate.set(trip.days.find((d) => d.date === today)?.date ?? '');
        this.api.listClusters(this.tripId, true).subscribe({
          next: (items) => {
            this.clusters.set(items);
            this.loading.set(false);
            this.loadCheckins();
          },
          error: (err) => this.fail(err),
        });
      },
      error: (err) => this.fail(err),
    });
  }

  loadCheckins(): void {
    // Lấy check-in của cả chuyến để biết quán nào đã ghé ở các ngày trước.
    this.api.listCheckins(this.tripId, { withExpense: true }).subscribe({
      next: (items) => this.checkins.set(items),
      error: (err) => this.actionError.set(toApiError(err).message),
    });
  }

  /** Chia quán: chưa ghé lên trên, đã ghé ở ngày trước ở giữa, đã ghé hôm nay xuống cuối. */
  readonly groups = computed(() => {
    const inTrip = this.selectedDate() !== '';
    const fresh: TripPlace[] = [];
    const again: TripPlace[] = [];
    const done: TripPlace[] = [];
    for (const p of this.places()) {
      if (this.visitsToday(p) > 0) done.push(p);
      else if (this.visitedBefore(p)) (inTrip ? again : done).push(p);
      else fresh.push(p);
    }
    return [
      { key: 'fresh', title: 'Chưa ghé', hint: '', places: fresh },
      {
        key: 'again',
        title: 'Đã ghé ở ngày trước',
        hint: 'Hôm nay có muốn ghé lại không?',
        places: again,
      },
      {
        key: 'done',
        title: inTrip ? 'Đã ghé hôm nay' : 'Đã ghé',
        hint: '',
        places: done,
      },
    ].filter((g) => g.places.length > 0);
  });

  // Thanh thử "ngày hôm sau", chỉ hiện khi chạy dev.
  readonly isDev = isDevMode();
  readonly devOffset = signal(getDevDayOffset());

  shiftDay(delta: number): void {
    const next = delta === 0 ? 0 : this.devOffset() + delta;
    setDevDayOffset(next);
    this.devOffset.set(next);
    this.actionError.set('');
    const trip = this.trip();
    if (!trip) return;
    this.selectedDate.set(trip.days.find((d) => d.date === todayLocal())?.date ?? '');
    this.checkins.set([]);
    this.loadCheckins();
  }

  todayLabel(): string {
    return formatDM(todayLocal());
  }

  /** Số lần đã ghé quán này hôm nay. */
  visitsToday(place: TripPlace): number {
    return this.todaysCheckins(place).length;
  }

  /** Quán đã được ghé ở một ngày khác hôm nay (ngày trước đó). */
  visitedBefore(place: TripPlace): boolean {
    return this.checkins().some(
      (c) => c.tripPlaceId === place.id && c.dayDate !== this.selectedDate(),
    );
  }

  private todaysCheckins(place: TripPlace): Checkin[] {
    return this.checkins().filter(
      (c) => c.tripPlaceId === place.id && c.dayDate === this.selectedDate(),
    );
  }

  /** Giờ ghé dạng "12:10". */
  timeText(c: Checkin): string {
    return new Date(c.takenAt).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  /** Lần ghé gần nhất hôm nay, dùng để nhập hoặc xem chi tiêu. */
  lastCheckin(place: TripPlace): Checkin | undefined {
    const list = this.todaysCheckins(place);
    return list[list.length - 1];
  }

  /** Check-in: ID do client sinh nên gửi lại không tạo trùng. */
  checkIn(place: TripPlace): void {
    if (!this.canCheckin()) return;
    // Server tự tính ngày từ thời điểm này theo múi giờ của chuyến.
    const takenAt = nowLocal().toISOString();
    this.busyPlaceId.set(place.id);
    this.actionError.set('');
    this.api.putCheckin(this.tripId, newClientId(), place.id, takenAt).subscribe({
      next: (checkin) => {
        this.checkins.update((list) => [...list, checkin]);
        this.busyPlaceId.set('');
      },
      error: (err) => {
        this.busyPlaceId.set('');
        this.actionError.set(toApiError(err).message);
      },
    });
  }

  hoursText(p: TripPlace): string {
    const parts: string[] = [];
    if (p.manualHours) parts.push(`${p.manualHours.open}–${p.manualHours.close}`);
    if (p.manualPrice) parts.push(p.manualPrice);
    return parts.join(' · ');
  }

  // Sửa quán
  startEdit(p: TripPlace): void {
    this.editingId.set(p.id);
    this.draft = {
      note: p.note,
      open: p.manualHours?.open ?? '',
      close: p.manualHours?.close ?? '',
      manualPrice: p.manualPrice ?? '',
      mapsUrl: p.mapsUrl ?? '',
    };
    this.actionError.set('');
  }

  saveEdit(p: TripPlace): void {
    this.saving.set(true);
    this.actionError.set('');
    const hasHours = this.draft.open !== '' && this.draft.close !== '';
    this.api
      .updatePlace(this.tripId, p.id, {
        note: this.draft.note,
        manualHours: hasHours ? { open: this.draft.open, close: this.draft.close } : null,
        manualPrice: this.draft.manualPrice.trim() || null,
        mapsUrl: this.draft.mapsUrl.trim() || null,
      })
      .subscribe({
        next: (updated) => {
          this.replacePlace(updated);
          this.saving.set(false);
          this.editingId.set('');
        },
        error: (err) => {
          this.saving.set(false);
          this.actionError.set(toApiError(err).message);
        },
      });
  }

  removePlace(p: TripPlace): void {
    if (!window.confirm(`Xoá “${p.label}” khỏi cụm này?`)) return;
    this.api.deletePlace(this.tripId, p.id).subscribe({
      next: () => {
        this.mutateCluster((c) => ({
          ...c,
          places: (c.places ?? []).filter((x) => x.id !== p.id),
          placeCount: Math.max(0, c.placeCount - 1),
        }));
        this.editingId.set('');
      },
      error: (err) => this.actionError.set(toApiError(err).message),
    });
  }

  // Thêm quán
  openAdd(): void {
    this.newPlace.label = '';
    this.newPlace.mapsUrl = '';
    this.newPlace.note = '';
    this.addError.set('');
    this.showAdd.set(true);
  }

  addPlace(): void {
    this.adding.set(true);
    this.addError.set('');
    this.api
      .createPlace(this.tripId, {
        clusterId: this.clusterId(),
        label: this.newPlace.label,
        mapsUrl: this.newPlace.mapsUrl.trim() || null,
        note: this.newPlace.note,
      })
      .subscribe({
        next: (place) => {
          this.mutateCluster((c) => ({
            ...c,
            places: [...(c.places ?? []), place],
            placeCount: c.placeCount + 1,
          }));
          this.adding.set(false);
          this.showAdd.set(false);
        },
        error: (err) => {
          this.adding.set(false);
          this.addError.set(toApiError(err).message);
        },
      });
  }

  // Sửa cụm
  openCluster(): void {
    const c = this.cluster();
    if (!c) return;
    this.clusterDraft.name = c.name;
    this.clusterDraft.startTime = c.startTime;
    this.clusterDraft.endTime = c.endTime;
    this.clusterError.set('');
    this.showCluster.set(true);
  }

  saveCluster(): void {
    this.clusterSaving.set(true);
    this.clusterError.set('');
    this.api.updateCluster(this.tripId, this.clusterId(), this.clusterDraft).subscribe({
      next: (updated) => {
        this.mutateCluster((c) => ({
          ...c,
          name: updated.name,
          startTime: updated.startTime,
          endTime: updated.endTime,
        }));
        this.clusterSaving.set(false);
        this.showCluster.set(false);
      },
      error: (err) => {
        this.clusterSaving.set(false);
        this.clusterError.set(toApiError(err).message);
      },
    });
  }

  deleteCluster(): void {
    if (!window.confirm('Xoá cụm này?')) return;
    this.api.deleteCluster(this.tripId, this.clusterId()).subscribe({
      next: () => void this.router.navigate(['/trips', this.tripId]),
      error: (err) => this.clusterError.set(toApiError(err).message),
    });
  }

  private replacePlace(updated: TripPlace): void {
    this.mutateCluster((c) => ({
      ...c,
      places: (c.places ?? []).map((p) => (p.id === updated.id ? updated : p)),
    }));
  }

  private mutateCluster(fn: (c: Cluster) => Cluster): void {
    this.clusters.update((list) => list.map((c) => (c.id === this.clusterId() ? fn(c) : c)));
  }

  private fail(err: unknown): void {
    this.error.set(toApiError(err).message);
    this.loading.set(false);
  }
}
