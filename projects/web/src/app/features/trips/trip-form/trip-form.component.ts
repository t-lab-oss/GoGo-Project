import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { Subscription } from 'rxjs';
import type { PlaceImage, PlaceImageResult } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { TripsApi } from '../../../core/api/trips.api';
import { formatDM } from '../../../core/format';
import { BackLinkComponent } from '../../../ui/back-link.component';
import { BottomSheetComponent } from '../../../ui/bottom-sheet.component';
import { isSelectedImage, toPlaceImage } from '../../trip-mode/trip-mode.logic';

interface ShrinkWarning {
  removedDays: string[];
  counts: { checkins: number; expenses: number };
}

/** Chờ người dùng ngừng gõ điểm đến rồi mới tìm ảnh. */
const IMAGE_SEARCH_DELAY_MS = 800;

/** So điểm đến không tính hoa thường và khoảng trắng thừa. */
const sameDestination = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('vi-VN') === b.trim().toLocaleLowerCase('vi-VN');

/** Dùng chung cho "Chuyến đi mới" (không có tripId) và "Sửa chuyến đi". */
@Component({
  selector: 'app-trip-form',
  imports: [FormsModule, BackLinkComponent, BottomSheetComponent],
  templateUrl: './trip-form.component.html',
})
export class TripFormComponent {
  private readonly api = inject(TripsApi);
  private readonly router = inject(Router);

  readonly tripId = inject(ActivatedRoute).snapshot.paramMap.get('tripId');
  readonly isEdit = this.tripId !== null;

  readonly form = { name: '', destination: '', startDate: '', endDate: '' };
  /** Tên chuyến lúc mở trang, dùng cho câu xác nhận xoá. */
  readonly savedName = signal('');
  readonly loading = signal(this.isEdit);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly shrink = signal<ShrinkWarning | null>(null);

  readonly showDelete = signal(false);
  confirmName = '';
  readonly deleting = signal(false);

  readonly formatDM = formatDM;

  // Ảnh đại diện: tìm trên Wikimedia Commons theo điểm đến, người dùng tự chọn.
  readonly cover = signal<PlaceImage | null>(null);
  readonly imageState = signal<'idle' | 'loading' | 'done' | 'error'>('idle');
  readonly imageMessage = signal('');
  readonly imageResults = signal<PlaceImageResult[]>([]);
  readonly isSelectedImage = isSelectedImage;
  /** Điểm đến của ảnh đang chọn. Đổi sang nơi khác thì bỏ ảnh cũ. */
  private coverDestination = '';
  /** Điểm đến đã tìm ảnh gần nhất. */
  private searched = '';
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private search: Subscription | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancelSearch());
    if (this.tripId) {
      this.api.getTrip(this.tripId).subscribe({
        next: (trip) => {
          this.form.name = trip.name;
          this.form.destination = trip.destination;
          this.form.startDate = trip.startDate;
          this.form.endDate = trip.endDate;
          this.savedName.set(trip.name);
          this.cover.set(trip.cover);
          this.coverDestination = trip.destination;
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(toApiError(err).message);
          this.loading.set(false);
        },
      });
    }
  }

  /** Danh sách ngày xem trước, tính ngay trên máy để người dùng thấy trước khi lưu. */
  previewDays(): { label: string }[] {
    const { startDate, endDate } = this.form;
    if (!startDate || !endDate || endDate < startDate) return [];
    const out: { label: string }[] = [];
    const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    for (let d = start; d <= end && out.length < 31; d = new Date(d.getTime() + 86_400_000)) {
      out.push({ label: `${names[d.getUTCDay()]} ${formatDM(d.toISOString().slice(0, 10))}` });
    }
    return out;
  }

  readonly backLink = computed(() => (this.tripId ? ['/trips', this.tripId] : ['/trips']));

  // ---------- Ảnh đại diện ----------

  onDestinationChange(value: string): void {
    this.form.destination = value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.findImages(), IMAGE_SEARCH_DELAY_MS);
  }

  /** Tìm ảnh cho điểm đến đang nhập. Chỉ gọi lại khi điểm đến đổi hoặc lần trước lỗi. */
  findImages(): void {
    clearTimeout(this.searchTimer);
    this.dropStaleCover();
    const q = this.form.destination.trim();
    if (sameDestination(q, this.searched) && this.imageState() !== 'error') return;
    this.cancelSearch();
    this.searched = q;
    this.imageResults.set([]);
    this.imageMessage.set('');
    if (q.length < 2) {
      this.imageState.set('idle');
      return;
    }
    this.imageState.set('loading');
    this.search = this.api.searchDestinationImages(q).subscribe({
      next: (items) => {
        this.imageResults.set(items);
        this.imageState.set('done');
      },
      error: (err) => {
        this.imageMessage.set(toApiError(err).message);
        this.imageState.set('error');
      },
    });
  }

  pickImage(result: PlaceImageResult): void {
    // Chọn lại đúng ảnh đang chọn thì bỏ chọn.
    const unpick = isSelectedImage(this.cover(), result);
    this.cover.set(unpick ? null : toPlaceImage(result));
    this.coverDestination = this.form.destination;
  }

  private dropStaleCover(): void {
    if (this.cover() && !sameDestination(this.coverDestination, this.form.destination)) {
      this.cover.set(null);
    }
  }

  private cancelSearch(): void {
    clearTimeout(this.searchTimer);
    this.search?.unsubscribe();
  }

  save(confirmShrink = false): void {
    this.dropStaleCover();
    this.error.set('');
    this.fieldErrors.set({});
    this.shrink.set(null);
    this.saving.set(true);

    const input = { ...this.form, cover: this.cover() };
    const request = this.tripId
      ? this.api.updateTrip(this.tripId, {
          ...input,
          ...(confirmShrink ? { confirmShrink: true } : {}),
        })
      : this.api.createTrip(input);

    request.subscribe({
      next: (trip) => {
        this.saving.set(false);
        void this.router.navigate(['/trips', trip.id]);
      },
      error: (err) => {
        this.saving.set(false);
        const apiErr = toApiError(err);
        if (apiErr.code === 'DAYS_HAVE_DATA') {
          this.shrink.set(apiErr.details as ShrinkWarning);
          return;
        }
        if (apiErr.code === 'VALIDATION_ERROR' && Array.isArray(apiErr.details)) {
          const map: Record<string, string> = {};
          for (const d of apiErr.details as { field: string; message: string }[])
            map[d.field] = d.message;
          this.fieldErrors.set(map);
        }
        this.error.set(apiErr.message);
      },
    });
  }

  openDelete(): void {
    this.confirmName = '';
    this.error.set('');
    this.showDelete.set(true);
  }

  canDelete(): boolean {
    return this.confirmName === this.savedName();
  }

  remove(): void {
    if (!this.tripId || !this.canDelete()) return;
    this.deleting.set(true);
    this.api.deleteTrip(this.tripId, this.confirmName).subscribe({
      next: () => void this.router.navigate(['/trips'], { queryParams: { list: 1 } }),
      error: (err) => {
        this.deleting.set(false);
        this.error.set(toApiError(err).message);
      },
    });
  }
}
