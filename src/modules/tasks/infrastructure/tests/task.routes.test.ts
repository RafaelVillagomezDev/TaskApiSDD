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
// Dueño de las tareas ajenas sembradas directamente en el repositorio en memoria
const OTHER_USER = 'otro-usuario';

describe('rutas de tareas', () => {
  let container: TestContainer;
  let server: TestServer;
  let session: SessionHeaders;
  // Cuenta de la sesión de Ana: sus tareas se siembran con este id
  let anaId: string;

  // Cabeceras de hora y zona con la sesión de Ana (RF-17 de la 002)
  const withSession = (options = {}): Record<string, string> => ({ ...clientHeaders(options), ...session });
  const call = async (path: string, init: RequestInit = {}, headers: Record<string, string> = withSession()) => {
    const response = await server.request(path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : undefined) as Envelope };
  };
  const createTask = (body: unknown, headers: Record<string, string> = withSession()) =>
    call('/tasks', { method: 'POST', body: JSON.stringify(body) }, headers);

  beforeEach(async () => {
    container = createTestContainer();
    server = await startTestServer(createApp(container));
    session = await signIn(server);
    anaId = await userIdOf(container);
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

    it('aísla las tareas de cada cuenta (RF-21 de la 002, CE-02)', async () => {
      await createTask({ title: 'Mía', date: TODAY });
      const bea = await signIn(server, 'bea@example.com');
      const { body } = await call(`/tasks?date=${TODAY}`, {}, { ...clientHeaders(), ...bea });
      expect(body.data.items).toEqual([]);
    });
  });

  describe('GET /tasks con filtros y paginación (HU-04)', () => {
    const titles = (body: Envelope) => body.data.items.map((task: { title: string }) => task.title);

    beforeEach(async () => {
      const seed = async (title: string, date: string, completed: boolean) => {
        const task = await container.tasks.create({ userId: anaId, title, description: null, date: LocalDate.parse(date) });
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
      const headers = withSession({ timeZone: 'Mars/Olympus' });
      expect((await call('/tasks?pageSize=101', {}, headers)).body.error?.code).toBe('INVALID_TIMEZONE');
    });
  });

  describe('GET /tasks/{id}', () => {
    const seed = (date: string, userId = anaId) =>
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
      ['de otro usuario', async () => (await seed(TODAY, OTHER_USER)).id],
      ['inexistente', async () => '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b'],
      ['con id no UUID', async () => 'abc'],
    ])('una tarea %s → 404 TASK_NOT_FOUND (RF-16)', async (_case, idOf) => {
      const { status, body } = await call(`/tasks/${await idOf()}`);
      expect(status).toBe(404);
      expect(body.error?.code).toBe('TASK_NOT_FOUND');
    });

    it('sin cabeceras de hora y con un id inexistente → INVALID_CLIENT_TIME (RF-46)', async () => {
      const { 'X-Client-Time': _omitted, ...headers } = withSession();
      const { status, body } = await call('/tasks/6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b', {}, headers);
      expect(status).toBe(400);
      expect(body.error?.code).toBe('INVALID_CLIENT_TIME');
    });

    it('sin cookie de sesión → 401 MISSING_TOKEN (RF-18 de la 002)', async () => {
      const task = await seed(TODAY);
      expect((await call(`/tasks/${task.id}`, {}, clientHeaders())).body.error?.code).toBe('MISSING_TOKEN');
    });
  });

  describe('PATCH /tasks/{id} con completed', () => {
    const seed = (date: string, userId = anaId) =>
      container.tasks.create({ userId, title: 'Tarea', description: null, date: LocalDate.parse(date) });
    const patch = (id: string, body: unknown, headers: Record<string, string> = withSession()) =>
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
      const foreign = await seed(TODAY, OTHER_USER);
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
      container.tasks.create({ userId: anaId, title: 'Tarea', description: 'Original', date: LocalDate.parse(date) });
    const patch = (id: string, body: unknown, headers: Record<string, string> = withSession()) =>
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
        expect((await container.tasks.findById(anaId, task.id))?.title).toBe('Tarea');
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
    const seed = (date: string, userId = anaId) =>
      container.tasks.create({ userId, title: 'Tarea', description: null, date: LocalDate.parse(date) });
    const remove = (id: string, headers: Record<string, string> = withSession()) => call(`/tasks/${id}`, { method: 'DELETE' }, headers);

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
      ['de otro usuario', async () => (await seed(TODAY, OTHER_USER)).id],
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

    it('con X-CSRF-Token y sin cookie → 401 MISSING_TOKEN y no borra (RF-18, RF-23 de la 002, decisión 19)', async () => {
      const task = await seed(TODAY);
      const headers = { ...clientHeaders(), 'X-CSRF-Token': session['X-CSRF-Token'] };
      expect((await remove(task.id, headers)).body.error?.code).toBe('MISSING_TOKEN');
      expect(container.tasks.count()).toBe(1);
    });

    it('sin X-CSRF-Token → 403 INVALID_CSRF_TOKEN y no borra (RF-23 de la 002)', async () => {
      const task = await seed(TODAY);
      const { 'X-CSRF-Token': _omitted, ...headers } = withSession();
      const { status, body } = await remove(task.id, headers);
      expect(status).toBe(403);
      expect(body.error?.code).toBe('INVALID_CSRF_TOKEN');
      expect(container.tasks.count()).toBe(1);
    });

    it('INVALID_TIMEZONE gana a TASK_NOT_FOUND (RF-46)', async () => {
      const headers = withSession({ timeZone: 'Mars/Olympus' });
      expect((await remove('abc', headers)).body.error?.code).toBe('INVALID_TIMEZONE');
    });
  });

  describe('sesión, CSRF y precedencia de errores (RF-17 a RF-23 y RF-34 de la 002)', () => {
    it('sin cookie de sesión → 401 MISSING_TOKEN con el mensaje en español (RNF-02 de la 002)', async () => {
      const { status, body } = await call(`/tasks?date=${TODAY}`, {}, clientHeaders());
      expect(status).toBe(401);
      expect(body.error).toEqual({ code: 'MISSING_TOKEN', message: ERROR_CODES.MISSING_TOKEN.message });
    });

    it('X-User-Id sin cookie no identifica a nadie → 401 MISSING_TOKEN (RF-18, RF-32 de la 002)', async () => {
      const { body } = await call('/tasks', {}, { ...clientHeaders(), 'X-User-Id': anaId });
      expect(body.error?.code).toBe('MISSING_TOKEN');
    });

    it('X-User-Id de otro usuario con la sesión de Ana no tiene efecto (RF-32 de la 002)', async () => {
      await createTask({ title: 'Mía', date: TODAY }, { ...withSession(), 'X-User-Id': OTHER_USER });
      const { body } = await call(`/tasks?date=${TODAY}`, {}, { ...withSession(), 'X-User-Id': OTHER_USER });
      expect(body.data.items.map((task: { title: string }) => task.title)).toEqual(['Mía']);
      expect(container.tasks.count()).toBe(1);
    });

    it('POST sin X-CSRF-Token → 403 INVALID_CSRF_TOKEN y no crea nada; un GET no lo pide (RF-23 de la 002)', async () => {
      const { 'X-CSRF-Token': _omitted, ...headers } = withSession();
      const { status, body } = await createTask({ title: 'Tarea', date: TODAY }, headers);
      expect(status).toBe(403);
      expect(body.error?.code).toBe('INVALID_CSRF_TOKEN');
      expect(container.tasks.count()).toBe(0);
      expect((await call('/tasks', {}, headers)).status).toBe(200);
    });

    it('con el token CSRF previo a la sesión → 403 INVALID_CSRF_TOKEN: solo sirve para registro y login (RF-22)', async () => {
      const presession = (await (await server.request('/auth/csrf')).json()) as { data: { csrfToken: string } };
      const headers = { ...withSession(), 'X-CSRF-Token': presession.data.csrfToken };
      expect((await createTask({ title: 'Tarea', date: TODAY }, headers)).body.error?.code).toBe('INVALID_CSRF_TOKEN');
    });

    it('con el token de acceso caducado → 401 TOKEN_EXPIRED; tras renovar, la misma petición → 200 (RF-20, RF-11)', async () => {
      container.clock.advance(16 * 60_000);
      const headers = withSession({ clientTime: '2026-10-24T12:16:00+02:00' });
      expect((await call('/tasks', {}, headers)).body.error?.code).toBe('TOKEN_EXPIRED');
      const renewed = await server.request('/auth/refresh', { method: 'POST', headers: session });
      const cookie = renewed.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      expect((await call('/tasks', {}, { ...headers, Cookie: cookie })).status).toBe(200);
    });

    it('CE-01 de la 002: cuatro peticiones hasta la primera tarea (token previo, registro, login y POST /tasks)', async () => {
      const presession = (await (await server.request('/auth/csrf')).json()) as { data: { csrfToken: string } };
      const auth = { 'Content-Type': 'application/json', 'X-CSRF-Token': presession.data.csrfToken };
      const credentials = JSON.stringify({ email: 'cris@example.com', password: 'correct horse battery' });
      await server.request('/auth/register', { method: 'POST', headers: auth, body: credentials });
      const login = await server.request('/auth/login', { method: 'POST', headers: auth, body: credentials });
      const { data } = (await login.json()) as { data: { csrfToken: string } };
      const cookie = login.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      const created = await createTask(
        { title: 'Primera', date: TODAY },
        { ...clientHeaders(), Cookie: cookie, 'X-CSRF-Token': data.csrfToken },
      );
      expect(created.status).toBe(201);
    });

    it('sin cookie de sesión gana a INVALID_CLIENT_TIME (RF-34 de la 002)', async () => {
      const headers = { ...clientHeaders({ clientTime: 'mal' }), 'X-CSRF-Token': session['X-CSRF-Token'] };
      expect((await createTask({ title: 'Tarea', date: TODAY }, headers)).body.error?.code).toBe('MISSING_TOKEN');
    });

    it('INVALID_CLIENT_TIME gana a INVALID_TIMEZONE', async () => {
      const headers = withSession({ clientTime: 'mal', timeZone: 'Mars/Olympus' });
      expect((await createTask({ title: 'Tarea', date: TODAY }, headers)).body.error?.code).toBe('INVALID_CLIENT_TIME');
    });

    it('INVALID_TIMEZONE gana a VALIDATION_ERROR', async () => {
      const headers = withSession({ timeZone: 'Mars/Olympus' });
      expect((await createTask({ title: '' }, headers)).body.error?.code).toBe('INVALID_TIMEZONE');
    });

    it('VALIDATION_ERROR gana a DAY_CLOSED', async () => {
      expect((await createTask({ title: '', date: '2026-10-23' })).body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('PUT /tasks sin sesión → ROUTE_NOT_FOUND (RF-34 de la 002)', async () => {
      const { status, body } = await call('/tasks', { method: 'PUT' }, {});
      expect(status).toBe(404);
      expect(body.error?.code).toBe('ROUTE_NOT_FOUND');
    });
  });

  describe('peticiones previas de CORS (RF-36 de la 002)', () => {
    it.each([
      ['/tasks', 'POST', 'GET, POST'],
      ['/tasks/6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b', 'DELETE', 'GET, PATCH, DELETE'],
    ])('OPTIONS %s pidiendo %s → 200 con los métodos de la ruta', async (path, method, allowed) => {
      const response = await server.request(path, {
        method: 'OPTIONS',
        headers: { Origin: FRONTEND_ORIGIN, 'Access-Control-Request-Method': method },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-methods')).toBe(allowed);
    });

    it('OPTIONS /tasks pidiendo PUT → 404 ROUTE_NOT_FOUND', async () => {
      const response = await server.request('/tasks', {
        method: 'OPTIONS',
        headers: { Origin: FRONTEND_ORIGIN, 'Access-Control-Request-Method': 'PUT' },
      });
      expect(response.status).toBe(404);
    });
  });

  // Batería por pares (R-8): partiendo de un PATCH válido, se combinan dos fallos de niveles distintos
  // y la respuesta debe ser el de menor orden. El nivel 8 tiene dos variantes excluyentes entre sí.
  // El nivel 3 es la sesión sin cookie, con X-CSRF-Token (decisión 19); el nivel 2 (CSRF) y los pares de
  // la decisión 19 se añaden en la fase de robustez (T116)
  describe('precedencia por pares de RF-34 de la 002 (R-8)', () => {
    type Fault = 'route' | 'session' | 'clientTime' | 'timeZone' | 'validation' | 'notFound' | 'dayClosed' | 'dayNotStarted';

    interface PatchRequest {
      method: string;
      headers: Record<string, string>;
      body: unknown;
      owner: 'own' | 'other';
      date: string;
    }

    // Código esperado y nivel de cada fallo, en el orden de RF-34 de la 002
    const FAULTS: Record<Fault, { level: number; code: string; apply: (request: PatchRequest) => void }> = {
      route: { level: 1, code: 'ROUTE_NOT_FOUND', apply: (request) => (request.method = 'PUT') },
      session: { level: 3, code: 'MISSING_TOKEN', apply: (request) => delete request.headers.Cookie },
      clientTime: { level: 4, code: 'INVALID_CLIENT_TIME', apply: (request) => (request.headers['X-Client-Time'] = 'mal') },
      timeZone: { level: 5, code: 'INVALID_TIMEZONE', apply: (request) => (request.headers['X-Timezone'] = 'Mars/Olympus') },
      validation: { level: 6, code: 'VALIDATION_ERROR', apply: (request) => (request.body = { completed: 'sí' }) },
      notFound: { level: 7, code: 'TASK_NOT_FOUND', apply: (request) => (request.owner = 'other') },
      dayClosed: { level: 8, code: 'DAY_CLOSED', apply: (request) => (request.date = '2026-10-23') },
      dayNotStarted: { level: 8, code: 'DAY_NOT_STARTED', apply: (request) => (request.date = '2026-10-25') },
    };

    const faults = Object.keys(FAULTS) as Fault[];
    const pairs = faults
      .flatMap((first, index) => faults.slice(index + 1).map((second) => [first, second] as const))
      .filter(([first, second]) => FAULTS[first].level !== FAULTS[second].level);

    // Una tarea por dueño y día: el fallo de nivel 7 cambia el dueño y los de nivel 8, el día
    let taskIds: Record<string, string>;
    beforeEach(async () => {
      taskIds = {};
      const owners = { own: anaId, other: OTHER_USER };
      for (const [owner, userId] of Object.entries(owners)) {
        for (const date of ['2026-10-23', TODAY, '2026-10-25']) {
          const task = await container.tasks.create({ userId, title: 'Tarea', description: null, date: LocalDate.parse(date) });
          taskIds[`${owner}|${date}`] = task.id;
        }
      }
    });

    it('cubre los 27 pares de niveles distintos', () => {
      expect(pairs).toHaveLength(27);
    });

    it('sin fallos, el PATCH base es válido → 200', async () => {
      const { status } = await call(`/tasks/${taskIds[`own|${TODAY}`]}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: true }),
      });
      expect(status).toBe(200);
    });

    it.each(pairs)('%s + %s → gana el de menor orden', async (first, second) => {
      const request: PatchRequest = {
        method: 'PATCH',
        headers: withSession(),
        body: { completed: true },
        owner: 'own',
        date: TODAY,
      };
      FAULTS[first].apply(request);
      FAULTS[second].apply(request);

      const { status, body } = await call(
        `/tasks/${taskIds[`${request.owner}|${request.date}`]}`,
        { method: request.method, body: JSON.stringify(request.body) },
        request.headers,
      );

      const expected = FAULTS[first].level < FAULTS[second].level ? FAULTS[first].code : FAULTS[second].code;
      expect(body.error?.code).toBe(expected);
      expect(status).toBe(ERROR_CODES[expected as keyof typeof ERROR_CODES].status);
    });
  });
});
