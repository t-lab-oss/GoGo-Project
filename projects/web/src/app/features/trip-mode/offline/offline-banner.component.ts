import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { OutboxService } from '../../../core/offline/outbox.service';
import { describeOp } from './offline.logic';

/** Báo đang offline và những việc chờ đồng bộ (thiết kế màn 27). Gọn một dòng, chạm để xem. */
@Component({
  selector: 'app-offline-banner',
  templateUrl: './offline-banner.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfflineBannerComponent {
  protected readonly outbox = inject(OutboxService);
  readonly tripId = input.required<string>();

  protected readonly expanded = signal(false);
  protected readonly items = computed(() => this.outbox.items().filter((i) => i.tripId === this.tripId()));
  protected readonly failed = computed(() => this.items().filter((i) => i.error).length);
  protected readonly visible = computed(() => !this.outbox.online() || this.items().length > 0);
  protected readonly describe = describeOp;

  protected readonly title = computed(() => {
    if (!this.outbox.online()) return 'Đang offline';
    if (this.failed() > 0) return `${this.failed()} mục chưa gửi được`;
    return this.outbox.syncing() ? 'Đang đồng bộ…' : 'Chờ đồng bộ';
  });
  protected readonly subtitle = computed(() => {
    const n = this.items().length;
    if (!this.outbox.online()) {
      return n ? `${n} mục chờ gửi, tự đồng bộ khi có mạng.` : 'Vẫn dùng được hôm nay, tự đồng bộ khi có mạng.';
    }
    return `${n} mục trên máy.`;
  });
}
