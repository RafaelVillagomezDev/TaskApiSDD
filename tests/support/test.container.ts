import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Express } from 'express';

import type { AppContainer } from '../../src/app.factory.js';
import { GetStreakUseCase } from '../../src/modules/streaks/application/get-streak.use-case.js';
import { ProductiveDateAdapter } from '../../src/modules/streaks/infrastructure/productive-date.adapter.js';
import { StreakController } from '../../src/modules/streaks/infrastructure/streak.controller.js';
import { createStreakRouter } from '../../src/modules/streaks/infrastructure/streak.routes.js';
import { CreateTaskUseCase } from '../../src/modules/tasks/application/create-task.use-case.js';
import { ListTasksUseCase } from '../../src/modules/tasks/application/list-task.use-case.js';
import { UpdateTaskUseCase } from '../../src/modules/tasks/application/update-task.use-case.js';
import { TaskController } from '../../src/modules/tasks/infrastructure/task.controller.js';
import { createTaskRouter } from '../../src/modules/tasks/infrastructure/task.routes.js';
import { GetProductiveDateUseCase } from '../../src/modules/tasks/task.facade.js';
import { createRequestContextMiddleware } from '../../src/shared/infrastructure/http/request-context.middleware.js';
import { IntlTimeZoneAdapter } from '../../src/shared/infrastructure/time/intl-time-zone.adapter.js';
import { FakeClock } from './fake-clock.adapter.js';
import { InMemoryTaskRepository } from './in-memory-task.repository.js';

// Mismo cableado que dependency.container.ts pero con fakes en memoria (plan, D-21).
// Reloj por defecto: 2026-10-24T10:00:00Z (12:00 en Madrid)
export interface TestContainer extends AppContainer {
  clock: FakeClock;
  timeZones: IntlTimeZoneAdapter;
  tasks: InMemoryTaskRepository;
}

export function createTestContainer(): TestContainer {
  const clock = new FakeClock('2026-10-24T10:00:00Z');
  const timeZones = new IntlTimeZoneAdapter();
  const tasks = new InMemoryTaskRepository();

  const requestContext = createRequestContextMiddleware({
    clock,
    timeZones,
    onAcceptedTimeZone: async () => undefined,
  });

  const taskController = new TaskController(
    new CreateTaskUseCase(tasks),
    new ListTasksUseCase(tasks),
    new UpdateTaskUseCase(tasks),
  );
  const taskRouter = createTaskRouter({ controller: taskController, requestContext });

  const productiveDates = new ProductiveDateAdapter(new GetProductiveDateUseCase(tasks));
  const streakRouter = createStreakRouter({
    controller: new StreakController(new GetStreakUseCase(productiveDates)),
    requestContext,
  });

  return { clock, timeZones, tasks, routers: [taskRouter, streakRouter] };
}

export interface ClientHeaderOptions {
  userId?: string;
  clientTime?: string;
  timeZone?: string;
}

// Cabeceras obligatorias coherentes con el reloj por defecto del contenedor de test
export function clientHeaders(options: ClientHeaderOptions = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': options.userId ?? 'user-1',
    'X-Client-Time': options.clientTime ?? '2026-10-24T12:00:00+02:00',
    'X-Timezone': options.timeZone ?? 'Europe/Madrid',
  };
}

export interface TestServer {
  request(path: string, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

// Arranca la app en un puerto libre para los tests HTTP con fetch nativo (plan, D-12)
export async function startTestServer(app: Express): Promise<TestServer> {
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;

  return {
    request: (path, init) => fetch(`http://127.0.0.1:${port}${path}`, init),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
