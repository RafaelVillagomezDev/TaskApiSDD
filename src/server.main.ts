import type { Server } from 'node:http';

import { createApp } from './app.factory.js';
import { createContainer } from './dependency.container.js';

const port = Number(process.env.PORT ?? 3000);
const container = createContainer();

const server: Server = createApp(container).listen(port, () => {
  console.log(JSON.stringify({ event: 'SERVER_STARTED', port }));
});

async function shutdown(): Promise<void> {
  server.close();
  await container.prisma.$disconnect();
}

process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

// En desarrollo (vite-node --watch) el módulo se vuelve a ejecutar en el mismo proceso al guardar:
// se cierra el servidor antes para no repetir `listen` en el mismo puerto
const hot = (import.meta as ImportMeta & { hot?: { on(event: string, callback: () => void): void } }).hot;
hot?.on('vite:beforeFullReload', () => {
  server.close();
});
