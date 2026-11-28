import { Injectable } from '@angular/core';
import { openDB, type IDBPDatabase } from 'idb';

export const CACHE_STORE = 'cache';
export const OUTBOX_STORE = 'outbox';

/**
 * Kho trên máy (IndexedDB). Trình duyệt chặn lưu trữ (chế độ riêng tư, hết chỗ) thì các hàm đọc trả
 * rỗng, hàm ghi ném lỗi để nơi gọi báo người dùng.
 */
@Injectable({ providedIn: 'root' })
export class OfflineDb {
  private db: Promise<IDBPDatabase> | null = null;
  /** Đổi tên trong test để không đụng dữ liệu thật. */
  name = 'gogo-offline';

  private open(): Promise<IDBPDatabase> {
    this.db ??= openDB(this.name, 1, {
      upgrade(db) {
        db.createObjectStore(CACHE_STORE);
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'seq', autoIncrement: true });
      },
    }).catch((err: unknown) => {
      this.db = null;
      throw err;
    });
    return this.db;
  }

  async getCache<T>(key: string): Promise<T | null> {
    try {
      return ((await (await this.open()).get(CACHE_STORE, key)) as T | undefined) ?? null;
    } catch {
      return null;
    }
  }

  /** Bộ nhớ đệm chỉ để dự phòng: ghi lỗi thì bỏ qua. */
  async setCache(key: string, value: unknown): Promise<void> {
    try {
      await (await this.open()).put(CACHE_STORE, value, key);
    } catch {
      // Không lưu được bản dự phòng, app vẫn chạy khi có mạng.
    }
  }

  async clearCache(): Promise<void> {
    try {
      await (await this.open()).clear(CACHE_STORE);
    } catch {
      // Không có gì để xoá.
    }
  }

  async all<T>(): Promise<T[]> {
    try {
      return (await (await this.open()).getAll(OUTBOX_STORE)) as T[];
    } catch {
      return [];
    }
  }

  async add(value: object): Promise<number> {
    return (await (await this.open()).add(OUTBOX_STORE, value)) as number;
  }

  async put(value: object): Promise<void> {
    await (await this.open()).put(OUTBOX_STORE, value);
  }

  async remove(seq: number): Promise<void> {
    await (await this.open()).delete(OUTBOX_STORE, seq);
  }
}
