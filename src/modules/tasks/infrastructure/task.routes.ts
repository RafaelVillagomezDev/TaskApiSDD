import { type RequestHandler, Router } from 'express';

import { jsonBodyMiddleware } from '../../../shared/infrastructure/http/json-body.middleware.js';
import type { TaskController } from './task.controller.js';

export interface TaskRouterDependencies {
  controller: TaskController;
  requestContext: RequestHandler;
}

// Rutas de /tasks: cada ruta encadena contexto → JSON → controlador; nada con router.use (D-8)
export function createTaskRouter({ controller, requestContext }: TaskRouterDependencies): Router {
  const router = Router();
  router.post('/tasks', requestContext, jsonBodyMiddleware, controller.create);
  router.get('/tasks', requestContext, controller.list);
  router.get('/tasks/:id', requestContext, controller.get);
  router.patch('/tasks/:id', requestContext, jsonBodyMiddleware, controller.update);
  return router;
}
