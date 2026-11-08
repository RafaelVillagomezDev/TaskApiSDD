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
  describe('GET /pomodoros y GET /pomodoros/{id}', () => {
    interface PomodoroPage {
      items: PomodoroBody[];
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    }

    it('GET /pomodoros/{id} devuelve la sesión con el sobre (RF-17)', async () => {
      const started = await startPomodoro({ newTasks: [{ title: 'Repasar', date: TODAY }] });
      container.clock.advance(5 * MINUTE);
      const { status, body } = await call(`/pomodoros/${started.body.data?.id ?? ''}`);
      expect(status).toBe(200);
      expect(body).toMatchObject({ success: true, status: 200, message: 'Operación realizada con éxito' });
      expect(body.data).toMatchObject({ id: started.body.data?.id, status: 'running', remainingSeconds: 1200, totalTasks: 1 });
    });

    it('una sesión vencida se ve terminada por tiempo, con su foto (RF-15, RF-16)', async () => {
      const started = await startPomodoro({ durationMinutes: 1, newTasks: [{ title: 'Repasar', date: TODAY }] });
      container.clock.advance(3 * MINUTE);
      const { body } = await call(`/pomodoros/${started.body.data?.id ?? ''}`);
      expect(body.data).toMatchObject({
        status: 'finished',
        endReason: 'time',
        finishedAt: new Date(new Date(NOW).getTime() + MINUTE).toISOString(),
        focusedSeconds: 60,
        endsAt: null,
        remainingSeconds: 0,
        completedTasks: 0,
        totalTasks: 1,
      });
      expect(body.data?.tasks.map((task) => task.title)).toEqual(['Repasar']);
    });

    it('un id no UUID, inexistente o de otra cuenta → 404 POMODORO_NOT_FOUND (RF-01, RF-20, CE-02)', async () => {
      const started = await startPomodoro();
      expect((await call('/pomodoros/sesion-1')).body.error?.code).toBe('POMODORO_NOT_FOUND');
      expect((await call('/pomodoros/8f1c2e4a-0000-4000-8000-0000000000ff')).status).toBe(404);
      const bea = await signIn(server, 'bea@example.com');
      const { status, body } = await call(`/pomodoros/${started.body.data?.id ?? ''}`, {}, { ...withSession(), ...bea });
      expect(status).toBe(404);
      expect(body.error).toEqual({ code: 'POMODORO_NOT_FOUND', message: ERROR_CODES.POMODORO_NOT_FOUND.message });
    });

    it('GET /pomodoros lista las sesiones de la más reciente a la más antigua, paginadas (RF-18)', async () => {
      const ids: (string | undefined)[] = [];
      for (let index = 0; index < 3; index++) {
        ids.push((await startPomodoro({ durationMinutes: 1 })).body.data?.id);
        container.clock.advance(MINUTE);
      }
      const { status, body } = await call<PomodoroPage>('/pomodoros?page=1&pageSize=2');
      expect(status).toBe(200);
      expect(body.data?.items.map((pomodoro) => pomodoro.id)).toEqual([ids[2], ids[1]]);
      expect(body.data).toMatchObject({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
    });

    it('GET /pomodoros sin sesiones → lista vacía; no muestra las de otra cuenta (RF-01, CE-02)', async () => {
      await startPomodoro();
      const bea = await signIn(server, 'bea@example.com');
      const { body } = await call<PomodoroPage>('/pomodoros', {}, { ...withSession(), ...bea });
      expect(body.data).toMatchObject({ items: [], totalItems: 0, totalPages: 0 });
    });

    it('GET /pomodoros con pageSize 101 → 400 VALIDATION_ERROR (RF-42 de la 001)', async () => {
      const { status, body } = await call('/pomodoros?pageSize=101');
      expect(status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('la petición previa de CORS admite GET y POST en /pomodoros y GET en /pomodoros/{id}', async () => {
      const preflight = (path: string, method: string) =>
        server.request(path, {
          method: 'OPTIONS',
          headers: { Origin: FRONTEND_ORIGIN, 'Access-Control-Request-Method': method },
        });
      expect((await preflight('/pomodoros', 'GET')).status).toBe(200);
      expect((await preflight('/pomodoros/8f1c2e4a-0000-4000-8000-0000000000ff', 'GET')).status).toBe(200);
    });
  });
  describe('PATCH /pomodoros/{id}', () => {
    const changeStatus = (id: string | undefined, body: unknown, headers = withSession()) =>
      call(`/pomodoros/${id ?? ''}`, { method: 'PATCH', body: JSON.stringify(body) }, headers);

    it('pausa, reanuda y termina a mano → 200 con la sesión (RF-30 a RF-32, RF-50)', async () => {
      const started = await startPomodoro({ newTasks: [{ title: 'Repasar', date: TODAY }] });
      const id = started.body.data?.id;
      container.clock.advance(5 * MINUTE);

      const paused = await changeStatus(id, { status: 'paused' });
      expect(paused.status).toBe(200);
      expect(paused.body).toMatchObject({ success: true, status: 200, message: 'Operación realizada con éxito' });
      expect(paused.body.data).toMatchObject({ status: 'paused', endsAt: null, remainingSeconds: 1200 });

      container.clock.advance(10 * MINUTE);
      // El token de acceso dura 15 minutos (002): se vuelve a iniciar sesión, como haría el frontend
      session = await signIn(server);
      const resumed = await changeStatus(id, { status: 'running' });
      expect(resumed.body.data).toMatchObject({
        status: 'running',
        endsAt: new Date(container.clock.now().getTime() + 20 * MINUTE).toISOString(),
      });

      container.clock.advance(5 * MINUTE);
      const finished = await changeStatus(id, { status: 'finished' });
      expect(finished.body.data).toMatchObject({
        status: 'finished',
        endReason: 'manual',
        focusedSeconds: 600,
        finishedAt: container.clock.now().toISOString(),
        completedTasks: 0,
        totalTasks: 1,
      });
    });

    it('al terminar a mano, las tareas pendientes pasan a espera y se pueden llevar a otra sesión (RF-23, RF-32)', async () => {
      const started = await startPomodoro({ newTasks: [{ title: 'Pendiente', date: TODAY }] });
      await changeStatus(started.body.data?.id, { status: 'finished' });
      const next = await startPomodoro({ waitingTaskIds: [started.body.data?.tasks[0]?.id] });
      expect(next.status).toBe(201);
      expect(next.body.data?.tasks.map((task) => task.title)).toEqual(['Pendiente']);
    });

    it('pedir el estado que ya tiene o cambiar una sesión terminada → 409 INVALID_POMODORO_STATE (RF-34, RF-61)', async () => {
      const id = (await startPomodoro()).body.data?.id;
      expect((await changeStatus(id, { status: 'running' })).body.error?.code).toBe('INVALID_POMODORO_STATE');
      await changeStatus(id, { status: 'finished' });
      const { status, body } = await changeStatus(id, { status: 'paused' });
      expect(status).toBe(409);
      expect(body.error).toEqual({ code: 'INVALID_POMODORO_STATE', message: ERROR_CODES.INVALID_POMODORO_STATE.message });
    });

    it('con una sesión pausada no se puede empezar otra → 409 POMODORO_ALREADY_ACTIVE (RF-12)', async () => {
      const id = (await startPomodoro()).body.data?.id;
      await changeStatus(id, { status: 'paused' });
      container.clock.advance(60 * MINUTE);
      // El token de acceso dura 15 minutos (002): se vuelve a iniciar sesión, como haría el frontend
      session = await signIn(server);
      expect((await startPomodoro()).body.error?.code).toBe('POMODORO_ALREADY_ACTIVE');
    });

    it('un status no válido o con campos extra → 400 VALIDATION_ERROR (RF-50)', async () => {
      const id = (await startPomodoro()).body.data?.id;
      expect((await changeStatus(id, { status: 'cancelled' })).body.error?.code).toBe('VALIDATION_ERROR');
      expect((await changeStatus(id, { status: 'paused', durationMinutes: 5 })).status).toBe(400);
    });

    it('una sesión de otra cuenta → 404 POMODORO_NOT_FOUND (RF-01, RF-20)', async () => {
      const id = (await startPomodoro()).body.data?.id;
      const bea = await signIn(server, 'bea@example.com');
      const { status, body } = await changeStatus(id, { status: 'paused' }, { ...withSession(), ...bea });
      expect(status).toBe(404);
      expect(body.error?.code).toBe('POMODORO_NOT_FOUND');
    });

    it('la petición previa de CORS admite PATCH en /pomodoros/{id}', async () => {
      const response = await server.request('/pomodoros/8f1c2e4a-0000-4000-8000-0000000000ff', {
        method: 'OPTIONS',
        headers: { Origin: FRONTEND_ORIGIN, 'Access-Control-Request-Method': 'PATCH' },
      });
      expect(response.status).toBe(200);
    });
  });
  describe('tareas en espera y lista de la sesión activa', () => {
    interface TaskPage {
      items: PomodoroTaskBody[];
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    }
    const addTasks = (id: string | undefined, body: unknown, headers = withSession()) =>
      call(`/pomodoros/${id ?? ''}/tasks`, { method: 'POST', body: JSON.stringify(body) }, headers);
    const removeTask = (id: string | undefined, taskId: string | undefined) =>
      call(`/pomodoros/${id ?? ''}/tasks/${taskId ?? ''}`, { method: 'DELETE' });
    const deleteTask = (taskId: string | undefined) => call<null>(`/pomodoro-tasks/${taskId ?? ''}`, { method: 'DELETE' });

    it('POST /pomodoros/{id}/tasks añade nuevas y en espera al final → 200 con la sesión (RF-25, RF-51, RF-64)', async () => {
      const old = await startPomodoro({ durationMinutes: 1, newTasks: [{ title: 'En espera', date: TODAY }] });
      container.clock.advance(MINUTE);
      const current = await startPomodoro({ newTasks: [{ title: 'Primera', date: TODAY }] });
      const { status, body } = await addTasks(current.body.data?.id, {
        newTasks: [{ title: 'Nueva', date: TODAY }],
        waitingTaskIds: [old.body.data?.tasks[0]?.id],
      });
      expect(status).toBe(200);
      expect(body).toMatchObject({ success: true, status: 200, message: 'Operación realizada con éxito' });
      expect(body.data?.tasks.map((task) => task.title)).toEqual(['Primera', 'Nueva', 'En espera']);
    });

    it('POST /pomodoros/{id}/tasks sin tareas → 400; pasando de 20 → 409 POMODORO_TASK_LIMIT (RF-51, RF-59)', async () => {
      const titles = Array.from({ length: 19 }, (_, index) => ({ title: `Tarea ${index}`, date: TODAY }));
      const id = (await startPomodoro({ newTasks: titles })).body.data?.id;
      expect((await addTasks(id, {})).body.error?.code).toBe('VALIDATION_ERROR');
      const { status, body } = await addTasks(id, { newTasks: [{ title: 'A', date: TODAY }, { title: 'B', date: TODAY }] });
      expect(status).toBe(409);
      expect(body.error).toEqual({ code: 'POMODORO_TASK_LIMIT', message: ERROR_CODES.POMODORO_TASK_LIMIT.message });
    });

    it('DELETE /pomodoros/{id}/tasks/{taskId} quita la tarea, que pasa a GET /pomodoro-tasks (RF-26, RF-62)', async () => {
      const started = await startPomodoro({ newTasks: [{ title: 'A', date: TODAY }, { title: 'B', date: TODAY }] });
      const [a] = started.body.data?.tasks ?? [];
      const { status, body } = await removeTask(started.body.data?.id, a?.id);
      expect(status).toBe(200);
      expect(body.data?.tasks.map((task) => task.title)).toEqual(['B']);
      const waiting = await call<TaskPage>('/pomodoro-tasks');
      expect(waiting.body.data?.items.map((task) => task.title)).toEqual(['A']);
    });

    it('quitar una completada → 409 POMODORO_TASK_COMPLETED; una que no está → 404 (RF-28, RF-37)', async () => {
      const started = await startPomodoro({ newTasks: [{ title: 'Hecha', date: TODAY }] });
      const taskId = started.body.data?.tasks[0]?.id;
      await call(`/pomodoro-tasks/${taskId ?? ''}`, { method: 'PATCH', body: JSON.stringify({ completed: true }) });
      expect((await removeTask(started.body.data?.id, taskId)).body.error?.code).toBe('POMODORO_TASK_COMPLETED');
      const missing = await removeTask(started.body.data?.id, '8f1c2e4a-0000-4000-8000-0000000000ff');
      expect(missing.status).toBe(404);
      expect(missing.body.error?.code).toBe('POMODORO_TASK_NOT_FOUND');
    });

    it('GET /pomodoro-tasks lista las tareas en espera por fecha y creación, paginadas (RF-24)', async () => {
      await startPomodoro({
        durationMinutes: 1,
        newTasks: [
          { title: 'Mañana', date: '2026-10-25' },
          { title: 'Hoy', date: TODAY },
        ],
      });
      container.clock.advance(MINUTE);
      const { status, body } = await call<TaskPage>('/pomodoro-tasks?page=1&pageSize=1');
      expect(status).toBe(200);
      expect(body.data?.items).toEqual([
        { id: expect.any(String), title: 'Hoy', description: null, date: TODAY, completed: false, completedAt: null },
      ]);
      expect(body.data).toMatchObject({ page: 1, pageSize: 1, totalItems: 2, totalPages: 2 });
    });

    it('DELETE /pomodoro-tasks/{id} borra una tarea en espera → 200 con data null (RF-22)', async () => {
      const started = await startPomodoro({ durationMinutes: 1, newTasks: [{ title: 'Sobra', date: TODAY }] });
      container.clock.advance(MINUTE);
      const taskId = started.body.data?.tasks[0]?.id;
      const { status, body } = await deleteTask(taskId);
      expect(status).toBe(200);
      expect(body).toEqual({ success: true, status: 200, message: 'Operación realizada con éxito', data: null });
      expect((await deleteTask(taskId)).body.error?.code).toBe('POMODORO_TASK_NOT_FOUND');
    });

    it('DELETE /pomodoro-tasks/{id} de una tarea de la sesión activa → 409 POMODORO_TASK_IN_SESSION (RF-29)', async () => {
      const started = await startPomodoro({ newTasks: [{ title: 'En curso', date: TODAY }] });
      const { status, body } = await deleteTask(started.body.data?.tasks[0]?.id);
      expect(status).toBe(409);
      expect(body.error?.code).toBe('POMODORO_TASK_IN_SESSION');
    });

    it('la petición previa de CORS admite cada método en su ruta', async () => {
      const preflight = (path: string, method: string) =>
        server.request(path, {
          method: 'OPTIONS',
          headers: { Origin: FRONTEND_ORIGIN, 'Access-Control-Request-Method': method },
        });
      const id = '8f1c2e4a-0000-4000-8000-0000000000ff';
      expect((await preflight(`/pomodoros/${id}/tasks`, 'POST')).status).toBe(200);
      expect((await preflight(`/pomodoros/${id}/tasks/${id}`, 'DELETE')).status).toBe(200);
      expect((await preflight('/pomodoro-tasks', 'GET')).status).toBe(200);
      expect((await preflight(`/pomodoro-tasks/${id}`, 'DELETE')).status).toBe(200);
    });
  });
});
