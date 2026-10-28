import { createApp } from '../../src/app.factory.js';
import { type Container, createContainer } from '../../src/dependency.container.js';
import { GenerateDueAlertUseCase } from '../../src/modules/alerts/application/generate-due-alert.use-case.js';
import { PendingTaskAdapter } from '../../src/modules/alerts/infrastructure/pending-task.adapter.js';
import { PrismaAlertRepository } from '../../src/modules/alerts/infrastructure/prisma-alert.repository.js';
import { PrismaUserTimeZoneRepository } from '../../src/modules/alerts/infrastructure/prisma-user-time-zone.repository.js';
import { PrismaTaskRepository } from '../../src/modules/tasks/infrastructure/prisma-task.repository.js';
import { GetPendingTaskUseCase } from '../../src/modules/tasks/task.facade.js';
import { LocalDate } from '../../src/shared/domain/local-date.value-object.js';
import { IntlTimeZoneAdapter } from '../../src/shared/infrastructure/time/intl-time-zone.adapter.js';
import { truncateTables } from '../integration/test-database.helper.js';
import { FakeClock } from '../support/fake-clock.adapter.js';
import { startTestServer, type TestServer } from '../support/test.container.js';

// Rendimiento (RNF-01, CE-05, R-1) con el cableado real y PostgreSQL (esquema `test`).
// Se ejecuta con `pnpm test:perf`, fuera de `pnpm test`

// RNF-01: el 95 % de las peticiones en menos de 300 ms
const P95_LIMIT_MS = 300;
// CE-05: un usuario con 10 000 tareas repartidas en 3 años
const TASK_COUNT = 10_000;
const HISTORY_DAYS = 3 * 365;
// Peticiones medidas por endpoint, tras unas de calentamiento que no cuentan
const SAMPLES = 100;
const WARM_UP = 10;
// R-1: una pasada del planificador con 10 000 usuarios debe caber en los 5 minutos de RNF-02
// junto con el intervalo de 60 s del planificador
const ALERT_USERS = 10_000;
const ALERT_PASS_LIMIT_MS = 5 * 60_000 - 60_000;
const INSERT_CHUNK = 1_000;

const ZONE = 'Etc/UTC';

// Hora actual con desfase ±HH:MM, como la envía un dispositivo en UTC (RF-31)
const clientTime = () => `${new Date().toISOString().slice(0, 19)}+00:00`;
// Cuenta y sesión del usuario de las pruebas HTTP: se registra e inicia sesión en beforeAll, y cada petición
// lleva su cookie y su token CSRF (RF-17 y RF-23 de la 002). La sesión dura más que las pruebas (15 min)
let userId = '';
let sessionCookie = '';
let csrfToken = '';
const PASSWORD = 'correct horse battery';

const headers = () => ({
  'Content-Type': 'application/json',
  Cookie: sessionCookie,
  'X-CSRF-Token': csrfToken,
  'X-Client-Time': clientTime(),
  'X-Timezone': ZONE,
});

// GET /auth/csrf, registro y login con la API real (Argon2id incluido)
const signIn = async (server: TestServer) => {
  const presession = (await (await server.request('/auth/csrf')).json()) as { data: { csrfToken: string } };
  const init = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': presession.data.csrfToken },
    body: JSON.stringify(body),
  });
  const email = `perf-${Date.now()}@test.local`;
  await server.request('/auth/register', init({ email, password: PASSWORD }));
  const login = await server.request('/auth/login', init({ email, password: PASSWORD }));
  if (login.status !== 200) throw new Error(`login de rendimiento: respuesta ${login.status}`);
  const { data } = (await login.json()) as { data: { user: { id: string }; csrfToken: string } };
  userId = data.user.id;
  csrfToken = data.csrfToken;
  sessionCookie = login.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
};

const p95 = (durations: number[]) => {
  const sorted = [...durations].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
};

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

describe('rendimiento (RNF-01, CE-05, R-1)', () => {
  let container: Container;
  let server: TestServer;
  let today: LocalDate;
  const results: Record<string, number> = {};

  // Mide `SAMPLES` peticiones secuenciales; `next` devuelve la ruta y las opciones de cada una
  const measure = async (name: string, next: (index: number) => Promise<[string, RequestInit]>) => {
    const durations: number[] = [];
    for (let index = 0; index < WARM_UP + SAMPLES; index++) {
      const [path, init] = await next(index);
      const started = performance.now();
      const response = await server.request(path, { ...init, headers: headers() });
      await response.arrayBuffer();
      const elapsed = performance.now() - started;
      if (response.status >= 400) throw new Error(`${name}: respuesta ${response.status}`);
      if (index >= WARM_UP) durations.push(elapsed);
    }
    results[name] = p95(durations);
    return results[name];
  };

  const createTask = async (date: LocalDate) => {
    const task = await container.prisma.task.create({ data: { userId, title: 'Tarea', date: date.toUtcDate() } });
    return task.id;
  };

  beforeAll(async () => {
    container = createContainer();
    await truncateTables(container.prisma);
    server = await startTestServer(createApp(container));
    await signIn(server);
    today = LocalDate.fromUtcDate(new Date());

    // 10 000 tareas en los últimos 3 años, unas 9 por día, la mitad completadas
    const rows = Array.from({ length: TASK_COUNT }, (_, index) => ({
      userId,
      title: `Tarea ${index}`,
      date: today.addDays(-(index % HISTORY_DAYS)).toUtcDate(),
      completed: index % 2 === 0,
    }));
    for (const chunk of chunks(rows, INSERT_CHUNK)) {
      await container.prisma.task.createMany({ data: chunk });
    }
    // 200 avisos diarios de días anteriores, para que GET /alerts pagine
    await container.prisma.alert.createMany({
      data: Array.from({ length: 200 }, (_, index) => ({
        userId,
        type: 'daily' as const,
        periodStart: today.addDays(-index - 1).toUtcDate(),
        periodEnd: today.addDays(-index - 1).toUtcDate(),
        tasks: [{ id: '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b', title: 'Tarea', date: today.addDays(-index - 1).toString() }],
      })),
    });
  }, 120_000);

  afterAll(async () => {
    // Informe de QS-R.4
    console.log(
      `p95 por endpoint con ${TASK_COUNT} tareas (límite ${P95_LIMIT_MS} ms):\n` +
        Object.entries(results)
          .map(([name, value]) => `  ${name.padEnd(28)} ${value.toFixed(1)} ms`)
          .join('\n'),
    );
    await truncateTables(container.prisma);
    await server.close();
    await container.prisma.$disconnect();
  });

  it('GET /tasks (primera página de todas)', async () => {
    expect(await measure('GET /tasks', async () => ['/tasks', {}])).toBeLessThan(P95_LIMIT_MS);
  });

  it('GET /tasks?page= (páginas profundas)', async () => {
    expect(await measure('GET /tasks?page=180', async () => ['/tasks?page=180&pageSize=50', {}])).toBeLessThan(
      P95_LIMIT_MS,
    );
  });

  it('GET /tasks?date= y filtros de estado y rango', async () => {
    expect(await measure('GET /tasks?date=', async () => [`/tasks?date=${today}`, {}])).toBeLessThan(P95_LIMIT_MS);
    expect(
      await measure('GET /tasks?from&to&status', async () => [
        `/tasks?from=${today.addDays(-365)}&to=${today}&status=pending`,
        {},
      ]),
    ).toBeLessThan(P95_LIMIT_MS);
  });

  it('GET /tasks/{id}', async () => {
    const id = await createTask(today);
    expect(await measure('GET /tasks/{id}', async () => [`/tasks/${id}`, {}])).toBeLessThan(P95_LIMIT_MS);
  });

  it('POST /tasks', async () => {
    const body = JSON.stringify({ title: 'Nueva', date: today.toString() });
    expect(await measure('POST /tasks', async () => ['/tasks', { method: 'POST', body }])).toBeLessThan(P95_LIMIT_MS);
  });

  it('PATCH /tasks/{id}', async () => {
    const id = await createTask(today);
    expect(
      await measure('PATCH /tasks/{id}', async (index) => [
        `/tasks/${id}`,
        { method: 'PATCH', body: JSON.stringify({ completed: index % 2 === 0, title: `Título ${index}` }) },
      ]),
    ).toBeLessThan(P95_LIMIT_MS);
  });

  it('DELETE /tasks/{id}', async () => {
    expect(
      await measure('DELETE /tasks/{id}', async () => [`/tasks/${await createTask(today)}`, { method: 'DELETE' }]),
    ).toBeLessThan(P95_LIMIT_MS);
  });

  it('GET /streak con ~1 100 días productivos (R-6)', async () => {
    expect(await measure('GET /streak', async () => ['/streak', {}])).toBeLessThan(P95_LIMIT_MS);
  });

  it('GET /alerts', async () => {
    expect(await measure('GET /alerts', async () => ['/alerts', {}])).toBeLessThan(P95_LIMIT_MS);
  });

  it(
    'una pasada del planificador con 10 000 usuarios a los que les vence el aviso a la vez (R-1, RNF-02)',
    async () => {
      // Peor caso: todos en la misma zona, a las 22:00 y con una tarea pendiente → 10 000 avisos
      const day = LocalDate.parse('2030-01-02');
      const emails = Array.from({ length: ALERT_USERS }, (_, index) => `perf-alert-${index}-${Date.now()}@test.local`);
      const userIds: string[] = [];
      for (const chunk of chunks(emails, INSERT_CHUNK)) {
        const users = await container.prisma.user.createManyAndReturn({
          data: chunk.map((email) => ({ email, passwordHash: 'sin-uso-en-tests' })),
          select: { id: true },
        });
        userIds.push(...users.map((user) => user.id));
      }
      for (const chunk of chunks(userIds, INSERT_CHUNK)) {
        await container.prisma.userTimeZone.createMany({
          data: chunk.map((userId) => ({ userId, timeZone: ZONE })),
        });
        await container.prisma.task.createMany({
          data: chunk.map((userId) => ({ userId, title: 'Pendiente', date: day.toUtcDate() })),
        });
      }
      const tasks = new PrismaTaskRepository(container.prisma);
      const generate = new GenerateDueAlertUseCase(
        new FakeClock('2030-01-02T22:00:00Z'),
        new IntlTimeZoneAdapter(),
        new PrismaUserTimeZoneRepository(container.prisma),
        new PrismaAlertRepository(container.prisma),
        new PendingTaskAdapter(new GetPendingTaskUseCase(tasks)),
      );

      const started = performance.now();
      const result = await generate.execute();
      results['pasada del planificador'] = performance.now() - started;

      // El usuario de las pruebas HTTP también tiene zona recordada: 10 001 usuarios
      expect(result.users).toBe(ALERT_USERS + 1);
      expect(result.created).toBeGreaterThanOrEqual(ALERT_USERS);
      expect(results['pasada del planificador']).toBeLessThan(ALERT_PASS_LIMIT_MS);
    },
    ALERT_PASS_LIMIT_MS + 60_000,
  );
});
