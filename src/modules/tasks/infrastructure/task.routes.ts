import { type RequestHandler, Router } from 'express';

import { allowPreflight } from '../../../shared/infrastructure/http/cors.middleware.js';
import { jsonBodyMiddleware } from '../../../shared/infrastructure/http/json-body.middleware.js';
import type { TaskController } from './task.controller.js';

export interface TaskRouterDependencies {
  controller: TaskController;
  // Middleware de sesión del módulo users, inyectado por el contenedor (principio V): exige X-CSRF-Token
  // en POST, PATCH y DELETE
  session: RequestHandler;
  requestContext: RequestHandler;
}

// Rutas de /tasks: cada ruta encadena sesión → contexto → JSON → controlador; nada con router.use
// (D-8 de la 001 y de la 002, precedencia de RF-34 de la 002)
export function createTaskRouter({ controller, session, requestContext }: TaskRouterDependencies): Router {
  const router = Router();
  router.post('/tasks', session, requestContext, jsonBodyMiddleware, controller.create);
  router.get('/tasks', session, requestContext, controller.list);
  router.get('/tasks/:id', session, requestContext, controller.get);
  router.patch('/tasks/:id', session, requestContext, jsonBodyMiddleware, controller.update);
  router.delete('/tasks/:id', session, requestContext, controller.remove);
  allowPreflight(router, '/tasks', ['GET', 'POST']);
  allowPreflight(router, '/tasks/:id', ['GET', 'PATCH', 'DELETE']);
  return router;
}
