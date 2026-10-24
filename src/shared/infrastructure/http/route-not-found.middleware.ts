import type { RequestHandler } from 'express';

import { AppError } from '../../domain/app.error.js';

// Cualquier ruta o método que no haya resuelto ningún router (RF-46 nivel 1)
export const routeNotFoundMiddleware: RequestHandler = (_req, _res, next) => {
  next(new AppError('ROUTE_NOT_FOUND'));
};
