import type { PrismaClient } from '@prisma/client';
import type { RequestHandler } from 'express';

import type { AppContainer } from './app.factory.js';
import { GenerateDueAlertUseCase } from './modules/alerts/application/generate-due-alert.use-case.js';
import { ListAlertsUseCase } from './modules/alerts/application/list-alert.use-case.js';
import { RecordUserTimeZoneUseCase } from './modules/alerts/application/record-user-time-zone.use-case.js';
import { AlertController } from './modules/alerts/infrastructure/alert.controller.js';
import { createAlertRouter } from './modules/alerts/infrastructure/alert.routes.js';
import { AlertScheduler } from './modules/alerts/infrastructure/alert.scheduler.js';
import { PendingTaskAdapter } from './modules/alerts/infrastructure/pending-task.adapter.js';
import { PrismaAlertRepository } from './modules/alerts/infrastructure/prisma-alert.repository.js';
import { PrismaUserTimeZoneRepository } from './modules/alerts/infrastructure/prisma-user-time-zone.repository.js';
import { GetStreakUseCase } from './modules/streaks/application/get-streak.use-case.js';
import { ProductiveDateAdapter } from './modules/streaks/infrastructure/productive-date.adapter.js';
import { StreakController } from './modules/streaks/infrastructure/streak.controller.js';
import { createStreakRouter } from './modules/streaks/infrastructure/streak.routes.js';
import { CreateTaskUseCase } from './modules/tasks/application/create-task.use-case.js';
import { DeleteTaskUseCase } from './modules/tasks/application/delete-task.use-case.js';
import { GetTaskUseCase } from './modules/tasks/application/get-task.use-case.js';
import { ListTasksUseCase } from './modules/tasks/application/list-task.use-case.js';
import { UpdateTaskUseCase } from './modules/tasks/application/update-task.use-case.js';
import { PrismaTaskRepository } from './modules/tasks/infrastructure/prisma-task.repository.js';
import { TaskController } from './modules/tasks/infrastructure/task.controller.js';
import { createTaskRouter } from './modules/tasks/infrastructure/task.routes.js';
import { GetPendingTaskUseCase, GetProductiveDateUseCase } from './modules/tasks/task.facade.js';
import { IssueCsrfTokenUseCase } from './modules/users/application/issue-csrf-token.use-case.js';
import { RegisterUserUseCase } from './modules/users/application/register-user.use-case.js';
import { Argon2PasswordHasher } from './modules/users/infrastructure/argon2-password-hasher.adapter.js';
import { AuthController } from './modules/users/infrastructure/auth.controller.js';
import { createAuthRouter } from './modules/users/infrastructure/auth.routes.js';
import { CryptoTokenService } from './modules/users/infrastructure/crypto-token.adapter.js';
import { createPresessionCsrfMiddleware } from './modules/users/infrastructure/presession-csrf.middleware.js';
import { PrismaCsrfTokenRepository } from './modules/users/infrastructure/prisma-csrf-token.repository.js';
import { PrismaUserRepository } from './modules/users/infrastructure/prisma-user.repository.js';
import type { Clock } from './shared/domain/clock.port.js';
import type { TimeZoneService } from './shared/domain/time-zone.port.js';
import { createRequestContextMiddleware } from './shared/infrastructure/http/request-context.middleware.js';
import { loadAppConfig } from './shared/infrastructure/config/app.config.js';
import { getPrismaClient } from './shared/infrastructure/prisma/prisma.client.js';
import { IntlTimeZoneAdapter } from './shared/infrastructure/time/intl-time-zone.adapter.js';
import { SystemClockAdapter } from './shared/infrastructure/time/system-clock.adapter.js';

// Composition root: el único sitio que conoce las implementaciones concretas
export interface Container extends AppContainer {
  clock: Clock;
  timeZones: TimeZoneService;
  prisma: PrismaClient;
  requestContext: RequestHandler;
  alertScheduler: AlertScheduler;
}

export function createContainer(): Container {
  // Falla al arrancar si falta o es inválida alguna variable de .env (D-11 de la 002)
  const config = loadAppConfig();
  const clock = new SystemClockAdapter();
  const timeZones = new IntlTimeZoneAdapter();
  const prisma = getPrismaClient();

  // Módulo alerts: la zona se recuerda en cuanto las cabeceras son válidas (RF-34, D-1)
  const userTimeZones = new PrismaUserTimeZoneRepository(prisma);
  const recordUserTimeZone = new RecordUserTimeZoneUseCase(userTimeZones);

  const requestContext = createRequestContextMiddleware({
    clock,
    timeZones,
    onAcceptedTimeZone: (userId, timeZone) => recordUserTimeZone.execute(userId, timeZone),
  });

  // Módulo tasks
  const taskRepository = new PrismaTaskRepository(prisma);
  const taskController = new TaskController(
    new CreateTaskUseCase(taskRepository),
    new ListTasksUseCase(taskRepository),
    new UpdateTaskUseCase(taskRepository),
    new GetTaskUseCase(taskRepository),
    new DeleteTaskUseCase(taskRepository),
  );
  const taskRouter = createTaskRouter({ controller: taskController, requestContext });

  // Módulo streaks: lee los días productivos a través de la fachada de tasks
  const productiveDates = new ProductiveDateAdapter(new GetProductiveDateUseCase(taskRepository));
  const streakRouter = createStreakRouter({
    controller: new StreakController(new GetStreakUseCase(productiveDates)),
    requestContext,
  });

  // Módulo alerts: lee las tareas pendientes a través de la fachada de tasks
  const alertRepository = new PrismaAlertRepository(prisma);
  const pendingTasks = new PendingTaskAdapter(new GetPendingTaskUseCase(taskRepository));
  const alertScheduler = new AlertScheduler(
    new GenerateDueAlertUseCase(clock, timeZones, userTimeZones, alertRepository, pendingTasks),
  );
  const alertRouter = createAlertRouter({
    controller: new AlertController(new ListAlertsUseCase(alertRepository)),
    requestContext,
  });

  // Módulo users (spec 002): registro con token CSRF previo a la sesión
  const tokens = new CryptoTokenService();
  const csrfTokens = new PrismaCsrfTokenRepository(prisma);
  const users = new PrismaUserRepository(prisma);
  const authRouter = createAuthRouter({
    controller: new AuthController(
      new IssueCsrfTokenUseCase(tokens, csrfTokens, clock),
      new RegisterUserUseCase(users, new Argon2PasswordHasher()),
    ),
    presessionCsrf: createPresessionCsrfMiddleware({ tokens, csrfTokens, clock }),
  });

  return {
    clock,
    timeZones,
    prisma,
    requestContext,
    alertScheduler,
    corsOrigin: config.corsOrigin,
    routers: [authRouter, taskRouter, streakRouter, alertRouter],
  };
}
