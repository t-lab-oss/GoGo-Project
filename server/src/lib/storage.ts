import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { AppError } from './app-error';

export interface StoredFile {
  size: number;
  contentType: string;
}

/** Kho ảnh (bucket private). Tách thành interface để test bằng bản giả, không gọi Supabase. */
export interface PhotoStorage {
  /** Signed URL để client PUT thẳng file lên. Cho ghi đè để gửi lại cùng ID vẫn được. */
  createUploadUrl(path: string): Promise<string>;
  /** Thông tin file, hoặc null nếu chưa được tải lên. */
  stat(path: string): Promise<StoredFile | null>;
  /** Signed URL để xem. Đường dẫn không có file thì không xuất hiện trong kết quả. */
  createDownloadUrls(paths: string[], expiresInSeconds: number): Promise<Map<string, string>>;
}

const upstream = (action: string, error: unknown) => {
  // Chỉ ghi thông điệp lỗi, không ghi URL hay khoá.
  console.error(`Storage ${action} failed:`, error instanceof Error ? error.message : 'unknown');
  return new AppError(502, 'STORAGE_UPSTREAM_ERROR', 'Kho ảnh đang lỗi, hãy thử lại sau ít phút.');
};

function isNotFound(error: unknown): boolean {
  const e = error as { status?: number; statusCode?: string; message?: string };
  return e.status === 404 || e.statusCode === '404' || /not.?found/i.test(e.message ?? '');
}

export function createSupabaseStorage(url: string, key: string, bucketName: string): PhotoStorage {
  const bucket = createClient(url, key, { auth: { persistSession: false } }).storage.from(bucketName);
  return {
    async createUploadUrl(path) {
      const { data, error } = await bucket.createSignedUploadUrl(path, { upsert: true });
      if (error) throw upstream('sign upload', error);
      return data.signedUrl;
    },
    async stat(path) {
      const { data, error } = await bucket.info(path);
      if (error) {
        if (isNotFound(error)) return null;
        throw upstream('info', error);
      }
      return { size: data.size ?? 0, contentType: data.contentType ?? '' };
    },
    async createDownloadUrls(paths, expiresInSeconds) {
      const out = new Map<string, string>();
      if (paths.length === 0) return out;
      const { data, error } = await bucket.createSignedUrls(paths, expiresInSeconds);
      if (error) throw upstream('sign download', error);
      for (const item of data) {
        if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
      }
      return out;
    },
  };
}

let override: PhotoStorage | null = null;
let cached: PhotoStorage | null = null;

/** Chỉ dùng trong test. */
export function setStorage(storage: PhotoStorage | null): void {
  override = storage;
}

export function getStorage(): PhotoStorage {
  if (override) return override;
  if (!cached) {
    if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
      throw new AppError(
        503,
        'STORAGE_NOT_CONFIGURED',
        'Chưa cấu hình kho ảnh. Hãy điền SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY vào .env rồi khởi động lại máy chủ.',
      );
    }
    cached = createSupabaseStorage(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, config.SUPABASE_BUCKET);
  }
  return cached;
}
