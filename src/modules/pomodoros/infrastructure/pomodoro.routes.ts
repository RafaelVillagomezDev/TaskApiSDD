import { type RequestHandler, Router } from 'express';

import { allowPreflight } from '../../../shared/infrastructure/http/cors.middleware.js';
import { jsonBodyMiddleware } from '../../../shared/infrastructure/http/json-body.middleware.js';
import type { PomodoroTaskController } from './pomodoro-task.controller.js';
import type { PomodoroController } from './pomodoro.controller.js';

export interface PomodoroRouterDependencies {
  pomodoros: PomodoroController;
  pomodoroTasks: PomodoroTaskController;
  // Middleware de sesión del módulo users, inyectado por el contenedor (principio V): exige X-CSRF-Token
  // en POST, PATCH y DELETE
  session: RequestHandler;
  // Exige X-Client-Time y X-Timezone y recuerda la zona (RF-03)
  requestContext: RequestHandler;
}

// Rutas del pomodoro: cada ruta encadena sesión → contexto → JSON → controlador; nada con router.use
// (D-8 de la 001 y de la 002, precedencia de RF-63)
export function createPomodoroRouter({
  pomodoros,
  pomodoroTasks,
  session,
  requestContext,
}: PomodoroRouterDependencies): Router {
  const router = Router();
  router.post('/pomodoros', session, requestContext, jsonBodyMiddleware, pomodoros.start);
  router.get('/pomodoros', session, requestContext, pomodoros.list);
  router.get('/pomodoros/:id', session, requestContext, pomodoros.get);
  router.patch('/pomodoros/:id', session, requestContext, jsonBodyMiddleware, pomodoros.changeStatus);
  router.post('/pomodoros/:id/tasks', session, requestContext, jsonBodyMiddleware, pomodoros.addTasks);
  router.delete('/pomodoros/:id/tasks/:taskId', session, requestContext, pomodoros.removeTask);
  router.get('/pomodoro-tasks', session, requestContext, pomodoroTasks.listWaiting);
  router.patch('/pomodoro-tasks/:id', session, requestContext, jsonBodyMiddleware, pomodoroTasks.update);
  router.delete('/pomodoro-tasks/:id', session, requestContext, pomodoroTasks.remove);
  allowPreflight(router, '/pomodoros', ['GET', 'POST']);
  allowPreflight(router, '/pomodoros/:id', ['GET', 'PATCH']);
  allowPreflight(router, '/pomodoros/:id/tasks', ['POST']);
  allowPreflight(router, '/pomodoros/:id/tasks/:taskId', ['DELETE']);
  allowPreflight(router, '/pomodoro-tasks', ['GET']);
  allowPreflight(router, '/pomodoro-tasks/:id', ['PATCH', 'DELETE']);
  return router;
}
