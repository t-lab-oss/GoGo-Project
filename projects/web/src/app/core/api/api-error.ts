import { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorBody, ErrorCode } from 'shared';

export interface ApiError {
  code: ErrorCode | 'NETWORK';
  message: string;
  details?: unknown;
}

/** Đổi lỗi HttpClient thành lỗi API có `code` và `message` tiếng Việt. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as Partial<ApiErrorBody> | null;
    if (body?.error?.code) {
      return { code: body.error.code, message: body.error.message, details: body.error.details };
    }
    if (err.status === 0) {
      return {
        code: 'NETWORK',
        message: 'Không kết nối được máy chủ, hãy kiểm tra mạng rồi thử lại.',
      };
    }
  }
  return { code: 'INTERNAL_ERROR', message: 'Có lỗi xảy ra, hãy thử lại sau ít phút.' };
}
