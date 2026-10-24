import { type RequestHandler, Router } from 'express';

import type { StreakController } from './streak.controller.js';

export interface StreakRouterDependencies {
  controller: StreakController;
  requestContext: RequestHandler;
}

// GET /streak con el contexto encadenado en la propia ruta (D-8)
export function createStreakRouter({ controller, requestContext }: StreakRouterDependencies): Router {
  const router = Router();
  router.get('/streak', requestContext, controller.get);
  return router;
}
