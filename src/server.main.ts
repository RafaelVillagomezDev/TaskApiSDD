import type { Server } from 'node:http';

import { createApp } from './app.factory.js';
import { createContainer } from './dependency.container.js';

const port = Number(process.env.PORT ?? 3000);
const container = createContainer();

const server: Server = createApp(container).listen(port, () => {
  console.log(JSON.stringify({ event: 'SERVER_STARTED', port }));
  // Pasada inicial al arrancar: recupera los avisos perdidos durante una parada (RF-47)
  container.alertScheduler.start();
  // Y la limpieza de los datos de sesión caducados mientras la API estaba parada (D-12)
  container.authCleanupScheduler.start();
});

function stopSchedulers(): void {
  container.alertScheduler.stop();
  container.authCleanupScheduler.stop();
}

async function shutdown(): Promise<void> {
  stopSchedulers();
  server.close();
  await container.prisma.$disconnect();
}

process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

// En desarrollo (vite-node --watch) el módulo se vuelve a ejecutar en el mismo proceso al guardar:
// se cierra el servidor antes para no repetir `listen` en el mismo puerto
const hot = (import.meta as ImportMeta & { hot?: { on(event: string, callback: () => void): void } }).hot;
hot?.on('vite:beforeFullReload', () => {
  stopSchedulers();
  server.close();
  // Sin esto, cada recarga deja abierto el pool del PrismaClient anterior y PostgreSQL se queda sin conexiones
  void container.prisma.$disconnect();
});
