import { Directive, ElementRef, inject, input, output } from '@angular/core';
import { swipeDirection, type SwipeDirection } from './trip-mode.logic';

/** Chỗ tự xử lý thao tác kéo của riêng nó, vuốt bắt đầu ở đây thì bỏ qua. */
const IGNORE = 'input, textarea, select, [role="slider"], [role="dialog"], [data-noswipe]';

/**
 * Nhận thao tác lướt bằng ngón tay (hoặc kéo chuột). Phần tử gắn directive cần đặt `touch-action`
 * phù hợp để trình duyệt không giành hướng lướt đó cho việc cuộn trang.
 */
@Directive({
  selector: '[appSwipe]',
  host: {
    '(pointerdown)': 'start($event)',
    '(pointerup)': 'end($event)',
    '(pointercancel)': 'cancel()',
  },
})
export class SwipeDirective {
  /** Quãng tối thiểu (px). Hướng dọc để dài hơn cho những thao tác khó hoàn tác. */
  readonly swipeMinX = input(48);
  readonly swipeMinY = input(64);
  readonly appSwipe = output<SwipeDirection>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private origin: { x: number; y: number; id: number; horizontalOnly: boolean } | null = null;
  private swallow = false;

  constructor() {
    // Lướt xong trình duyệt có thể vẫn phát "click": chặn lại để không bấm nhầm nút bên dưới.
    this.host.addEventListener(
      'click',
      (event) => {
        if (!this.swallow) return;
        this.swallow = false;
        event.stopPropagation();
        event.preventDefault();
      },
      { capture: true },
    );
  }

  protected start(event: PointerEvent): void {
    this.origin = null;
    this.swallow = false;
    if (!event.isPrimary) return;
    let ignored = (event.target as Element).closest(IGNORE);
    // Ô có data-swipe-x chưa được chọn thì vẫn lướt ngang qua được; đang gõ thì để yên cho con trỏ.
    const horizontalOnly = !!ignored?.matches('[data-swipe-x]') && ignored !== document.activeElement;
    if (horizontalOnly) ignored = ignored!.parentElement?.closest(IGNORE) ?? null;
    if (ignored && ignored !== this.host && this.host.contains(ignored)) return;
    this.origin = { x: event.clientX, y: event.clientY, id: event.pointerId, horizontalOnly };
  }

  protected end(event: PointerEvent): void {
    const from = this.origin;
    this.origin = null;
    if (!from || from.id !== event.pointerId) return;
    const dir = swipeDirection(
      event.clientX - from.x,
      event.clientY - from.y,
      this.swipeMinX(),
      this.swipeMinY(),
    );
    if (!dir || (from.horizontalOnly && (dir === 'up' || dir === 'down'))) return;
    this.swallow = true;
    setTimeout(() => (this.swallow = false), 50);
    this.appSwipe.emit(dir);
  }

  protected cancel(): void {
    this.origin = null;
  }
}
