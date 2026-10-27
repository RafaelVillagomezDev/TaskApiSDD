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

  describe('GET /tasks con filtros y paginación (HU-04)', () => {
    const titles = (body: Envelope) => body.data.items.map((task: { title: string }) => task.title);

    beforeEach(async () => {
      const seed = async (title: string, date: string, completed: boolean) => {
        const task = await container.tasks.create({ userId: 'user-1', title, description: null, date: LocalDate.parse(date) });
        if (completed) {
          task.complete(LocalDate.parse(date));
          await container.tasks.update(task);
        }
      };
      await seed('Hecha 20', '2026-10-20', true);
      await seed('Pendiente 21', '2026-10-21', false);
      await seed('Hecha 22', '2026-10-22', true);
      await seed('Pendiente 23', '2026-10-23', false);
      await seed('Hecha 24', '2026-10-24', true);
    });

    it('sin filtros devuelve todas, paginadas y ordenadas por fecha (RF-09, RF-39, RF-41)', async () => {
      const { status, body } = await call('/tasks');
      expect(status).toBe(200);
      expect(body).toMatchObject({ success: true, status: 200, message: 'Operación realizada con éxito' });
      expect(body.data).toMatchObject({ page: 1, pageSize: 50, totalItems: 5, totalPages: 1 });
      expect(titles(body)).toEqual(['Hecha 20', 'Pendiente 21', 'Hecha 22', 'Pendiente 23', 'Hecha 24']);
    });

    it('?status=pending devuelve solo las pendientes (RF-10)', async () => {
      expect(titles((await call('/tasks?status=pending')).body)).toEqual(['Pendiente 21', 'Pendiente 23']);
    });

    it('?status=completed devuelve solo las completadas (RF-10)', async () => {
      expect(titles((await call('/tasks?status=completed')).body)).toEqual(['Hecha 20', 'Hecha 22', 'Hecha 24']);
    });

    it('?from=&to= devuelve el rango con ambos días incluidos (RF-40)', async () => {
      const { body } = await call('/tasks?from=2026-10-21&to=2026-10-23');
      expect(titles(body)).toEqual(['Pendiente 21', 'Hecha 22', 'Pendiente 23']);
      expect(body.data.totalItems).toBe(3);
    });

    it('pagina con page y pageSize y devuelve items vacío fuera de rango (RF-39)', async () => {
      const second = await call('/tasks?page=2&pageSize=2');
      expect(second.body.data).toMatchObject({ page: 2, pageSize: 2, totalItems: 5, totalPages: 3 });
      expect(titles(second.body)).toEqual(['Hecha 22', 'Pendiente 23']);
      const outOfRange = await call('/tasks?page=9&pageSize=2');
      expect(outOfRange.status).toBe(200);
      expect(outOfRange.body.data).toMatchObject({ items: [], totalItems: 5, totalPages: 3 });
    });

    it.each([
      ['pageSize=101', 'pageSize'],
      ['page=0', 'page'],
      ['status=done', 'status'],
      ['from=2026-10-25&to=2026-10-24', 'to'],
      [`date=${TODAY}&from=2026-10-20`, 'date'],
    ])('?%s → 400 VALIDATION_ERROR sobre el campo %s (RF-42, RF-43)', async (query, field) => {
      const { status, body } = await call(`/tasks?${query}`);
      expect(status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      expect(body.error?.details).toEqual([expect.objectContaining({ field })]);
    });

    it('INVALID_TIMEZONE gana a una query no válida (RF-46)', async () => {
      const headers = clientHeaders({ timeZone: 'Mars/Olympus' });
      expect((await call('/tasks?pageSize=101', {}, headers)).body.error?.code).toBe('INVALID_TIMEZONE');
    });
  });

  describe('GET /tasks/{id}', () => {
    const seed = (date: string, userId = 'user-1') =>
      container.tasks.create({ userId, title: 'Tarea', description: null, date: LocalDate.parse(date) });

    it('una tarea propia → 200 con el recurso Task en data (RF-44)', async () => {
      const task = await seed(TODAY);
      const { status, body } = await call(`/tasks/${task.id}`);
      expect(status).toBe(200);
      expect(body).toMatchObject({ success: true, status: 200, message: 'Operación realizada con éxito' });
      expect(body.data).toEqual({
        id: task.id,
        title: 'Tarea',
        description: null,
        date: TODAY,
        completed: false,
        createdAt: expect.stringMatching(/Z$/),
        updatedAt: expect.stringMatching(/Z$/),
      });
    });

    it('una tarea propia de un día pasado → 200 (RF-44)', async () => {
      const task = await seed('2026-10-20');
      const { status, body } = await call(`/tasks/${task.id}`);
      expect(status).toBe(200);
      expect(body.data.date).toBe('2026-10-20');
    });

    it.each([
      ['de otro usuario', async () => (await seed(TODAY, 'user-2')).id],
      ['inexistente', async () => '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b'],
      ['con id no UUID', async () => 'abc'],
    ])('una tarea %s → 404 TASK_NOT_FOUND (RF-16)', async (_case, idOf) => {
      const { status, body } = await call(`/tasks/${await idOf()}`);
      expect(status).toBe(404);
      expect(body.error?.code).toBe('TASK_NOT_FOUND');
    });

    it('sin cabeceras de hora y con un id inexistente → INVALID_CLIENT_TIME (RF-46)', async () => {
      const { 'X-Client-Time': _omitted, ...headers } = clientHeaders();
      const { status, body } = await call('/tasks/6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b', {}, headers);
      expect(status).toBe(400);
      expect(body.error?.code).toBe('INVALID_CLIENT_TIME');
    });

    it('sin X-User-Id → 401 MISSING_USER', async () => {
      const task = await seed(TODAY);
      const { 'X-User-Id': _omitted, ...headers } = clientHeaders();
      expect((await call(`/tasks/${task.id}`, {}, headers)).body.error?.code).toBe('MISSING_USER');
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

  describe('PATCH /tasks/{id} con edición (HU-05)', () => {
    const seed = (date: string) =>
      container.tasks.create({ userId: 'user-1', title: 'Tarea', description: 'Original', date: LocalDate.parse(date) });
    const patch = (id: string, body: unknown, headers = clientHeaders()) =>
      call(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, headers);

    it('cambia el título recortado y conserva el resto → 200 (RF-13, RF-38)', async () => {
      const task = await seed(TODAY);
      const { status, body } = await patch(task.id, { title: '  Nuevo título  ' });
      expect(status).toBe(200);
      expect(body).toMatchObject({ success: true, status: 200, message: 'Tarea actualizada con éxito' });
      expect(body.data).toMatchObject({ id: task.id, title: 'Nuevo título', description: 'Original', date: TODAY, completed: false });
    });

    it('una descripción vacía la borra (null) (RF-38)', async () => {
      const task = await seed(TODAY);
      expect((await patch(task.id, { description: '   ' })).body.data.description).toBeNull();
    });

    it.each([{ date: '2026-10-25' }, { title: 'Nuevo', priority: 'alta' }])(
      '%p → 400 VALIDATION_ERROR y la tarea no cambia (RF-37)',
      async (body) => {
        const task = await seed(TODAY);
        const response = await patch(task.id, body);
        expect(response.status).toBe(400);
        expect(response.body.error?.code).toBe('VALIDATION_ERROR');
        expect((await container.tasks.findById('user-1', task.id))?.title).toBe('Tarea');
      },
    );

    it('un título de 201 caracteres → 400 VALIDATION_ERROR con details (RF-04)', async () => {
      const task = await seed(TODAY);
      const { status, body } = await patch(task.id, { title: 'a'.repeat(201) });
      expect(status).toBe(400);
      expect(body.error?.details).toEqual([{ field: 'title', message: expect.any(String) }]);
    });

    it('editar una tarea de ayer → 409 DAY_CLOSED (RF-14)', async () => {
      const task = await seed('2026-10-23');
      const { status, body } = await patch(task.id, { title: 'Nuevo' });
      expect(status).toBe(409);
      expect(body.error?.code).toBe('DAY_CLOSED');
    });
  });

  describe('DELETE /tasks/{id} (HU-05)', () => {
    const seed = (date: string, userId = 'user-1') =>
      container.tasks.create({ userId, title: 'Tarea', description: null, date: LocalDate.parse(date) });
    const remove = (id: string, headers = clientHeaders()) => call(`/tasks/${id}`, { method: 'DELETE' }, headers);

    it('borra una tarea de hoy → 200 con data null y deja de aparecer (RF-15)', async () => {
      const task = await seed(TODAY);
      const { status, body } = await remove(task.id);
      expect(status).toBe(200);
      expect(body).toEqual({ success: true, status: 200, message: 'Tarea eliminada con éxito', data: null });
      expect((await call(`/tasks?date=${TODAY}`)).body.data.items).toEqual([]);
      expect((await call(`/tasks/${task.id}`)).body.error?.code).toBe('TASK_NOT_FOUND');
    });

    it('borra una tarea de un día futuro → 200 (RF-15)', async () => {
      const task = await seed('2026-10-30');
      expect((await remove(task.id)).status).toBe(200);
    });

    it('una tarea de ayer → 409 DAY_CLOSED (RF-14)', async () => {
      const task = await seed('2026-10-23');
      const { status, body } = await remove(task.id);
      expect(status).toBe(409);
      expect(body.error?.code).toBe('DAY_CLOSED');
    });

    it.each([
      ['de otro usuario', async () => (await seed(TODAY, 'user-2')).id],
      ['inexistente', async () => '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b'],
      ['con id no UUID', async () => 'abc'],
    ])('una tarea %s → 404 TASK_NOT_FOUND (RF-16)', async (_case, idOf) => {
      const { status, body } = await remove(await idOf());
      expect(status).toBe(404);
      expect(body.error?.code).toBe('TASK_NOT_FOUND');
    });

    it('un PATCH sobre una tarea borrada → 404 TASK_NOT_FOUND (RF-15, RF-16)', async () => {
      const task = await seed(TODAY);
      await remove(task.id);
      const { status, body } = await call(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ title: 'X' }) });
      expect(status).toBe(404);
      expect(body.error?.code).toBe('TASK_NOT_FOUND');
    });

    it('sin X-User-Id → 401 MISSING_USER y no borra (RF-01, RF-46)', async () => {
      const task = await seed(TODAY);
      const { 'X-User-Id': _omitted, ...headers } = clientHeaders();
      expect((await remove(task.id, headers)).body.error?.code).toBe('MISSING_USER');
      expect(container.tasks.count()).toBe(1);
    });

    it('INVALID_TIMEZONE gana a TASK_NOT_FOUND (RF-46)', async () => {
      const headers = clientHeaders({ timeZone: 'Mars/Olympus' });
      expect((await remove('abc', headers)).body.error?.code).toBe('INVALID_TIMEZONE');
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
