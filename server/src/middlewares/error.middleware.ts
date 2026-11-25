import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/app-error';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'VALIDATION_ERROR', message: 'Đường dẫn không tồn tại.' } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu chưa hợp lệ, hãy kiểm tra lại các ô được nêu.',
        details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Có lỗi ở máy chủ, hãy thử lại sau ít phút.' },
  });
};
