import type { RequestHandler } from 'express';

import { AppError } from '../../domain/app.error.js';

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);

// Primer middleware de la app: evita las respuestas automáticas de Express a OPTIONS y HEAD,
// que saldrían fuera del sobre (plan, D-19; RF-46 nivel 1)
export const allowedMethodMiddleware: RequestHandler = (req, _res, next) => {
  if (!ALLOWED_METHODS.has(req.method)) {
    next(new AppError('ROUTE_NOT_FOUND'));
    return;
  }
  next();
};
