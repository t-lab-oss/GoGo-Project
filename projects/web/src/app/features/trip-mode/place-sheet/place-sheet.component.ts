import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { FormsModule } from '@angular/forms';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { extractDish } from 'shared';
import type { Cluster, PlaceImage, PlaceImageResult, TripPlace } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { SwipeDirective } from '../swipe.directive';
import { PlaceInput, TripModeService } from '../trip-mode.service';
import {
  clusterRange,
  isSelectedImage,
  looksLikeLink,
  normalizeLink,
  toPlaceImage,
} from '../trip-mode.logic';

type ErrorKey = 'label' | 'address' | 'clusterId';
type LookupState = 'idle' | 'loading' | 'ok' | 'warn' | 'error';
type ImageSearchState = 'idle' | 'loading' | 'done' | 'error';

/** Kết quả đọc link: toạ độ có thể trống (link không có toạ độ) hoặc lỗi tạm thời. */
interface Resolved {
  url: string;
  lat: number | null;
  lng: number | null;
  label: string;
  /** 'failed' là lỗi tạm thời (mạng, quá tải): vẫn lưu được nhưng không nhớ kết quả để thử lại sau. */
  status: 'ok' | 'no-coordinates' | 'failed';
  message?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Chờ người dùng ngừng gõ tên quán rồi mới nhận diện món. */
const DISH_DETECT_DELAY_MS = 600;

/** Ánh xạ tên trường của API sang ô trên form. */
function errorKeyFor(field: string): ErrorKey | null {
  switch (field) {
    case 'label':
    case 'clusterId':
    case 'address':
      return field;
    case 'mapsUrl':
    case 'lat':
    case 'lng':
      return 'address';
    default:
      return null;
  }
}

/**
 * Bottom sheet thêm hoặc sửa quán, chỉ có Tên, Địa chỉ và Cụm. Địa chỉ là link Google Maps thì
 * server đọc tên và toạ độ từ link (không gọi API bản đồ); là chữ thường thì lưu nguyên văn.
 */
@Component({
  selector: 'app-place-sheet',
  imports: [FormsModule, SwipeDirective],
  templateUrl: './place-sheet.component.html',
  styleUrl: './place-sheet.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceSheetComponent implements OnInit {
  private readonly api = inject(TripModeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  readonly tripId = input.required<string>();
  readonly clusters = input.required<readonly Cluster[]>();
  readonly defaultClusterId = input<string | null>(null);
  /** Có quán thì là sửa, không thì là thêm mới. */
  readonly place = input<TripPlace | null>(null);

  readonly saved = output<TripPlace>();
  readonly closed = output<void>();

  protected readonly isEdit = computed(() => this.place() !== null);
  protected readonly formatRange = clusterRange;

  protected readonly label = signal('');
  protected readonly address = signal('');
  protected readonly clusterId = signal('');

  protected readonly errors = signal<Partial<Record<ErrorKey, string>>>({});
  protected readonly formError = signal('');
  protected readonly lookupState = signal<LookupState>('idle');
  protected readonly lookupMessage = signal('');
  protected readonly saving = signal(false);

  // Ảnh minh hoạ: tự tìm trên Wikimedia Commons theo món nhận ra trong tên quán.
  protected readonly image = signal<PlaceImage | null>(null);
  /** Món nhận ra trong tên quán. Rỗng nếu tên không có món. */
  protected readonly dish = signal('');
  protected readonly imageState = signal<ImageSearchState>('idle');
  protected readonly imageMessage = signal('');
  protected readonly imageResults = signal<PlaceImageResult[]>([]);
  protected readonly isSelectedImage = isSelectedImage;
  /** Món của ảnh đang chọn. Tên đổi sang món khác thì bỏ ảnh cũ. */
  private imageDish: string | null = null;

  /** Link đã đọc xong (hoặc link của quán đang sửa). Cùng link thì không đọc lại. */
  private resolved: Resolved | null = null;
  /** Người dùng đã tự gõ tên thì lần đọc link sau không ghi đè. */
  private labelTouched = false;
  private lookupToken = 0;
  private imageToken = 0;
  private detectTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    afterNextRender(() => {
      this.panel().nativeElement.querySelector<HTMLElement>('#ps-label')?.focus();
    });
    this.destroyRef.onDestroy(() => {
      this.lookupToken++;
      this.imageToken++;
      clearTimeout(this.detectTimer);
    });
  }

  ngOnInit(): void {
    const p = this.place();
    const first = this.clusters()[0]?.id ?? '';
    this.clusterId.set(p?.clusterId ?? this.defaultClusterId() ?? first);
    if (!p) return;
    this.label.set(p.label);
    this.labelTouched = true;
    this.address.set(p.mapsUrl ?? p.address);
    this.image.set(p.image);
    if (p.image) this.imageDish = extractDish(p.label);
    this.detectDish();
    if (p.mapsUrl) {
      this.resolved = {
        url: p.mapsUrl,
        lat: p.lat,
        lng: p.lng,
        label: p.label,
        status: p.lat === null ? 'no-coordinates' : 'ok',
      };
    }
  }

  protected setError(key: ErrorKey, message: string): void {
    this.errors.update((e) => ({ ...e, [key]: message }));
  }

  protected clearError(...keys: ErrorKey[]): void {
    this.errors.update((e) => {
      const next = { ...e };
      for (const k of keys) delete next[k];
      return next;
    });
    this.formError.set('');
  }

  protected onLabelInput(value: string): void {
    this.labelTouched = true;
    this.label.set(value);
    this.clearError('label');
    this.scheduleDishDetect();
  }

  protected onAddressInput(value: string): void {
    this.address.set(value);
    this.clearError('address');
    this.lookupState.set('idle');
    this.lookupToken++;
  }

  /** Dán link vào ô Địa chỉ thì đọc ngay để điền tên. */
  protected onAddressPaste(): void {
    // Đợi giá trị dán vào ô rồi mới đọc.
    setTimeout(() => this.readOnPaste(), 0);
  }

  private readOnPaste(): void {
    const text = this.address().trim();
    if (!looksLikeLink(text)) return;
    const url = normalizeLink(text);
    if (this.resolved?.url === url || this.lookupState() === 'loading') return;
    this.clearError('address');
    this.lookupState.set('loading');
    this.lookupMessage.set('Đang đọc link…');
    const token = ++this.lookupToken;
    this.lookup(url).subscribe({
      next: (r) => {
        if (token !== this.lookupToken) return;
        this.applyResolved(r, true);
      },
      error: (err: unknown) => {
        if (token !== this.lookupToken) return;
        this.lookupState.set('idle');
        this.setError('address', toApiError(err).message);
      },
    });
  }

  /**
   * Đọc link ở server. Link sai host ném lỗi để hiện ngay ở ô Địa chỉ. Link không có toạ độ hoặc lỗi
   * tạm thời không chặn lưu: coi như địa chỉ có link nhưng chưa có toạ độ.
   */
  private lookup(url: string): Observable<Resolved> {
    return this.api.lookupLink(this.tripId(), url).pipe(
      map(
        (c): Resolved => ({ url, lat: c.lat, lng: c.lng, label: c.label, status: 'ok' }),
      ),
      catchError((err: unknown) => {
        const e = toApiError(err);
        if (e.code === 'INVALID_MAPS_URL') return throwError(() => err);
        if (e.code === 'PLACE_NOT_RESOLVED') {
          return of<Resolved>({ url, lat: null, lng: null, label: '', status: 'no-coordinates' });
        }
        return of<Resolved>({ url, lat: null, lng: null, label: '', status: 'failed', message: e.message });
      }),
    );
  }

  /** Ghi nhận kết quả đọc link: nhớ lại, điền tên nếu đang trống, báo nhẹ nếu thiếu toạ độ. */
  private applyResolved(r: Resolved, showStatus: boolean): void {
    if (r.status !== 'failed') this.resolved = r;
    if (r.label && (!this.labelTouched || !this.label().trim())) {
      this.label.set(r.label);
      this.labelTouched = false;
      this.clearError('label');
      this.scheduleDishDetect();
    }
    if (!showStatus) return;
    if (r.status === 'ok') {
      this.lookupState.set('ok');
      this.lookupMessage.set(r.label ? `Đã đọc: ${r.label}` : 'Đã đọc link, hãy nhập tên quán.');
    } else if (r.status === 'no-coordinates') {
      this.lookupState.set('warn');
      this.lookupMessage.set('Link này không có toạ độ nên chưa tính được khoảng cách. Bạn vẫn lưu được quán.');
    } else {
      this.lookupState.set('error');
      this.lookupMessage.set(`${r.message ?? 'Chưa đọc được link.'} Bạn vẫn lưu được quán.`);
    }
  }

  // ---------- Ảnh minh hoạ ----------

  /** Đợi người dùng ngừng gõ rồi mới nhận diện. */
  private scheduleDishDetect(): void {
    clearTimeout(this.detectTimer);
    this.detectTimer = setTimeout(() => this.detectDish(), DISH_DETECT_DELAY_MS);
  }

  /** Phân tích tên quán. Có món thì tìm ảnh ngay, chỉ gọi lại khi món đổi. Người dùng tự chọn ảnh. */
  protected detectDish(): void {
    clearTimeout(this.detectTimer);
    const dish = extractDish(this.label()) ?? '';
    if (dish === this.dish() && this.imageState() !== 'error') return;
    if (dish && this.imageDish && this.imageDish !== dish) {
      this.image.set(null);
      this.imageDish = null;
    }
    this.dish.set(dish);
    if (dish) {
      this.searchImages();
      return;
    }
    this.imageToken++;
    this.imageResults.set([]);
    this.imageState.set('idle');
  }

  protected searchImages(): void {
    const q = this.dish();
    if (!q) return;
    this.imageState.set('loading');
    this.imageMessage.set('');
    this.imageResults.set([]);
    const token = ++this.imageToken;
    this.api.searchImages(this.tripId(), q).subscribe({
      next: (items) => {
        if (token !== this.imageToken) return;
        this.imageResults.set(items);
        this.imageState.set('done');
      },
      error: (err: unknown) => {
        if (token !== this.imageToken) return;
        this.imageState.set('error');
        this.imageMessage.set(toApiError(err).message);
      },
    });
  }

  protected pickImage(result: PlaceImageResult): void {
    // Chọn lại đúng ảnh đang chọn thì bỏ chọn.
    const unpick = isSelectedImage(this.image(), result);
    this.image.set(unpick ? null : toPlaceImage(result));
    this.imageDish = unpick ? null : this.dish();
  }

  protected removeImage(): void {
    this.image.set(null);
    this.imageDish = null;
    this.focusId('ps-label');
  }

  private focusId(id: string): void {
    setTimeout(() => this.panel().nativeElement.querySelector<HTMLElement>(`#${id}`)?.focus(), 0);
  }

  protected close(): void {
    if (this.saving()) return;
    this.closed.emit();
  }

  /** Esc đóng sheet, Tab xoay vòng trong sheet. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(this.panel().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null,
    );
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusFirstError(): void {
    setTimeout(() => {
      this.panel().nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }, 0);
  }

  protected submit(): void {
    if (this.saving()) return;
    this.formError.set('');
    const text = this.address().trim();
    const isLink = looksLikeLink(text);

    const errors: Partial<Record<ErrorKey, string>> = {};
    if (!this.clusterId()) errors.clusterId = 'Hãy chọn cụm cho quán.';
    if (!text) errors.address = 'Hãy nhập địa chỉ hoặc dán link Google Maps.';
    else if (!isLink && text.length > 200) errors.address = 'Địa chỉ tối đa 200 ký tự.';
    const label = this.label().trim();
    if (label.length > 80) errors.label = 'Tên quán tối đa 80 ký tự.';
    // Tên trống mà địa chỉ là link thì đợi đọc link có thể điền sẵn tên.
    if (!label && !isLink) errors.label = 'Hãy nhập tên quán.';
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) {
      this.focusFirstError();
      return;
    }

    if (!isLink) {
      this.send(null);
      return;
    }
    const url = normalizeLink(text);
    if (this.resolved?.url === url) {
      this.send(this.resolved);
      return;
    }
    this.saving.set(true);
    this.lookup(url).subscribe({
      next: (r) => {
        this.applyResolved(r, false);
        this.send(r);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.setError('address', toApiError(err).message);
        this.focusFirstError();
      },
    });
  }

  /** Gửi lên server. `link` null nghĩa là địa chỉ viết tay. */
  private send(link: Resolved | null): void {
    const label = this.label().trim();
    if (!label) {
      this.saving.set(false);
      this.setError('label', 'Hãy nhập tên quán.');
      this.focusFirstError();
      return;
    }
    const image = this.image();
    const input: PlaceInput = link
      ? { clusterId: this.clusterId(), label, address: '', mapsUrl: link.url, lat: link.lat, lng: link.lng, image }
      : {
          clusterId: this.clusterId(),
          label,
          address: this.address().trim(),
          mapsUrl: null,
          lat: null,
          lng: null,
          image,
        };

    this.saving.set(true);
    const place = this.place();
    const request = place
      ? this.api.updatePlace(this.tripId(), place.id, input)
      : this.api.createPlace(this.tripId(), input);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.saved.emit(saved);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.showServerError(err);
      },
    });
  }

  private showServerError(err: unknown): void {
    const e = toApiError(err);
    if (e.code === 'INVALID_MAPS_URL') {
      this.setError('address', e.message);
      this.focusFirstError();
      return;
    }
    if (e.code === 'VALIDATION_ERROR' && Array.isArray(e.details)) {
      let mapped = false;
      for (const d of e.details as { field?: string; message?: string }[]) {
        const key = d.field ? errorKeyFor(d.field) : null;
        if (key && d.message) {
          this.setError(key, d.message);
          mapped = true;
        }
      }
      if (mapped) {
        this.focusFirstError();
        return;
      }
    }
    this.formError.set(e.message);
  }
}
