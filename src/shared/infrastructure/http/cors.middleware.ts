import type { Request, RequestHandler, Router } from 'express';

import { AppError } from '../../domain/app.error.js';
import { sendSuccess } from './response-envelope.helper.js';

// Cabeceras que el frontend puede enviar (RF-36) y tiempo que el navegador recuerda la respuesta previa
const ALLOWED_HEADERS = 'Content-Type, X-CSRF-Token, X-Client-Time, X-Timezone';
const PREFLIGHT_MAX_AGE_SECONDS = 600;

// Petición previa de CORS: OPTIONS con Origin y el método que el navegador quiere usar
export function isPreflight(req: Request): boolean {
  return req.method === 'OPTIONS' && Boolean(req.header('origin')) && Boolean(req.header('access-control-request-method'));
}

// Solo al origen del frontend se le permite leer las respuestas con cookies (RF-35). Se monta en primer
// lugar para que también los errores lleven las cabeceras y el frontend pueda leerlos (D-7)
export function createCorsMiddleware(allowedOrigin: string): RequestHandler {
  return (req, res, next) => {
    if (req.header('origin') === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.vary('Origin');
    }
    next();
  };
}

// Registra la respuesta a la petición previa de una ruta: 200 con el sobre de éxito si el método pedido es
// uno de los suyos, ROUTE_NOT_FOUND si no (RF-36, principio VII). Las demás comprobaciones (origen y que sea
// una petición previa) las hace antes allowed-method.middleware
export function allowPreflight(router: Router, path: string, methods: readonly string[]): void {
  router.options(path, (req, res, next) => {
    const requested = req.header('access-control-request-method')?.toUpperCase() ?? '';
    if (!methods.includes(requested)) {
      next(new AppError('ROUTE_NOT_FOUND'));
      return;
    }
    res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    res.setHeader('Access-Control-Max-Age', String(PREFLIGHT_MAX_AGE_SECONDS));
    sendSuccess(res, 200, 'Operación realizada con éxito', null);
  });
}
