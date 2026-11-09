export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Avtorizatsiya talab qilinadi') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = "Bu amal uchun ruxsat yo'q") => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Topilmadi') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (msg: string, details?: unknown) => new AppError(409, 'CONFLICT', msg, details);
