import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Hình tròn đại diện: ảnh nếu có, không thì chữ cái đầu. Cỡ, màu nền và cỡ chữ đặt bằng class ở nơi dùng. */
@Component({
  selector: 'app-avatar',
  host: { class: 'flex flex-none items-center justify-center overflow-hidden rounded-full font-bold' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src(); as url) {
      <img class="h-full w-full object-cover" [src]="url" alt="" />
    } @else {
      <span aria-hidden="true">{{ initial() }}</span>
    }
  `,
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly src = input<string | null | undefined>(null);
  protected readonly initial = computed(() => this.name().charAt(0).toUpperCase());
}
