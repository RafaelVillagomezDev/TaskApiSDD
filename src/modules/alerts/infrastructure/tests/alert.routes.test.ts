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
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';

interface Envelope {
  success: boolean;
  status: number;
  message?: string;
  data?: any;
  error?: { code: string; message: string; details?: { field: string; message: string }[] };
}

// Reloj de los tests: 2026-10-24T10:00:00Z → sábado 24 a las 12:00 en Madrid
const TODAY = '2026-10-24';

describe('GET /alerts', () => {
  let container: TestContainer;
  let server: TestServer;
  let session: SessionHeaders;

  // Cabeceras de hora y zona con la sesión de Ana (RF-17 de la 002)
  const withSession = (options = {}): Record<string, string> => ({ ...clientHeaders(options), ...session });
  const call = async (path: string, init: RequestInit = {}, headers: Record<string, string> = withSession()) => {
    const response = await server.request(path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : undefined) as Envelope };
  };

  // Lleva el reloj a las 22:00 en Madrid y ejecuta una pasada del planificador. El token de acceso dura
  // 15 minutos (RF-07 de la 002): a esa hora se inicia sesión de nuevo con nightHeaders
  const runAlertPassAt22 = async () => {
    container.clock.set('2026-10-24T20:00:00Z');
    await container.generateAlerts.execute();
  };
  const nightHeaders = async (email = 'ana@example.com') => ({
    ...clientHeaders({ clientTime: '2026-10-24T22:00:00+02:00' }),
    ...(await signIn(server, email)),
  });

  beforeEach(async () => {
    container = createTestContainer();
    server = await startTestServer(createApp(container));
    session = await signIn(server);
  });
  afterEach(() => server.close());

  it('sin avisos → 200 con una página vacía en el sobre (RF-29, RF-39)', async () => {
    const { status, body } = await call('/alerts');
    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      status: 200,
      message: 'Operación realizada con éxito',
      data: { items: [], page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
    });
  });

  it('devuelve el aviso con su periodo y la copia de sus tareas (RF-24, RF-29)', async () => {
    const created = await call('/tasks', { method: 'POST', body: JSON.stringify({ title: 'Llamar al banco', date: TODAY }) });
    await runAlertPassAt22();

    const { status, body } = await call('/alerts', {}, await nightHeaders());

    expect(status).toBe(200);
    const daily = body.data.items.find((alert: { type: string }) => alert.type === 'daily');
    expect(daily).toEqual({
      id: expect.any(String),
      type: 'daily',
      periodStart: TODAY,
      periodEnd: TODAY,
      tasks: [{ id: created.body.data.id, title: 'Llamar al banco', date: TODAY }],
      createdAt: '2026-10-24T20:00:00.000Z',
    });
  });

  it('el aviso conserva la copia de una tarea completada y después borrada (RF-30)', async () => {
    const created = await call('/tasks', { method: 'POST', body: JSON.stringify({ title: 'Llamar al banco', date: TODAY }) });
    const id = created.body.data.id;
    await runAlertPassAt22();
    const night = await nightHeaders();

    await call(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ title: 'Otro', completed: true }) }, night);
    expect((await call(`/tasks/${id}`, { method: 'DELETE' }, night)).status).toBe(200);

    const { body } = await call('/alerts', {}, night);
    expect(body.data.totalItems).toBeGreaterThan(0);
    for (const alert of body.data.items) {
      expect(alert.tasks).toEqual([{ id, title: 'Llamar al banco', date: TODAY }]);
    }
  });

  it('pagina los avisos (RF-39)', async () => {
    // Sábado a las 22:00: diario del 24 y semanal recuperado del 19 al 25
    await call('/tasks', { method: 'POST', body: JSON.stringify({ title: 'Tarea', date: TODAY }) });
    await runAlertPassAt22();

    const { body } = await call('/alerts?page=2&pageSize=1', {}, await nightHeaders());
    expect(body.data).toMatchObject({ page: 2, pageSize: 1, totalItems: 2, totalPages: 2 });
    expect(body.data.items).toHaveLength(1);
  });

  it('solo devuelve los avisos de la cuenta de la sesión (RF-21 de la 002)', async () => {
    await call('/tasks', { method: 'POST', body: JSON.stringify({ title: 'Tarea', date: TODAY }) });
    await runAlertPassAt22();
    expect((await call('/alerts', {}, await nightHeaders())).body.data.totalItems).toBe(2);
    expect((await call('/alerts', {}, await nightHeaders('bea@example.com'))).body.data.totalItems).toBe(0);
  });

  it.each(['pageSize=101', 'pageSize=0', 'page=0', 'page=uno'])('?%s → 400 VALIDATION_ERROR (RF-42)', async (query) => {
    const { status, body } = await call(`/alerts?${query}`);
    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('recuerda la zona con la sesión y las cabeceras válidas, aunque la petición falle después (RF-31 de la 002, D-1)', async () => {
    expect((await call('/alerts?pageSize=101')).status).toBe(400);
    expect(container.userTimeZones.find(await userIdOf(container))).toBe('Europe/Madrid');
  });

  it('no recuerda la zona si las cabeceras no son válidas (RF-31 de la 002)', async () => {
    const headers = withSession({ timeZone: 'Mars/Olympus' });
    expect((await call('/alerts', {}, headers)).body.error?.code).toBe('INVALID_TIMEZONE');
    expect(container.userTimeZones.find(await userIdOf(container))).toBeUndefined();
  });

  it('no recuerda la zona sin sesión, aunque lleve X-User-Id (RF-31, RF-32 de la 002)', async () => {
    const userId = await userIdOf(container);
    const { body } = await call('/alerts', {}, { ...clientHeaders(), 'X-User-Id': userId });
    expect(body.error?.code).toBe('MISSING_TOKEN');
    expect(container.userTimeZones.find(userId)).toBeUndefined();
  });

  it('un usuario que nunca hizo una petición aceptada no recibe avisos (RF-36)', async () => {
    await container.tasks.create({ userId: 'nuevo', title: 'Tarea', description: null, date: LocalDate.parse(TODAY) });
    await runAlertPassAt22();
    expect(container.alerts.all()).toEqual([]);
  });

  it('sin cookie de sesión → 401 MISSING_TOKEN (RF-18 de la 002)', async () => {
    const { status, body } = await call('/alerts', {}, clientHeaders());
    expect(status).toBe(401);
    expect(body.error?.code).toBe('MISSING_TOKEN');
  });

  it('INVALID_TIMEZONE gana a una paginación no válida (RF-34 de la 002)', async () => {
    const headers = withSession({ timeZone: 'Mars/Olympus' });
    expect((await call('/alerts?pageSize=101', {}, headers)).body.error?.code).toBe('INVALID_TIMEZONE');
  });

  it('petición previa de CORS de GET /alerts → 200 (RF-36 de la 002)', async () => {
    const response = await server.request('/alerts', {
      method: 'OPTIONS',
      headers: { Origin: FRONTEND_ORIGIN, 'Access-Control-Request-Method': 'GET' },
    });
    expect(response.status).toBe(200);
  });
});
