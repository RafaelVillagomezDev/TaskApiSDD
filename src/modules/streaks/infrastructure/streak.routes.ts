import { type RequestHandler, Router } from 'express';

import { allowPreflight } from '../../../shared/infrastructure/http/cors.middleware.js';
import type { StreakController } from './streak.controller.js';

export interface StreakRouterDependencies {
  controller: StreakController;
  // Middleware de sesión del módulo users, inyectado por el contenedor (principio V)
  session: RequestHandler;
  requestContext: RequestHandler;
}

// GET /streak con la sesión y el contexto encadenados en la propia ruta (D-8 de la 001 y de la 002)
export function createStreakRouter({ controller, session, requestContext }: StreakRouterDependencies): Router {
  const router = Router();
  router.get('/streak', session, requestContext, controller.get);
  allowPreflight(router, '/streak', ['GET']);
  return router;
}
