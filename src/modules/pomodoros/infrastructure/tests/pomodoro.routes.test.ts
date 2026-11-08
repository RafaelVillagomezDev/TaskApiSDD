import {
  clientHeaders,
  createTestContainer,
  FRONTEND_ORIGIN,
  type SessionHeaders,
  signIn,
  startTestServer,
  type TestContainer,
  type TestServer,
  userIdOf,
} from '../../../../../tests/support/test.container.js';
import { createApp } from '../../../../app.factory.js';
import { ERROR_CODES } from '../../../../shared/domain/error-code.constant.js';

interface PomodoroTaskBody {
  id: string;
  title: string;
  description: string | null;
  date: string;
  completed: boolean;
  completedAt: string | null;
}

interface PomodoroBody {
  id: string;
  durationMinutes: number;
  status: string;
  startedAt: string;
  endsAt: string | null;
  remainingSeconds: number;
  finishedAt: string | null;
  focusedSeconds: number | null;
  endReason: string | null;
  tasks: PomodoroTaskBody[];
  completedTasks: number;
  totalTasks: number;
  createdAt: string;
}

interface Envelope<T = PomodoroBody> {
  success: boolean;
  status: number;
  message?: string;
  data?: T;
  error?: { code: string; message: string; details?: { field: string; message: string }[] };
}

const MINUTE = 60_000;
// Reloj de los tests: 2026-10-24T10:00:00Z → hoy es 2026-10-24 en Madrid (12:00 +02:00)
const NOW = '2026-10-24T10:00:00.000Z';
const TODAY = '2026-10-24';

describe('rutas del pomodoro', () => {
  let container: TestContainer;
  let server: TestServer;
  let session: SessionHeaders;

  // Cabeceras de hora y zona coherentes con el reloj del contenedor, más la sesión de Ana
  const withSession = (): Record<string, string> => {
    const now = container.clock.now();
    const madrid = new Date(now.getTime() + 2 * 60 * MINUTE).toISOString().replace(/\.\d{3}Z$/, '+02:00');
    return { ...clientHeaders({ clientTime: madrid }), ...session };
  };
  const call = async <T = PomodoroBody>(path: string, init: RequestInit = {}, headers = withSession()) => {
    const response = await server.request(path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : undefined) as Envelope<T> };
  };
  const startPomodoro = (body: unknown = {}, headers = withSession()) =>
    call('/pomodoros', { method: 'POST', body: JSON.stringify(body) }, headers);

  beforeEach(async () => {
    container = createTestContainer();
    server = await startTestServer(createApp(container));
    session = await signIn(server);
  });
  afterEach(() => server.close());

  describe('POST /pomodoros', () => {
    it('empieza una sesión de 25 minutos por defecto → 201 con el sobre completo (RF-08, RF-09, RF-49)', async () => {
      const { status, body } = await startPomodoro();
      expect(status).toBe(201);
      expect(body).toEqual({
        success: true,
        status: 201,
        message: 'Sesión pomodoro iniciada',
        data: {
          id: expect.any(String),
          durationMinutes: 25,
          status: 'running',
          startedAt: NOW,
          endsAt: new Date(new Date(NOW).getTime() + 25 * MINUTE).toISOString(),
          remainingSeconds: 1500,
          finishedAt: null,
          focusedSeconds: null,
          endReason: null,
          tasks: [],
          completedTasks: 0,
          totalTasks: 0,
          createdAt: NOW,
        },
      });
    });

    it('crea las tareas nuevas para hoy y días futuros con el recurso PomodoroTask (RF-04, RF-06, RF-53)', async () => {
      const { status, body } = await startPomodoro({
        durationMinutes: 50,
        newTasks: [
          { title: '  Repasar el tema 3 ', description: '  ', date: TODAY },
          { title: 'Preparar el examen', description: 'Capítulos 1-4', date: '2026-11-24' },
        ],
      });
      expect(status).toBe(201);
      expect(body.data?.durationMinutes).toBe(50);
      expect(body.data?.tasks).toEqual([
        { id: expect.any(String), title: 'Repasar el tema 3', description: null, date: TODAY, completed: false, completedAt: null },
        {
          id: expect.any(String),
          title: 'Preparar el examen',
          description: 'Capítulos 1-4',
          date: '2026-11-24',
          completed: false,
          completedAt: null,
        },
      ]);
      expect(body.data).toMatchObject({ completedTasks: 0, totalTasks: 2 });
    });

    it('pasa las tareas en espera después de las nuevas, en el orden del cuerpo (RF-21, RF-64)', async () => {
      const first = await startPomodoro({ durationMinutes: 1, newTasks: [{ title: 'A', date: TODAY }, { title: 'B', date: TODAY }] });
      const [a, b] = first.body.data?.tasks ?? [];
      container.clock.advance(MINUTE);
      const { status, body } = await startPomodoro({
        newTasks: [{ title: 'Nueva', date: TODAY }],
        waitingTaskIds: [b?.id, a?.id],
      });
      expect(status).toBe(201);
      expect(body.data?.tasks.map((task) => task.title)).toEqual(['Nueva', 'B', 'A']);
    });

    it('una petición sin cuerpo empieza una sesión de 25 minutos sin tareas (RF-49)', async () => {
      const { status, body } = await call('/pomodoros', { method: 'POST' });
      expect(status).toBe(201);
      expect(body.data).toMatchObject({ durationMinutes: 25, totalTasks: 0 });
    });

    it('una duración no válida → 400 VALIDATION_ERROR con details (RF-55)', async () => {
      const { status, body } = await startPomodoro({ durationMinutes: 121 });
      expect(status).toBe(400);
      expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: [{ field: 'durationMinutes' }] });
    });

    it('21 tareas → 400 VALIDATION_ERROR (RF-56)', async () => {
      const newTasks = Array.from({ length: 21 }, (_, index) => ({ title: `Tarea ${index}`, date: TODAY }));
      expect((await startPomodoro({ newTasks })).body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('una tarea para ayer → 409 DAY_CLOSED y no crea nada (RF-05)', async () => {
      const { status, body } = await startPomodoro({ newTasks: [{ title: 'Tarde', date: '2026-10-23' }] });
      expect(status).toBe(409);
      expect(body.error).toEqual({ code: 'DAY_CLOSED', message: ERROR_CODES.DAY_CLOSED.message });
      expect((await startPomodoro()).status).toBe(201);
    });

    it('con una sesión activa → 409 POMODORO_ALREADY_ACTIVE (RF-12)', async () => {
      await startPomodoro();
      const { status, body } = await startPomodoro();
      expect(status).toBe(409);
      expect(body.error).toEqual({
        code: 'POMODORO_ALREADY_ACTIVE',
        message: ERROR_CODES.POMODORO_ALREADY_ACTIVE.message,
      });
    });

    it('una tarea de la 001 no se puede incluir → 404 POMODORO_TASK_NOT_FOUND (RF-02, RF-11)', async () => {
      const task = await call<{ id: string }>('/tasks', { method: 'POST', body: JSON.stringify({ title: 'De la 001', date: TODAY }) });
      const { status, body } = await startPomodoro({ waitingTaskIds: [task.body.data?.id] });
      expect(status).toBe(404);
      expect(body.error?.code).toBe('POMODORO_TASK_NOT_FOUND');
    });

    it('las tareas del pomodoro no aparecen en GET /tasks ni cuentan para GET /streak (RF-02, CE-03)', async () => {
      await startPomodoro({ newTasks: [{ title: 'Solo del pomodoro', date: TODAY }] });
      const tasks = await call<{ totalItems: number }>('/tasks');
      expect(tasks.body.data?.totalItems).toBe(0);
      // Forma de GET /streak en la 001: { current, best }
      const streak = await call<{ current: number; best: number }>('/streak');
      expect(streak.body.data).toEqual({ current: 0, best: 0 });
    });

    it('recuerda la zona horaria de la petición (RF-03; RF-31 de la 002)', async () => {
      await startPomodoro();
      expect(container.userTimeZones.find(await userIdOf(container))).toBe('Europe/Madrid');
    });

    it('sin X-CSRF-Token → 403 INVALID_CSRF_TOKEN (RF-23 de la 002)', async () => {
      const { Cookie } = session;
      const { status, body } = await startPomodoro({}, { ...clientHeaders(), Cookie });
      expect(status).toBe(403);
      expect(body.error?.code).toBe('INVALID_CSRF_TOKEN');
    });

    it('sin X-Client-Time → 400 INVALID_CLIENT_TIME, antes que el cuerpo no válido (RF-03, RF-63)', async () => {
      const { 'X-Client-Time': _ignored, ...headers } = withSession();
      const { status, body } = await startPomodoro({ durationMinutes: 0 }, headers);
      expect(status).toBe(400);
      expect(body.error?.code).toBe('INVALID_CLIENT_TIME');
    });

    it('la petición previa de CORS desde el frontend → 200 con el sobre (RF-36 de la 002)', async () => {
      const response = await server.request('/pomodoros', {
        method: 'OPTIONS',
        headers: { Origin: FRONTEND_ORIGIN, 'Access-Control-Request-Method': 'POST' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    });
  });
  describe('PATCH /pomodoro-tasks/{id}', () => {
    const patchTask = (id: string | undefined, body: unknown, headers = withSession()) =>
      call<PomodoroTaskBody>(`/pomodoro-tasks/${id ?? ''}`, { method: 'PATCH', body: JSON.stringify(body) }, headers);
    // Sesión de `minutes` minutos con una tarea para hoy; devuelve la tarea
    const sessionTask = async (minutes = 25) => {
      const { body } = await startPomodoro({ durationMinutes: minutes, newTasks: [{ title: 'Repasar', date: TODAY }] });
      return body.data?.tasks[0];
    };

    it('completa una tarea de la sesión activa → 200 con el recurso PomodoroTask (RF-13)', async () => {
      const task = await sessionTask();
      container.clock.advance(5 * MINUTE);
      const { status, body } = await patchTask(task?.id, { completed: true });
      expect(status).toBe(200);
      expect(body).toEqual({
        success: true,
        status: 200,
        message: 'Operación realizada con éxito',
        data: {
          id: task?.id,
          title: 'Repasar',
          description: null,
          date: TODAY,
          completed: true,
          completedAt: new Date(new Date(NOW).getTime() + 5 * MINUTE).toISOString(),
        },
      });
    });

    it('desmarca y edita el título y la descripción (RF-13, RF-48)', async () => {
      const task = await sessionTask();
      await patchTask(task?.id, { completed: true });
      const { status, body } = await patchTask(task?.id, { completed: false, title: ' Repasar el tema 4 ', description: 'Notas' });
      expect(status).toBe(200);
      expect(body.data).toMatchObject({ title: 'Repasar el tema 4', description: 'Notas', completed: false, completedAt: null });
    });

    it('cambiar la fecha → 400 VALIDATION_ERROR con details (RF-54)', async () => {
      const task = await sessionTask();
      const { status, body } = await patchTask(task?.id, { date: '2026-10-25' });
      expect(status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      expect(body.error?.details?.length).toBeGreaterThan(0);
    });

    it('completar una tarea en espera → 409 POMODORO_TASK_NOT_IN_SESSION (RF-36)', async () => {
      const task = await sessionTask(1);
      container.clock.advance(MINUTE);
      const { status, body } = await patchTask(task?.id, { completed: true });
      expect(status).toBe(409);
      expect(body.error).toEqual({
        code: 'POMODORO_TASK_NOT_IN_SESSION',
        message: ERROR_CODES.POMODORO_TASK_NOT_IN_SESSION.message,
      });
    });

    it('editar el título de una tarea en espera → 200 (RF-48)', async () => {
      const task = await sessionTask(1);
      container.clock.advance(MINUTE);
      expect((await patchTask(task?.id, { title: 'Corregido' })).body.data?.title).toBe('Corregido');
    });

    it('desmarcar una tarea de una sesión terminada → 409 INVALID_POMODORO_STATE (RF-34)', async () => {
      const task = await sessionTask(1);
      await patchTask(task?.id, { completed: true });
      container.clock.advance(MINUTE);
      const { status, body } = await patchTask(task?.id, { completed: false });
      expect(status).toBe(409);
      expect(body.error?.code).toBe('INVALID_POMODORO_STATE');
    });

    it('un id no UUID o una tarea de otra cuenta → 404 POMODORO_TASK_NOT_FOUND (RF-01, RF-07)', async () => {
      expect((await patchTask('tarea-1', { completed: true })).body.error?.code).toBe('POMODORO_TASK_NOT_FOUND');
      const task = await sessionTask();
      const bea = await signIn(server, 'bea@example.com');
      const { status, body } = await patchTask(task?.id, { completed: true }, { ...withSession(), ...bea });
      expect(status).toBe(404);
      expect(body.error?.code).toBe('POMODORO_TASK_NOT_FOUND');
    });

    it('un cuerpo vacío → 400 VALIDATION_ERROR antes que la tarea inexistente (RF-63)', async () => {
      expect((await patchTask('8f1c2e4a-0000-4000-8000-0000000000ff', {})).body.error?.code).toBe('VALIDATION_ERROR');
    });
  });
});
