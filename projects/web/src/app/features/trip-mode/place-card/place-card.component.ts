import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { TripPlace } from 'shared';
import { directionsUrl, formatDistance, placeGradient } from '../trip-mode.logic';

/** Thẻ quán vuông của Trip Mode: mặt trước ảnh phủ kín, chạm để lật sang mặt sau (FR-14). */
@Component({
  selector: 'app-place-card',
  templateUrl: './place-card.component.html',
  styleUrl: './place-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceCardComponent {
  readonly place = input.required<TripPlace>();
  readonly index = input(0);
  readonly flipped = input(false);
  /** Giờ check-in "HH:mm" nếu quán đã được check-in hôm nay. */
  readonly checkinTime = input<string | null>(null);
  /** Khoảng cách từ vị trí thiết bị đến quán, km. null khi quán không có toạ độ hoặc chưa có vị trí. */
  readonly distanceKm = input<number | null>(null);

  readonly flipToggle = output<void>();
  readonly edit = output<void>();

  /** Link ảnh bị lỗi tải: quay về gradient cho tới khi quán đổi ảnh khác. */
  private readonly failedImageUrl = signal<string | null>(null);

  protected readonly image = computed(() => {
    const img = this.place().image;
    return img && img.url !== this.failedImageUrl() ? img : null;
  });
  /** Ghi nguồn (tác giả, giấy phép, Wikimedia Commons) ở mặt sau, kể cả khi ảnh tải lỗi. */
  protected readonly credit = computed(() => this.place().image);

  protected onImageError(): void {
    this.failedImageUrl.set(this.place().image?.url ?? null);
  }

  protected readonly gradient = computed(() => placeGradient(this.index()));
  protected readonly directions = computed(() => directionsUrl(this.place()));
  protected readonly distanceText = computed(() => {
    const d = this.distanceKm();
    return d === null ? null : formatDistance(d);
  });
  /** Mặt trước: khoảng cách (nếu có), rồi giờ check-in hoặc gợi ý chạm để xem. */
  protected readonly frontMeta = computed(() =>
    [this.distanceText(), this.checkinTime() ? `đã check-in ${this.checkinTime()}` : 'chạm để xem']
      .filter(Boolean)
      .join(' · '),
  );
  /** Mặt sau: địa chỉ viết tay, hoặc "Mở trên Google Maps" khi địa chỉ là link. */
  protected readonly addressText = computed(() => {
    const p = this.place();
    return p.address.trim() || (p.mapsUrl ? 'Mở trên Google Maps' : '');
  });
}
