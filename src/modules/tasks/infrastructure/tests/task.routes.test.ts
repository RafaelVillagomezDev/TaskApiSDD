import {
  clientHeaders,
  createTestContainer,
  startTestServer,
  type TestContainer,
  type TestServer,
} from '../../../../../tests/support/test.container.js';
import { createApp } from '../../../../app.factory.js';
import { ERROR_CODES } from '../../../../shared/domain/error-code.constant.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';

interface Envelope {
  success: boolean;
  status: number;
  message?: string;
  data?: any;
  error?: { code: string; message: string; details?: { field: string; message: string }[] };
}

// Reloj de los tests: 2026-10-24T10:00:00Z → hoy es 2026-10-24 en Madrid (12:00 +02:00)
const TODAY = '2026-10-24';

describe('rutas de tareas', () => {
  let container: TestContainer;
  let server: TestServer;

  const call = async (path: string, init: RequestInit = {}, headers = clientHeaders()) => {
    const response = await server.request(path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : undefined) as Envelope };
  };
  const createTask = (body: unknown, headers = clientHeaders()) =>
    call('/tasks', { method: 'POST', body: JSON.stringify(body) }, headers);

  beforeEach(async () => {
    container = createTestContainer();
    server = await startTestServer(createApp(container));
  });
  afterEach(() => server.close());

  describe('POST /tasks', () => {
    it('crea una tarea para hoy → 201 con el recurso Task en data (RF-03)', async () => {
      const { status, body } = await createTask({ title: '  Comprar pan ', date: TODAY });
      expect(status).toBe(201);
      expect(body).toMatchObject({ success: true, status: 201, message: 'Tarea creada con éxito' });
      expect(body.data).toEqual({
        id: expect.any(String),
        title: 'Comprar pan',
        description: null,
        date: TODAY,
        completed: false,
        createdAt: expect.stringMatching(/Z$/),
        updatedAt: expect.stringMatching(/Z$/),
      });
    });

    it('acepta un día futuro (RF-03)', async () => {
      expect((await createTask({ title: 'Viaje', date: '2027-03-01' })).status).toBe(201);
    });

    it('rechaza ayer con 409 DAY_CLOSED (RF-07)', async () => {
      const { status, body } = await createTask({ title: 'Tarde', date: '2026-10-23' });
      expect(status).toBe(409);
      expect(body.error?.code).toBe('DAY_CLOSED');
    });

    it('rechaza un título vacío con VALIDATION_ERROR y details (RF-04)', async () => {
      const { status, body } = await createTask({ title: '', date: TODAY });
      expect(status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      expect(body.error?.details).toEqual([expect.objectContaining({ field: 'title' })]);
    });
  });

  describe('GET /tasks?date=', () => {
    it('devuelve las tareas de ese día paginadas (RF-08, RF-39)', async () => {
      await createTask({ title: 'Hoy', date: TODAY });
      await createTask({ title: 'Mañana', date: '2026-10-25' });
      const { status, body } = await call(`/tasks?date=${TODAY}`);
      expect(status).toBe(200);
      expect(body).toMatchObject({ success: true, status: 200, message: 'Operación realizada con éxito' });
      expect(body.data).toMatchObject({ page: 1, pageSize: 50, totalItems: 1, totalPages: 1 });
      expect(body.data.items.map((task: { title: string }) => task.title)).toEqual(['Hoy']);
    });

    it('aísla las tareas de cada usuario (RF-02)', async () => {
      await createTask({ title: 'Mía', date: TODAY });
      const { body } = await call(`/tasks?date=${TODAY}`, {}, clientHeaders({ userId: 'otro-usuario' }));
      expect(body.data.items).toEqual([]);
    });
  });

  describe('PATCH /tasks/{id} con completed', () => {
    const seed = (date: string, userId = 'user-1') =>
      container.tasks.create({ userId, title: 'Tarea', description: null, date: LocalDate.parse(date) });
    const patch = (id: string, body: unknown, headers = clientHeaders()) =>
      call(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, headers);

    it('completa una tarea de hoy → 200 con el recurso actualizado (RF-11)', async () => {
      const task = await seed(TODAY);
      const { status, body } = await patch(task.id, { completed: true });
      expect(status).toBe(200);
      expect(body).toMatchObject({ success: true, status: 200, message: 'Tarea actualizada con éxito' });
      expect(body.data).toMatchObject({ id: task.id, completed: true, date: TODAY });
    });

    it('desmarca y es idempotente (RF-12)', async () => {
      const task = await seed(TODAY);
      await patch(task.id, { completed: true });
      expect((await patch(task.id, { completed: true })).body.data.completed).toBe(true);
      expect((await patch(task.id, { completed: false })).body.data.completed).toBe(false);
    });

    it('una tarea de ayer → 409 DAY_CLOSED (RF-14)', async () => {
      const task = await seed('2026-10-23');
      const { status, body } = await patch(task.id, { completed: true });
      expect(status).toBe(409);
      expect(body.error?.code).toBe('DAY_CLOSED');
    });

    it('completar una tarea de mañana → 409 DAY_NOT_STARTED (RF-45)', async () => {
      const task = await seed('2026-10-25');
      const { status, body } = await patch(task.id, { completed: true });
      expect(status).toBe(409);
      expect(body.error?.code).toBe('DAY_NOT_STARTED');
    });

    it('una tarea de otro usuario o con id no UUID → 404 TASK_NOT_FOUND (RF-16)', async () => {
      const foreign = await seed(TODAY, 'user-2');
      expect((await patch(foreign.id, { completed: true })).body.error?.code).toBe('TASK_NOT_FOUND');
      const { status, body } = await patch('abc', { completed: true });
      expect(status).toBe(404);
      expect(body.error?.code).toBe('TASK_NOT_FOUND');
    });

    it('VALIDATION_ERROR gana a TASK_NOT_FOUND (RF-46)', async () => {
      expect((await patch('abc', { completed: 'sí' })).body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('un cuerpo vacío → VALIDATION_ERROR', async () => {
      const task = await seed(TODAY);
      expect((await patch(task.id, {})).body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('cabeceras y precedencia de errores (RF-01, RF-46)', () => {
    it('sin X-User-Id → 401 MISSING_USER con el mensaje en español (RNF-03)', async () => {
      const { 'X-User-Id': _omitted, ...headers } = clientHeaders();
      const { status, body } = await call(`/tasks?date=${TODAY}`, {}, headers);
      expect(status).toBe(401);
      expect(body.error).toEqual({ code: 'MISSING_USER', message: ERROR_CODES.MISSING_USER.message });
    });

    it('MISSING_USER gana a INVALID_CLIENT_TIME', async () => {
      const { 'X-User-Id': _omitted, ...headers } = clientHeaders({ clientTime: 'mal' });
      expect((await createTask({ title: 'Tarea', date: TODAY }, headers)).body.error?.code).toBe('MISSING_USER');
    });

    it('INVALID_CLIENT_TIME gana a INVALID_TIMEZONE', async () => {
      const headers = clientHeaders({ clientTime: 'mal', timeZone: 'Mars/Olympus' });
      expect((await createTask({ title: 'Tarea', date: TODAY }, headers)).body.error?.code).toBe('INVALID_CLIENT_TIME');
    });

    it('INVALID_TIMEZONE gana a VALIDATION_ERROR', async () => {
      const headers = clientHeaders({ timeZone: 'Mars/Olympus' });
      expect((await createTask({ title: '' }, headers)).body.error?.code).toBe('INVALID_TIMEZONE');
    });

    it('VALIDATION_ERROR gana a DAY_CLOSED', async () => {
      expect((await createTask({ title: '', date: '2026-10-23' })).body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('PUT /tasks sin X-User-Id → ROUTE_NOT_FOUND', async () => {
      const { status, body } = await call('/tasks', { method: 'PUT' }, {});
      expect(status).toBe(404);
      expect(body.error?.code).toBe('ROUTE_NOT_FOUND');
    });
  });
});
