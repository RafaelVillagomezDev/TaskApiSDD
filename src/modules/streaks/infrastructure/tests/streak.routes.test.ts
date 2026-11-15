import {
  clientHeaders,
  createTestContainer,
  FRONTEND_ORIGIN,
  type SessionHeaders,
  signIn,
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
  let session: SessionHeaders;

  // Cabeceras de hora y zona con la sesión de Ana (RF-17 de la 002)
  const withSession = (options = {}): Record<string, string> => ({ ...clientHeaders(options), ...session });
  const call = async (path: string, init: RequestInit = {}, headers: Record<string, string> = withSession()) => {
    const response = await server.request(path, { ...init, headers });
    return { status: response.status, body: (await response.json()) as Envelope };
  };

  beforeEach(async () => {
    server = await startTestServer(createApp(createTestContainer()));
    session = await signIn(server);
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

  it('la racha es la de la cuenta de la sesión (RF-21 de la 002)', async () => {
    const created = await call('/tasks', { method: 'POST', body: JSON.stringify({ title: 'Primera', date: TODAY }) });
    await call(`/tasks/${created.body.data.id}`, { method: 'PATCH', body: JSON.stringify({ completed: true }) });
    const bea = await signIn(server, 'bea@example.com');
    expect((await call('/streak', {}, { ...clientHeaders(), ...bea })).body.data).toEqual({ current: 0, best: 0 });
  });

  it.each([
    ['sin cookie de sesión', () => clientHeaders(), 401, 'MISSING_TOKEN'],
    ['con X-User-Id y sin cookie: la cabecera ya no identifica', () => ({ ...clientHeaders(), 'X-User-Id': 'ana' }), 401, 'MISSING_TOKEN'],
    ['con X-Client-Time no válida', () => withSession({ clientTime: 'mal' }), 400, 'INVALID_CLIENT_TIME'],
    ['con X-Timezone no válida', () => withSession({ timeZone: 'Mars/Olympus' }), 400, 'INVALID_TIMEZONE'],
  ])('%s → %i %s (RF-18, RF-30, RF-32 de la 002)', async (_case, headersOf, status, code) => {
    const response = await call('/streak', {}, headersOf());
    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ success: false, status, error: { code } });
  });

  it('sin cookie y con la hora no válida gana MISSING_TOKEN (RF-34 de la 002)', async () => {
    expect((await call('/streak', {}, clientHeaders({ clientTime: 'mal' }))).body.error?.code).toBe('MISSING_TOKEN');
  });

  it('petición previa de CORS de GET /streak → 200 (RF-36 de la 002)', async () => {
    const response = await server.request('/streak', {
      method: 'OPTIONS',
      headers: { Origin: FRONTEND_ORIGIN, 'Access-Control-Request-Method': 'GET' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET');
  });
});
