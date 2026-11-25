import { Component, output } from '@angular/core';

/** Tấm trượt từ dưới lên cho các thao tác ngắn: nội dung truyền vào qua ng-content. */
@Component({
  selector: 'app-bottom-sheet',
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="fixed inset-0 z-40 bg-ink/40" (click)="closed.emit()" aria-hidden="true"></div>
    <div
      role="dialog"
      aria-modal="true"
      class="fixed bottom-0 left-1/2 z-50 flex max-h-[85dvh] w-full max-w-[430px] -translate-x-1/2 flex-col gap-3.5 overflow-y-auto rounded-t-[28px] bg-white px-[22px] pb-[26px] pt-3"
    >
      <div class="h-[5px] w-10 flex-none self-center rounded-full bg-line"></div>
      <ng-content />
    </div>
  `,
})
export class BottomSheetComponent {
  readonly closed = output<void>();
}
