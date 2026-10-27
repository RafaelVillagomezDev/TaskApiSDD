import type { PrismaClient } from '@prisma/client';
import type { RequestHandler } from 'express';

import type { AppContainer } from './app.factory.js';
import { GetStreakUseCase } from './modules/streaks/application/get-streak.use-case.js';
import { ProductiveDateAdapter } from './modules/streaks/infrastructure/productive-date.adapter.js';
import { StreakController } from './modules/streaks/infrastructure/streak.controller.js';
import { createStreakRouter } from './modules/streaks/infrastructure/streak.routes.js';
import { CreateTaskUseCase } from './modules/tasks/application/create-task.use-case.js';
import { GetTaskUseCase } from './modules/tasks/application/get-task.use-case.js';
import { ListTasksUseCase } from './modules/tasks/application/list-task.use-case.js';
import { UpdateTaskUseCase } from './modules/tasks/application/update-task.use-case.js';
import { PrismaTaskRepository } from './modules/tasks/infrastructure/prisma-task.repository.js';
import { TaskController } from './modules/tasks/infrastructure/task.controller.js';
import { createTaskRouter } from './modules/tasks/infrastructure/task.routes.js';
import { GetProductiveDateUseCase } from './modules/tasks/task.facade.js';
import type { Clock } from './shared/domain/clock.port.js';
import type { TimeZoneService } from './shared/domain/time-zone.port.js';
import { createRequestContextMiddleware } from './shared/infrastructure/http/request-context.middleware.js';
import { getPrismaClient } from './shared/infrastructure/prisma/prisma.client.js';
import { IntlTimeZoneAdapter } from './shared/infrastructure/time/intl-time-zone.adapter.js';
import { SystemClockAdapter } from './shared/infrastructure/time/system-clock.adapter.js';

// Composition root: el único sitio que conoce las implementaciones concretas
export interface Container extends AppContainer {
  clock: Clock;
  timeZones: TimeZoneService;
  prisma: PrismaClient;
  requestContext: RequestHandler;
}

export function createContainer(): Container {
  const clock = new SystemClockAdapter();
  const timeZones = new IntlTimeZoneAdapter();
  const prisma = getPrismaClient();

  const requestContext = createRequestContextMiddleware({
    clock,
    timeZones,
    // Se conecta con el módulo de avisos en T124 (RF-34)
    onAcceptedTimeZone: async () => undefined,
  });

  // Módulo tasks
  const taskRepository = new PrismaTaskRepository(prisma);
  const taskController = new TaskController(
    new CreateTaskUseCase(taskRepository),
    new ListTasksUseCase(taskRepository),
    new UpdateTaskUseCase(taskRepository),
    new GetTaskUseCase(taskRepository),
  );
  const taskRouter = createTaskRouter({ controller: taskController, requestContext });

  // Módulo streaks: lee los días productivos a través de la fachada de tasks
  const productiveDates = new ProductiveDateAdapter(new GetProductiveDateUseCase(taskRepository));
  const streakRouter = createStreakRouter({
    controller: new StreakController(new GetStreakUseCase(productiveDates)),
    requestContext,
  });

  return { clock, timeZones, prisma, requestContext, routers: [taskRouter, streakRouter] };
}
