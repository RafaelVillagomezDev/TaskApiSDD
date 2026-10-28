import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Express } from 'express';

import type { AppContainer } from '../../src/app.factory.js';
import { GenerateDueAlertUseCase } from '../../src/modules/alerts/application/generate-due-alert.use-case.js';
import { ListAlertsUseCase } from '../../src/modules/alerts/application/list-alert.use-case.js';
import { RecordUserTimeZoneUseCase } from '../../src/modules/alerts/application/record-user-time-zone.use-case.js';
import { AlertController } from '../../src/modules/alerts/infrastructure/alert.controller.js';
import { createAlertRouter } from '../../src/modules/alerts/infrastructure/alert.routes.js';
import { PendingTaskAdapter } from '../../src/modules/alerts/infrastructure/pending-task.adapter.js';
import { GetStreakUseCase } from '../../src/modules/streaks/application/get-streak.use-case.js';
import { ProductiveDateAdapter } from '../../src/modules/streaks/infrastructure/productive-date.adapter.js';
import { StreakController } from '../../src/modules/streaks/infrastructure/streak.controller.js';
import { createStreakRouter } from '../../src/modules/streaks/infrastructure/streak.routes.js';
import { CreateTaskUseCase } from '../../src/modules/tasks/application/create-task.use-case.js';
import { DeleteTaskUseCase } from '../../src/modules/tasks/application/delete-task.use-case.js';
import { GetTaskUseCase } from '../../src/modules/tasks/application/get-task.use-case.js';
import { ListTasksUseCase } from '../../src/modules/tasks/application/list-task.use-case.js';
import { UpdateTaskUseCase } from '../../src/modules/tasks/application/update-task.use-case.js';
import { TaskController } from '../../src/modules/tasks/infrastructure/task.controller.js';
import { createTaskRouter } from '../../src/modules/tasks/infrastructure/task.routes.js';
import { GetPendingTaskUseCase, GetProductiveDateUseCase } from '../../src/modules/tasks/task.facade.js';
import { AuthenticateSessionUseCase } from '../../src/modules/users/application/authenticate-session.use-case.js';
import { GetProfileUseCase } from '../../src/modules/users/application/get-profile.use-case.js';
import { IssueCsrfTokenUseCase } from '../../src/modules/users/application/issue-csrf-token.use-case.js';
import { LoginUseCase } from '../../src/modules/users/application/login.use-case.js';
import { LogoutUseCase } from '../../src/modules/users/application/logout.use-case.js';
import { RegisterUserUseCase } from '../../src/modules/users/application/register-user.use-case.js';
import { VerifySessionCsrfUseCase } from '../../src/modules/users/application/verify-session-csrf.use-case.js';
import { AuthController } from '../../src/modules/users/infrastructure/auth.controller.js';
import { createAuthRouter } from '../../src/modules/users/infrastructure/auth.routes.js';
import { CryptoTokenService } from '../../src/modules/users/infrastructure/crypto-token.adapter.js';
import { MeController } from '../../src/modules/users/infrastructure/me.controller.js';
import { createMeRouter } from '../../src/modules/users/infrastructure/me.routes.js';
import { createPresessionCsrfMiddleware } from '../../src/modules/users/infrastructure/presession-csrf.middleware.js';
import { createSessionMiddleware } from '../../src/modules/users/infrastructure/session.middleware.js';
import { createRequestContextMiddleware } from '../../src/shared/infrastructure/http/request-context.middleware.js';
import { IntlTimeZoneAdapter } from '../../src/shared/infrastructure/time/intl-time-zone.adapter.js';
import { FakeClock } from './fake-clock.adapter.js';
import { FakePasswordHasher } from './fake-password-hasher.adapter.js';
import { InMemoryAlertRepository } from './in-memory-alert.repository.js';
import { InMemoryCsrfTokenRepository } from './in-memory-csrf-token.repository.js';
import { InMemoryLoginAttemptRepository } from './in-memory-login-attempt.repository.js';
import { InMemorySessionRepository } from './in-memory-session.repository.js';
import { InMemoryTaskRepository } from './in-memory-task.repository.js';
import { InMemoryUserTimeZoneRepository } from './in-memory-user-time-zone.repository.js';
import { InMemoryUserRepository } from './in-memory-user.repository.js';

// Origen del frontend permitido por CORS en los tests, el mismo que en .env.dev (RF-35 de la 002)
export const FRONTEND_ORIGIN = 'http://localhost:5173';
// Contraseña de las cuentas que crea signIn
export const TEST_PASSWORD = 'correct horse battery';

// Mismo cableado que dependency.container.ts pero con fakes en memoria (plan, D-21).
// Reloj por defecto: 2026-10-24T10:00:00Z (12:00 en Madrid)
export interface TestContainer extends AppContainer {
  clock: FakeClock;
  timeZones: IntlTimeZoneAdapter;
  tasks: InMemoryTaskRepository;
  alerts: InMemoryAlertRepository;
  userTimeZones: InMemoryUserTimeZoneRepository;
  // Una pasada del planificador, para ejecutarla a mano tras mover el reloj
  generateAlerts: GenerateDueAlertUseCase;
  users: InMemoryUserRepository;
  csrfTokens: InMemoryCsrfTokenRepository;
  sessions: InMemorySessionRepository;
  loginAttempts: InMemoryLoginAttemptRepository;
}

export function createTestContainer(): TestContainer {
  const clock = new FakeClock('2026-10-24T10:00:00Z');
  const timeZones = new IntlTimeZoneAdapter();
  const tasks = new InMemoryTaskRepository();
  const alerts = new InMemoryAlertRepository(clock);
  const userTimeZones = new InMemoryUserTimeZoneRepository();
  const recordUserTimeZone = new RecordUserTimeZoneUseCase(userTimeZones);

  const requestContext = createRequestContextMiddleware({
    clock,
    timeZones,
    onAcceptedTimeZone: (userId, timeZone) => recordUserTimeZone.execute(userId, timeZone),
  });

  const taskController = new TaskController(
    new CreateTaskUseCase(tasks),
    new ListTasksUseCase(tasks),
    new UpdateTaskUseCase(tasks),
    new GetTaskUseCase(tasks),
    new DeleteTaskUseCase(tasks),
  );
  const taskRouter = createTaskRouter({ controller: taskController, requestContext });

  const productiveDates = new ProductiveDateAdapter(new GetProductiveDateUseCase(tasks));
  const streakRouter = createStreakRouter({
    controller: new StreakController(new GetStreakUseCase(productiveDates)),
    requestContext,
  });

  const generateAlerts = new GenerateDueAlertUseCase(
    clock,
    timeZones,
    userTimeZones,
    alerts,
    new PendingTaskAdapter(new GetPendingTaskUseCase(tasks)),
  );
  const alertRouter = createAlertRouter({
    controller: new AlertController(new ListAlertsUseCase(alerts)),
    requestContext,
  });

  const tokens = new CryptoTokenService();
  const users = new InMemoryUserRepository();
  const csrfTokens = new InMemoryCsrfTokenRepository();
  const sessions = new InMemorySessionRepository();
  const loginAttempts = new InMemoryLoginAttemptRepository();
  const passwordHasher = new FakePasswordHasher();
  const verifyCsrf = new VerifySessionCsrfUseCase(tokens);
  const session = createSessionMiddleware(new AuthenticateSessionUseCase(sessions, tokens, verifyCsrf, clock));
  const authRouter = createAuthRouter({
    controller: new AuthController(
      new IssueCsrfTokenUseCase(tokens, csrfTokens, clock),
      new RegisterUserUseCase(users, passwordHasher),
      new LoginUseCase(users, sessions, loginAttempts, passwordHasher, tokens, clock),
      new LogoutUseCase(sessions, tokens, verifyCsrf),
    ),
    presessionCsrf: createPresessionCsrfMiddleware({ tokens, csrfTokens, clock }),
  });
  const meRouter = createMeRouter({ controller: new MeController(new GetProfileUseCase(users)), session });

  return {
    clock,
    timeZones,
    tasks,
    alerts,
    userTimeZones,
    generateAlerts,
    users,
    csrfTokens,
    sessions,
    loginAttempts,
    corsOrigin: FRONTEND_ORIGIN,
    routers: [authRouter, meRouter, taskRouter, streakRouter, alertRouter],
  };
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

// Cabeceras de una sesión abierta: las cookies como las reenviaría el navegador y el token CSRF de la sesión
// Alias y no interfaz: así se puede pasar donde se espera Record<string, string>
export type SessionHeaders = {
  Cookie: string;
  'X-CSRF-Token': string;
};

// Convierte los Set-Cookie de una respuesta en la cabecera Cookie que enviaría el navegador
export function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

// Pide el token previo, registra la cuenta (si ya existe, sigue) e inicia sesión con ella (RF-22, RF-01, RF-07)
export async function signIn(server: TestServer, email = 'ana@example.com'): Promise<SessionHeaders> {
  const csrf = (await (await server.request('/auth/csrf')).json()) as { data: { csrfToken: string } };
  const init = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.data.csrfToken },
    body: JSON.stringify(body),
  });
  await server.request('/auth/register', init({ email, password: TEST_PASSWORD, name: 'Ana' }));
  const response = await server.request('/auth/login', init({ email, password: TEST_PASSWORD }));
  if (response.status !== 200) {
    throw new Error(`signIn: el login de ${email} respondió ${response.status}`);
  }
  const body = (await response.json()) as { data: { csrfToken: string } };
  return { Cookie: cookiesFrom(response), 'X-CSRF-Token': body.data.csrfToken };
}
