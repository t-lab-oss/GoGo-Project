import { HttpErrorResponse } from '@angular/common/http';

/**
 * Lỗi do mất mạng hoặc không tới được máy chủ (gửi lại sau sẽ được), khác với lỗi máy chủ từ chối.
 * Phản hồi có `error.code` là máy chủ đã trả lời, trừ lỗi cổng trung gian không kèm mã.
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return true;
    const code = (err.error as { error?: { code?: string } } | null)?.error?.code;
    return !code && err.status >= 500;
  }
  const e = err as { name?: string; message?: string } | null;
  if (!e) return false;
  // fetch tải ảnh: mất mạng ném TypeError, quá hạn ném TimeoutError/AbortError.
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return true;
  if (e.name === 'TypeError' && /fetch|network|load failed/i.test(e.message ?? '')) return true;
  return /^UPLOAD_FAILED_(5\d\d|429)$/.test(e.message ?? '');
}
