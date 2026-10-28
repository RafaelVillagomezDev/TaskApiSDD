import express, { type Express, type Router } from 'express';

import { createAllowedMethodMiddleware } from './shared/infrastructure/http/allowed-method.middleware.js';
import { createCorsMiddleware } from './shared/infrastructure/http/cors.middleware.js';
import { errorHandlerMiddleware } from './shared/infrastructure/http/error-handler.middleware.js';
import { routeNotFoundMiddleware } from './shared/infrastructure/http/route-not-found.middleware.js';

// Lo que la app necesita del contenedor de dependencias (real o de test)
export interface AppContainer {
  routers: Router[];
  // Origen del frontend permitido por CORS (RF-35 de la 002); sin él no se añaden cabeceras CORS
  corsOrigin?: string;
}

// Monta la app sin parsers ni contexto globales: cada ruta encadena los suyos (D-8), para que
// ROUTE_NOT_FOUND gane al resto de errores (RF-46)
export function createApp(container: AppContainer): Express {
  const app = express();
  app.disable('x-powered-by');

  if (container.corsOrigin) {
    app.use(createCorsMiddleware(container.corsOrigin));
  }
  app.use(createAllowedMethodMiddleware(container.corsOrigin));
  for (const router of container.routers) {
    app.use(router);
  }
  app.use(routeNotFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}
