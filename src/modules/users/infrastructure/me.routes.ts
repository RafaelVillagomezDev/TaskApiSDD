import { type RequestHandler, Router } from 'express';

import { allowPreflight } from '../../../shared/infrastructure/http/cors.middleware.js';
import type { MeController } from './me.controller.js';

export interface MeRouterDependencies {
  controller: MeController;
  session: RequestHandler;
}

// Rutas de /me: sesión → controlador, sin cabeceras de hora ni zona (RF-30, D-8)
export function createMeRouter({ controller, session }: MeRouterDependencies): Router {
  const router = Router();
  router.get('/me', session, controller.show);
  allowPreflight(router, '/me', ['GET']);
  return router;
}
