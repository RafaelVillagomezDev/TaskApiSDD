import { type RequestHandler, Router } from 'express';

import { allowPreflight } from '../../../shared/infrastructure/http/cors.middleware.js';
import { jsonBodyMiddleware } from '../../../shared/infrastructure/http/json-body.middleware.js';
import type { MeController } from './me.controller.js';

export interface MeRouterDependencies {
  controller: MeController;
  session: RequestHandler;
}

// Rutas de /me: sesión → JSON → controlador, sin cabeceras de hora ni zona (RF-30, D-8). La sesión exige
// X-CSRF-Token en PATCH y DELETE, y va antes que el JSON para que sus errores ganen a VALIDATION_ERROR (RF-34).
// El controlador valida el cuerpo antes de comprobar el bloqueo: VALIDATION_ERROR gana a TOO_MANY_ATTEMPTS
export function createMeRouter({ controller, session }: MeRouterDependencies): Router {
  const router = Router();
  router.get('/me', session, controller.show);
  router.patch('/me', session, jsonBodyMiddleware, controller.update);
  router.patch('/me/password', session, jsonBodyMiddleware, controller.changePassword);
  router.delete('/me', session, jsonBodyMiddleware, controller.remove);
  allowPreflight(router, '/me', ['GET', 'PATCH', 'DELETE']);
  allowPreflight(router, '/me/password', ['PATCH']);
  return router;
}
