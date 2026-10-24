import type { Response } from 'express';

// Único constructor del sobre de éxito (principio VII)
export function sendSuccess<T>(res: Response, status: number, message: string, data: T): void {
  res.status(status).json({ success: true, status, message, data });
}
