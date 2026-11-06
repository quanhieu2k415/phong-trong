import type { ErrorRequestHandler } from 'express';
import type { z } from 'zod';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const pgErrorCode = (error: unknown): string | undefined =>
  (error as { code?: string } | null)?.code;

export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION', 'Dữ liệu gửi lên không hợp lệ.');
  }
  return result.data;
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  const status = (error as { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: { code: 'BAD_REQUEST', message: 'Yêu cầu không hợp lệ.' } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Máy chủ gặp lỗi, vui lòng thử lại.' } });
};
