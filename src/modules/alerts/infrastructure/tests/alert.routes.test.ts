import {
  clientHeaders,
  createTestContainer,
  startTestServer,
  type TestContainer,
  type TestServer,
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

  const call = async (path: string, init: RequestInit = {}, headers = clientHeaders()) => {
    const response = await server.request(path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : undefined) as Envelope };
  };

  // Lleva el reloj a las 22:00 en Madrid y ejecuta una pasada del planificador
  const runAlertPassAt22 = async () => {
    container.clock.set('2026-10-24T20:00:00Z');
    await container.generateAlerts.execute();
  };
  const nightHeaders = (userId = 'user-1') => clientHeaders({ userId, clientTime: '2026-10-24T22:00:00+02:00' });

  beforeEach(async () => {
    container = createTestContainer();
    server = await startTestServer(createApp(container));
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

    const { status, body } = await call('/alerts', {}, nightHeaders());

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

    await call(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ title: 'Otro', completed: true }) }, nightHeaders());
    expect((await call(`/tasks/${id}`, { method: 'DELETE' }, nightHeaders())).status).toBe(200);

    const { body } = await call('/alerts', {}, nightHeaders());
    expect(body.data.totalItems).toBeGreaterThan(0);
    for (const alert of body.data.items) {
      expect(alert.tasks).toEqual([{ id, title: 'Llamar al banco', date: TODAY }]);
    }
  });

  it('pagina los avisos (RF-39)', async () => {
    // Sábado a las 22:00: diario del 24 y semanal recuperado del 19 al 25
    await call('/tasks', { method: 'POST', body: JSON.stringify({ title: 'Tarea', date: TODAY }) });
    await runAlertPassAt22();

    const { body } = await call('/alerts?page=2&pageSize=1', {}, nightHeaders());
    expect(body.data).toMatchObject({ page: 2, pageSize: 1, totalItems: 2, totalPages: 2 });
    expect(body.data.items).toHaveLength(1);
  });

  it('solo devuelve los avisos del usuario (RF-02)', async () => {
    await call('/tasks', { method: 'POST', body: JSON.stringify({ title: 'Tarea', date: TODAY }) });
    await runAlertPassAt22();
    expect((await call('/alerts', {}, nightHeaders('user-2'))).body.data.totalItems).toBe(0);
  });

  it.each(['pageSize=101', 'pageSize=0', 'page=0', 'page=uno'])('?%s → 400 VALIDATION_ERROR (RF-42)', async (query) => {
    const { status, body } = await call(`/alerts?${query}`);
    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('recuerda la zona en cuanto las cabeceras son válidas, aunque la petición falle después (RF-34, D-1)', async () => {
    expect((await call('/alerts?pageSize=101')).status).toBe(400);
    expect(container.userTimeZones.find('user-1')).toBe('Europe/Madrid');
  });

  it('no recuerda la zona si las cabeceras no son válidas (RF-34)', async () => {
    const headers = clientHeaders({ timeZone: 'Mars/Olympus' });
    expect((await call('/alerts', {}, headers)).body.error?.code).toBe('INVALID_TIMEZONE');
    expect(container.userTimeZones.find('user-1')).toBeUndefined();
  });

  it('un usuario que nunca hizo una petición aceptada no recibe avisos (RF-36)', async () => {
    await container.tasks.create({ userId: 'nuevo', title: 'Tarea', description: null, date: LocalDate.parse(TODAY) });
    await runAlertPassAt22();
    expect(container.alerts.all()).toEqual([]);
  });

  it('sin X-User-Id → 401 MISSING_USER', async () => {
    const { 'X-User-Id': _omitted, ...headers } = clientHeaders();
    const { status, body } = await call('/alerts', {}, headers);
    expect(status).toBe(401);
    expect(body.error?.code).toBe('MISSING_USER');
  });

  it('INVALID_TIMEZONE gana a una paginación no válida (RF-46)', async () => {
    const headers = clientHeaders({ timeZone: 'Mars/Olympus' });
    expect((await call('/alerts?pageSize=101', {}, headers)).body.error?.code).toBe('INVALID_TIMEZONE');
  });
});
