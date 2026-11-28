import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { Mood } from 'shared';
import { toApiError } from '../../../core/api/api-error';
import { StarsComponent } from '../stars/stars.component';
import { SwipeDirective } from '../swipe.directive';
import {
  formatStars,
  ratingFromPosition,
  ratingWord,
  type SwipeDirection,
  MOODS,
} from '../trip-mode.logic';
import { TripModeService } from '../trip-mode.service';
import { CheckinOutcome, CheckinSubmission, currentLocation } from './checkin-submission';
import { MomentSubmission } from './moment-submission';
import { CapturedPhoto, encodePhoto, grabSquare, squareFromFile } from './photo';

type CameraState = 'starting' | 'live' | 'unavailable' | 'processing' | 'review' | 'sending' | 'failed';
type Facing = 'environment' | 'user';

export interface PhotoFlight {
  blob: Blob;
  from: DOMRect;
}

/** Lý do không mở được camera, kèm cách xử lý. */
export function cameraErrorMessage(err: unknown): string {
  const name = (err as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera chưa được cấp quyền. Bật quyền camera cho trang này trong cài đặt trình duyệt rồi bấm thử lại, hoặc chọn ảnh từ máy.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Máy này không tìm thấy camera. Bạn có thể chọn ảnh từ máy.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'Camera đang được ứng dụng khác dùng. Đóng ứng dụng đó rồi bấm thử lại.';
  }
  return 'Chưa mở được camera. Bấm thử lại, hoặc chọn ảnh từ máy.';
}

/** Camera check-in toàn màn hình (FR-15): chụp ảnh vuông, xem lại, chấm sao rồi đăng. */
@Component({
  selector: 'app-camera',
  imports: [StarsComponent, SwipeDirective],
  templateUrl: './camera.component.html',
  styleUrl: './camera.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CameraComponent {
  private readonly api = inject(TripModeService);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly reviewPhoto = viewChild<ElementRef<HTMLElement>>('reviewPhoto');
  private readonly libraryInput = viewChild.required<ElementRef<HTMLInputElement>>('libraryInput');

  readonly tripId = input.required<string>();
  /** checkin: check-in một quán. moment: lưu khoảnh khắc, quán chỉ là gợi ý theo vị trí. */
  readonly mode = input<'checkin' | 'moment'>('checkin');
  readonly placeId = input('');
  readonly placeName = input('');
  readonly clusterName = input('');

  readonly done = output<CheckinOutcome>();
  /** Ảnh vừa đăng và vị trí của nó trên màn hình, để màn cha làm hiệu ứng bay vào album. */
  readonly flight = output<PhotoFlight>();
  /** attempted = đã từng gửi lên server, nên màn cha cần tải lại dữ liệu. */
  readonly closed = output<{ attempted: boolean }>();

  protected readonly state = signal<CameraState>('starting');
  protected readonly cameraMessage = signal('');
  protected readonly errorMessage = signal('');
  protected readonly previewUrl = signal<string | null>(null);
  /** Trang chú thích trên ảnh: 0 là mô tả (mặc định), 1 là đánh giá sao. Lướt ngang để đổi. */
  protected readonly page = signal(0);
  protected readonly caption = signal('');
  private starsDrag: { before: number; moved: boolean } | null = null;
  protected readonly formatStars = formatStars;
  protected readonly moods = MOODS;
  protected readonly mood = signal<Mood | null>(null);
  protected readonly momentPlace = signal('');
  protected readonly isMoment = computed(() => this.mode() === 'moment');
  /** Giờ chụp "HH:mm" hiện ở màn xem lại. */
  protected readonly takenTime = signal('');
  protected readonly ratingWord = computed(() => ratingWord(this.rating()));
  protected readonly rating = signal(0);
  protected readonly review = signal('');
  /** Đang ở màn xem ảnh để chấm sao và đăng (kể cả đang gửi hoặc gửi lỗi). */
  protected readonly reviewing = computed(() => ['review', 'sending', 'failed'].includes(this.state()));
  protected readonly fileName = `gogo-${Date.now()}.jpg`;
  /** Đã bấm đăng một lần thì khoá số sao, vì gửi lại cùng ID trả bản server đã lưu. */
  protected readonly ratingLocked = signal(false);
  protected readonly mirrored = signal(false);
  protected readonly busy = computed(() => this.state() === 'processing' || this.state() === 'sending');
  /** Còn đang ở bước chụp (chưa có ảnh hay lệnh check-in nào đang chờ). */
  protected readonly capturing = computed(() =>
    ['starting', 'live', 'unavailable'].includes(this.state()),
  );

  private facing: Facing = 'environment';
  private stream: MediaStream | null = null;
  private cameraToken = 0;
  private destroyed = false;
  private attempted = false;
  private submission: CheckinSubmission | MomentSubmission | null = null;
  private photoBlob: Blob | null = null;

  constructor() {
    afterNextRender(() => {
      this.panel().nativeElement.querySelector<HTMLElement>('[data-autofocus]')?.focus();
      void this.startCamera();
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stopCamera();
      this.setPreview(null);
    });
  }

  protected async startCamera(): Promise<void> {
    this.stopCamera();
    const token = this.cameraToken;
    this.state.set('starting');
    this.cameraMessage.set('');
    if (!navigator.mediaDevices?.getUserMedia) {
      this.showUnavailable('Trình duyệt chỉ cho mở camera trên HTTPS hoặc localhost. Bạn có thể chọn ảnh từ máy.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: this.facing }, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      });
      // Đã đóng màn hoặc đổi camera trong lúc chờ quyền: tắt ngay.
      if (this.destroyed || token !== this.cameraToken) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.mirrored.set(stream.getVideoTracks()[0]?.getSettings().facingMode !== 'environment');
      const video = this.video().nativeElement;
      video.srcObject = stream;
      await video.play();
    } catch (err) {
      if (this.destroyed || token !== this.cameraToken) return;
      this.stopCamera();
      this.showUnavailable(cameraErrorMessage(err));
    }
  }

  /** Video đã có khung hình thì mới cho chụp. */
  protected onPlaying(): void {
    if (this.state() === 'starting' && this.stream) this.state.set('live');
  }

  private showUnavailable(message: string): void {
    this.cameraMessage.set(message);
    this.state.set('unavailable');
  }

  private stopCamera(): void {
    this.cameraToken++;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  protected flip(): void {
    if (this.state() !== 'live') return;
    this.facing = this.facing === 'environment' ? 'user' : 'environment';
    void this.startCamera();
  }

  protected capture(): void {
    if (this.state() !== 'live') return;
    const video = this.video().nativeElement;
    const takenAt = new Date();
    let frame: HTMLCanvasElement;
    try {
      frame = grabSquare(video, video.videoWidth, video.videoHeight, this.mirrored());
    } catch {
      return;
    }
    this.stopCamera();
    void this.process(Promise.resolve(frame), takenAt);
  }

  protected onFile(event: Event): void {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0];
    field.value = '';
    if (!file || !this.capturing()) return;
    const takenAt = new Date();
    this.stopCamera();
    void this.process(squareFromFile(file), takenAt);
  }

  protected withoutPhoto(): void {
    if (!this.capturing() || this.isMoment()) return;
    this.stopCamera();
    this.prepare(null, new Date());
    this.showReview();
  }

  private async process(frame: Promise<HTMLCanvasElement>, takenAt: Date): Promise<void> {
    this.state.set('processing');
    let photo: CapturedPhoto;
    try {
      photo = await encodePhoto(await frame);
    } catch {
      if (this.destroyed) return;
      this.showUnavailable('Không đọc được ảnh này. Hãy chọn ảnh khác hoặc bấm thử lại camera.');
      return;
    }
    if (this.destroyed) return;
    this.setPreview(URL.createObjectURL(photo.photo));
    this.prepare(photo, takenAt);
    this.showReview();
  }

  private showReview(): void {
    this.state.set('review');
    this.focusId('cam-post');
  }

  private focusId(id: string): void {
    setTimeout(() => this.panel().nativeElement.querySelector<HTMLElement>(`#${id}`)?.focus(), 0);
  }

  private prepare(photo: CapturedPhoto | null, takenAt: Date): void {
    this.takenTime.set(takenAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
    this.photoBlob = photo?.photo ?? null;
    const base = { tripId: this.tripId(), takenAt, location: currentLocation() };
    if (this.isMoment() && photo) {
      this.momentPlace.set(this.placeName());
      const place = this.placeId() ? { id: this.placeId(), label: this.placeName() } : null;
      this.submission = new MomentSubmission(this.api, { ...base, photo, place });
      return;
    }
    this.submission = new CheckinSubmission(this.api, { ...base, placeId: this.placeId(), photo });
  }

  /** Chạm lại tâm trạng đang chọn thì bỏ chọn. */
  protected pickMood(mood: Mood): void {
    if (!this.ratingLocked()) this.mood.update((cur) => (cur === mood ? null : mood));
  }

  protected onPlaceInput(event: Event): void {
    this.momentPlace.set((event.target as HTMLInputElement).value);
  }

  /** Gửi check-in. Lỗi thì giữ ảnh, bấm thử lại dùng đúng ID cũ. */
  protected async send(): Promise<void> {
    const submission = this.submission;
    if (!submission || this.state() === 'sending') return;
    if (!this.ratingLocked()) {
      if (submission instanceof MomentSubmission) {
        submission.note = this.caption().trim();
        submission.mood = this.mood();
        submission.placeLabel = this.momentPlace().trim();
      } else {
        submission.rating = this.rating() || null;
        submission.review = this.review().trim();
        submission.caption = this.caption().trim();
      }
    }
    this.ratingLocked.set(true);
    this.state.set('sending');
    this.errorMessage.set('');
    this.attempted = true;
    try {
      const outcome = await submission.submit();
      if (this.destroyed) return;
      const frame = this.reviewPhoto()?.nativeElement;
      if (this.photoBlob && outcome.moment && frame) {
        this.flight.emit({ blob: this.photoBlob, from: frame.getBoundingClientRect() });
      }
      this.done.emit(outcome);
    } catch (err) {
      if (this.destroyed) return;
      const e = toApiError(err);
      this.errorMessage.set(
        e.code === 'INTERNAL_ERROR' ? 'Chưa gửi được. Hãy kiểm tra mạng rồi thử lại.' : e.message,
      );
      this.state.set('failed');
      this.focusId('cam-post');
    }
  }

  protected retake(): void {
    if (this.state() !== 'failed' && this.state() !== 'review') return;
    this.submission = null;
    this.rating.set(0);
    this.review.set('');
    this.caption.set('');
    this.mood.set(null);
    this.page.set(0);
    this.ratingLocked.set(false);
    this.setPreview(null);
    void this.startCamera();
  }

  private setPreview(url: string | null): void {
    const old = this.previewUrl();
    if (old) URL.revokeObjectURL(old);
    this.previewUrl.set(url);
  }

  /** Chạm hoặc kéo ngón tay trên dãy sao, mỗi nửa sao một nấc. */
  protected onStarsDown(event: PointerEvent): void {
    if (this.ratingLocked() || !event.isPrimary) return;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.starsDrag = { before: this.rating(), moved: false };
    this.rating.set(this.ratingAt(event));
  }

  protected onStarsMove(event: PointerEvent): void {
    if (!this.starsDrag || this.ratingLocked()) return;
    const value = this.ratingAt(event);
    if (value === this.rating()) return;
    this.starsDrag.moved = true;
    this.rating.set(value);
  }

  /** Chạm lại đúng số đang chọn (không kéo) thì bỏ chấm. */
  protected onStarsUp(): void {
    const drag = this.starsDrag;
    this.starsDrag = null;
    if (drag && !drag.moved && drag.before === this.rating()) this.rating.set(0);
  }

  private ratingAt(event: PointerEvent): number {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return ratingFromPosition((event.clientX - box.left) / box.width);
  }

  protected onStarsKey(event: KeyboardEvent): void {
    const step: Record<string, number> = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 };
    const delta = step[event.key];
    if (delta === undefined || this.ratingLocked()) return;
    event.preventDefault();
    this.rating.update((cur) => Math.max(0, Math.min(5, cur + delta)));
  }

  protected showPage(page: number): void {
    this.page.set(Math.max(0, Math.min(1, page)));
  }

  /**
   * Màn ngắm: lướt ngang đổi camera, lên mở thư viện, xuống đóng.
   * Màn xem lại: lướt ngang đổi Mô tả / Đánh giá, lên đăng, xuống chụp lại.
   */
  protected onSwipe(direction: SwipeDirection): void {
    if (this.reviewing()) {
      if (direction === 'left') this.showPage(1);
      else if (direction === 'right') this.showPage(0);
      else if (direction === 'up') void this.send();
      else this.retake();
      return;
    }
    if (direction === 'down') this.close();
    else if (direction === 'up') {
      if (this.capturing()) this.libraryInput().nativeElement.click();
    } else this.flip();
  }

  protected onCaptionInput(event: Event): void {
    this.caption.set((event.target as HTMLInputElement).value);
  }

  protected onReviewInput(event: Event): void {
    this.review.set((event.target as HTMLInputElement).value);
  }

  protected close(): void {
    if (this.busy()) return;
    this.stopCamera();
    this.closed.emit({ attempted: this.attempted });
  }

  /** Esc đóng, Tab xoay vòng trong màn camera. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(
      this.panel().nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]):not([type="file"]), a[href], [tabindex="0"]',
      ),
    ).filter((el) => el.offsetParent !== null);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
