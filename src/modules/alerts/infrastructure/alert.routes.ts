import { type RequestHandler, Router } from 'express';

import type { AlertController } from './alert.controller.js';

export interface AlertRouterDependencies {
  controller: AlertController;
  requestContext: RequestHandler;
}

// GET /alerts con el contexto encadenado en la propia ruta (D-8)
export function createAlertRouter({ controller, requestContext }: AlertRouterDependencies): Router {
  const router = Router();
  router.get('/alerts', requestContext, controller.list);
  return router;
}
