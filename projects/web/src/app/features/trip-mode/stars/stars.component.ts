import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { starFills } from '../trip-mode.logic';

/** Dãy 5 sao hiển thị được nửa sao. Chỉ để vẽ, nhãn cho trình đọc màn hình đặt ở thẻ bọc ngoài. */
@Component({
  selector: 'app-stars',
  template: `
    @for (fill of fills(); track $index) {
      <span class="relative block flex-none" [style.width.px]="size()" [style.height.px]="size()">
        <svg class="absolute inset-0" [class]="emptyClass()" [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="currentColor">
          <path [attr.d]="path" />
        </svg>
        <span class="absolute inset-y-0 left-0 overflow-hidden" [style.width.%]="fill">
          <svg class="block max-w-none text-[#ffb800]" [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="currentColor">
            <path [attr.d]="path" />
          </svg>
        </span>
      </span>
    }
  `,
  host: { class: 'inline-flex gap-1', 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StarsComponent {
  readonly value = input.required<number>();
  readonly size = input(18);
  /** Màu phần sao chưa chấm. */
  readonly emptyClass = input('text-white/30');

  protected readonly fills = computed(() => starFills(this.value()));
  protected readonly path = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.2-5.9 3.2 1.2-6.5L2.5 9.4l6.6-.9z';
}
