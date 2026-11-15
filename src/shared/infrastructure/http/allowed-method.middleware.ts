import type { RequestHandler } from 'express';

import { AppError } from '../../domain/app.error.js';
import { isPreflight } from './cors.middleware.js';

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);

// Primer middleware tras CORS: evita las respuestas automáticas de Express a OPTIONS y HEAD, que saldrían
// fuera del sobre (plan de la 001, D-19; RF-34 nivel 1). Solo deja pasar OPTIONS cuando es la petición
// previa de CORS del origen permitido, para que la responda la ruta (RF-36 de la 002)
export function createAllowedMethodMiddleware(allowedOrigin?: string): RequestHandler {
  return (req, _res, next) => {
    const isAllowedPreflight =
      allowedOrigin !== undefined && isPreflight(req) && req.header('origin') === allowedOrigin;
    if (!ALLOWED_METHODS.has(req.method) && !isAllowedPreflight) {
      next(new AppError('ROUTE_NOT_FOUND'));
      return;
    }
    next();
  };
}
