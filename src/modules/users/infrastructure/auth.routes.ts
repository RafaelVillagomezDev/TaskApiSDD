import { type RequestHandler, Router } from 'express';

import { allowPreflight } from '../../../shared/infrastructure/http/cors.middleware.js';
import { jsonBodyMiddleware } from '../../../shared/infrastructure/http/json-body.middleware.js';
import type { AuthController } from './auth.controller.js';

export interface AuthRouterDependencies {
  controller: AuthController;
  presessionCsrf: RequestHandler;
}

// Rutas de /auth: cada ruta encadena sus middlewares, nada con router.use (D-8 de la 001 y de la 002).
// El logout y la renovación comprueban el CSRF y resuelven la sesión en su controlador, porque pueden
// hacerlo por el refresh token
export function createAuthRouter({ controller, presessionCsrf }: AuthRouterDependencies): Router {
  const router = Router();
  router.get('/auth/csrf', controller.csrf);
  router.post('/auth/register', presessionCsrf, jsonBodyMiddleware, controller.register);
  router.post('/auth/login', presessionCsrf, jsonBodyMiddleware, controller.login);
  router.post('/auth/logout', controller.logout);
  router.post('/auth/refresh', controller.refresh);
  allowPreflight(router, '/auth/csrf', ['GET']);
  allowPreflight(router, '/auth/register', ['POST']);
  allowPreflight(router, '/auth/login', ['POST']);
  allowPreflight(router, '/auth/logout', ['POST']);
  allowPreflight(router, '/auth/refresh', ['POST']);
  return router;
}
