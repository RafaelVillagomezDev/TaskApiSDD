import type { Request, RequestHandler } from 'express';

import { AppError } from '../../../shared/domain/app.error.js';
import { ACCESS_TOKEN_COOKIE, readCookie } from '../../../shared/infrastructure/http/cookie.helper.js';
import { setSessionContext } from '../../../shared/infrastructure/http/session-context.helper.js';
import type { AuthenticateSessionUseCase } from '../application/authenticate-session.use-case.js';

// Métodos que modifican y por eso exigen X-CSRF-Token (RF-23)
const CSRF_PROTECTED_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

// X-CSRF-Token obligatorio: si falta, INVALID_CSRF_TOKEN antes que cualquier error de sesión (RF-34)
export function requireCsrfHeader(req: Request): string {
  const csrfToken = req.header('x-csrf-token');
  if (!csrfToken) {
    throw new AppError('INVALID_CSRF_TOKEN');
  }
  return csrfToken;
}

// Rutas protegidas: CSRF de la sesión en POST/PATCH/DELETE y sesión, en el orden de RF-34 y la decisión 19,
// en un solo paso (D-6). Deja el SessionContext para el contexto de petición y los controladores
export function createSessionMiddleware(authenticate: AuthenticateSessionUseCase): RequestHandler {
  return async (req, res, next) => {
    try {
      const csrfToken = CSRF_PROTECTED_METHODS.has(req.method) ? requireCsrfHeader(req) : undefined;
      const context = await authenticate.execute({ accessToken: readCookie(req, ACCESS_TOKEN_COOKIE), csrfToken });
      setSessionContext(res, context);
      next();
    } catch (error) {
      next(error);
    }
  };
}
