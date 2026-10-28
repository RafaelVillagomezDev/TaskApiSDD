import { type RequestHandler, Router } from 'express';

import { allowPreflight } from '../../../shared/infrastructure/http/cors.middleware.js';
import type { AlertController } from './alert.controller.js';

export interface AlertRouterDependencies {
  controller: AlertController;
  // Middleware de sesión del módulo users, inyectado por el contenedor (principio V)
  session: RequestHandler;
  requestContext: RequestHandler;
}

// GET /alerts con la sesión y el contexto encadenados en la propia ruta (D-8 de la 001 y de la 002)
export function createAlertRouter({ controller, session, requestContext }: AlertRouterDependencies): Router {
  const router = Router();
  router.get('/alerts', session, requestContext, controller.list);
  allowPreflight(router, '/alerts', ['GET']);
  return router;
}
