import {
  clientHeaders,
  createTestContainer,
  startTestServer,
  type TestServer,
} from '../../../../../tests/support/test.container.js';
import { createApp } from '../../../../app.factory.js';

interface Envelope {
  success: boolean;
  status: number;
  message?: string;
  data?: any;
  error?: { code: string };
}

// Reloj de los tests: hoy es 2026-10-24 en Madrid
const TODAY = '2026-10-24';

describe('GET /streak', () => {
  let server: TestServer;

  const call = async (path: string, init: RequestInit = {}, headers = clientHeaders()) => {
    const response = await server.request(path, { ...init, headers });
    return { status: response.status, body: (await response.json()) as Envelope };
  };

  beforeEach(async () => {
    server = await startTestServer(createApp(createTestContainer()));
  });
  afterEach(() => server.close());

  it('usuario nuevo → 200 con { current: 0, best: 0 } en el sobre', async () => {
    const { status, body } = await call('/streak');
    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      status: 200,
      message: 'Operación realizada con éxito',
      data: { current: 0, best: 0 },
    });
  });

  it('CE-01: crear y completar una tarea de hoy deja la racha en 1 con 3 peticiones', async () => {
    const created = await call('/tasks', { method: 'POST', body: JSON.stringify({ title: 'Primera', date: TODAY }) });
    await call(`/tasks/${created.body.data.id}`, { method: 'PATCH', body: JSON.stringify({ completed: true }) });
    const { body } = await call('/streak');
    expect(body.data).toEqual({ current: 1, best: 1 });
  });

  it('desmarcar la única tarea completada de hoy vuelve la racha a 0 (RF-20)', async () => {
    const created = await call('/tasks', { method: 'POST', body: JSON.stringify({ title: 'Primera', date: TODAY }) });
    const path = `/tasks/${created.body.data.id}`;
    await call(path, { method: 'PATCH', body: JSON.stringify({ completed: true }) });
    await call(path, { method: 'PATCH', body: JSON.stringify({ completed: false }) });
    expect((await call('/streak')).body.data).toEqual({ current: 0, best: 0 });
  });

  it.each([
    ['sin X-User-Id', { userId: '' }, 401, 'MISSING_USER'],
    ['con X-Client-Time no válida', { clientTime: 'mal' }, 400, 'INVALID_CLIENT_TIME'],
    ['con X-Timezone no válida', { timeZone: 'Mars/Olympus' }, 400, 'INVALID_TIMEZONE'],
  ])('%s → %i %s (RF-01, RF-31 a RF-33)', async (_case, options, status, code) => {
    const response = await call('/streak', {}, clientHeaders(options));
    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ success: false, status, error: { code } });
  });
});
