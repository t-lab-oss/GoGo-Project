import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { toApiError } from '../api/api-error';
import { isNetworkError } from './network';
import { OfflineDb } from './offline-db';
import { OUTBOX_SENDER } from './outbox.sender';
import type { OutboxItem, OutboxOp } from './outbox.types';

const RETRY_EVERY_MS = 20_000;

/**
 * Hàng đợi việc làm lúc mất mạng (FR-18): check-in, ảnh, khoảnh khắc, chi tiêu. Gửi tuần tự theo thứ tự
 * tạo; mọi lệnh đều idempotent vì ID do client sinh nên gửi lại không tạo trùng.
 */
@Injectable({ providedIn: 'root' })
export class OutboxService {
  private readonly db = inject(OfflineDb);
  private readonly auth = inject(AuthService);
  private readonly sender = inject(OUTBOX_SENDER);

  private readonly _items = signal<OutboxItem[]>([]);
  readonly items = this._items.asReadonly();
  readonly waiting = computed(() => this._items().filter((i) => !i.error).length);

  private readonly _online = signal(typeof navigator === 'undefined' || navigator.onLine);
  /** false khi trình duyệt báo mất mạng hoặc lần gửi gần nhất không tới được máy chủ. */
  readonly online = this._online.asReadonly();

  private readonly _syncedCount = signal(0);
  /** Tăng mỗi khi có mục được gửi xong, để màn hình tải lại dữ liệu. */
  readonly syncedCount = this._syncedCount.asReadonly();
  readonly syncing = signal(false);

  private flushing: Promise<void> | null = null;
  /** Có yêu cầu gửi mới trong lúc đang gửi: chạy thêm một lượt để không sót mục vừa thêm. */
  private again = false;

  constructor() {
    const onOnline = () => {
      this._online.set(true);
      void this.flush();
    };
    const onOffline = () => this._online.set(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && this.waiting() > 0) void this.flush();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => {
      if (this.waiting() > 0 || !this._online()) void this.flush();
    }, RETRY_EVERY_MS);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    });
    // Đổi người dùng thì chỉ thấy và gửi hàng đợi của người đó.
    effect(() => {
      const userId = this.auth.user()?.id;
      untracked(() => void this.reload(userId).then(() => this.flush()));
    });
  }

  /** Đánh dấu không tới được máy chủ (một request vừa lỗi mạng). */
  markOffline(): void {
    this._online.set(false);
  }

  markOnline(): void {
    this._online.set(true);
  }

  hasCheckin(checkinId: string): boolean {
    return this._items().some((i) => i.op.kind === 'checkin' && i.op.checkinId === checkinId);
  }

  async enqueue(tripId: string, op: OutboxOp): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) throw new Error('NOT_SIGNED_IN');
    // Cùng một check-in thì số tiền hoặc số lần bỏ qua mới nhất thay bản cũ.
    if (op.kind === 'expense' || op.kind === 'skip') {
      const stale = this._items().filter(
        (i) => i.op.kind === op.kind && 'checkinId' in i.op && i.op.checkinId === op.checkinId,
      );
      for (const i of stale) await this.db.remove(i.seq);
    }
    await this.db.add({ userId, tripId, createdAt: new Date().toISOString(), error: null, op });
    await this.reload(userId);
  }

  /** Gửi hàng đợi. Không bao giờ chạy hai lượt song song. */
  flush(): Promise<void> {
    if (this.flushing) {
      this.again = true;
      return this.flushing;
    }
    this.flushing = (async () => {
      do {
        this.again = false;
        await this.run();
      } while (this.again);
    })().finally(() => {
      this.flushing = null;
      this.syncing.set(false);
    });
    return this.flushing;
  }

  async retry(seq: number): Promise<void> {
    const item = this._items().find((i) => i.seq === seq);
    if (!item) return;
    await this.db.put({ ...item, error: null });
    await this.reload(item.userId);
    await this.flush();
  }

  /** Bỏ một mục. Bỏ check-in thì bỏ luôn chi tiêu và lời bỏ qua phụ thuộc vào nó. */
  async discard(seq: number): Promise<void> {
    const item = this._items().find((i) => i.seq === seq);
    if (!item) return;
    const doomed = [item];
    if (item.op.kind === 'checkin') {
      const id = item.op.checkinId;
      doomed.push(...this._items().filter((i) => i !== item && 'checkinId' in i.op && i.op.checkinId === id));
    }
    for (const i of doomed) await this.db.remove(i.seq);
    await this.reload(item.userId);
  }

  async reload(userId: string | undefined = this.auth.user()?.id): Promise<void> {
    const all = await this.db.all<OutboxItem>();
    this._items.set(all.filter((i) => i.userId === userId).sort((a, b) => a.seq - b.seq));
  }

  private async run(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    await this.reload(userId);
    if (this.waiting() === 0) {
      // Không còn gì để gửi: thử xem máy chủ đã tới được chưa.
      if (!this._online() && (await this.sender.ping())) this._online.set(true);
      return;
    }
    this.syncing.set(true);
    const tried = new Set<number>();
    for (;;) {
      const item = this._items().find((i) => !i.error && !tried.has(i.seq));
      if (!item || this.auth.user()?.id !== userId) return;
      tried.add(item.seq);
      try {
        const result = await this.sender.send(item.tripId, item.op);
        this._online.set(true);
        // Quán đã được người khác check-in: chi tiêu chờ gửi chuyển sang check-in đó.
        if (item.op.kind === 'checkin' && result.existingCheckinId) {
          await this.remap(item.op.checkinId, result.existingCheckinId);
        }
        await this.db.remove(item.seq);
        await this.reload(userId);
        this._syncedCount.update((n) => n + 1);
      } catch (err) {
        if (isNetworkError(err)) {
          this._online.set(false);
          return;
        }
        const { code, message } = toApiError(err);
        if (code === 'UNAUTHENTICATED') return;
        // Check-in chưa tới máy chủ: giữ lại, lượt sau gửi (API Contract mục 1).
        if (code === 'CHECKIN_NOT_FOUND' && 'checkinId' in item.op && this.hasCheckin(item.op.checkinId)) continue;
        await this.db.put({ ...item, error: message });
        await this.reload(userId);
      }
    }
  }

  private async remap(from: string, to: string): Promise<void> {
    for (const i of this._items()) {
      if ((i.op.kind === 'expense' || i.op.kind === 'skip') && i.op.checkinId === from) {
        await this.db.put({ ...i, op: { ...i.op, checkinId: to } });
      }
    }
    await this.reload();
  }
}
