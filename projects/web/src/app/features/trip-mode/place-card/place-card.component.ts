import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { Moment, TripPlace } from 'shared';
import { StarsComponent } from '../stars/stars.component';
import { directionsUrl, formatDistance, formatStars, placeGradient } from '../trip-mode.logic';

/** Thẻ quán vuông của Trip Mode: mặt trước ảnh phủ kín, chạm để lật sang mặt sau (FR-14). */
@Component({
  selector: 'app-place-card',
  imports: [StarsComponent],
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

  /** Ảnh chụp lúc check-in hôm nay, thay cho ảnh minh hoạ. */
  readonly checkinPhoto = input<Moment | null>(null);

  /** Số sao của check-in hôm nay, null nếu không chấm. */
  readonly rating = input<number | null>(null);
  /** Câu đánh giá của check-in hôm nay. */
  readonly review = input('');
  /** Mô tả ảnh của check-in hôm nay. */
  readonly caption = input('');

  readonly photoError = output<Moment>();
  readonly flipToggle = output<void>();
  readonly edit = output<void>();
  readonly checkin = output<void>();

  /** Các link ảnh tải lỗi: bỏ qua và dùng ảnh kế tiếp (ảnh minh hoạ, rồi gradient). */
  private readonly failedUrls = signal<readonly string[]>([]);

  private readonly ownPhoto = computed(() => {
    const m = this.checkinPhoto();
    return m && m.photoUrl && !this.failedUrls().includes(m.photoUrl) ? m : null;
  });
  protected readonly cover = computed(() => {
    const own = this.ownPhoto();
    if (own) return own.photoUrl;
    const url = this.place().image?.url;
    return url && !this.failedUrls().includes(url) ? url : null;
  });
  /** Ghi nguồn ảnh minh hoạ ở mặt sau. Đang hiện ảnh tự chụp thì không cần. */
  protected readonly credit = computed(() => (this.ownPhoto() ? null : this.place().image));

  protected onImageError(url: string): void {
    const own = this.ownPhoto();
    this.failedUrls.update((list) => [...list, url]);
    if (own && own.photoUrl === url) this.photoError.emit(own);
  }

  protected readonly gradient = computed(() => placeGradient(this.index()));
  protected readonly directions = computed(() => directionsUrl(this.place()));
  protected readonly distanceText = computed(() => {
    const d = this.distanceKm();
    return d === null ? null : formatDistance(d);
  });
  protected readonly formatStars = formatStars;
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
