import {
  createTestContainer,
  FRONTEND_ORIGIN,
  startTestServer,
  type TestContainer,
  type TestServer,
} from '../../../../../tests/support/test.container.js';
import { createApp } from '../../../../app.factory.js';

interface Envelope {
  success: boolean;
  status: number;
  message?: string;
  data?: any;
  error?: { code: string; message: string; details?: { field: string; message: string }[] };
}

const PASSWORD = 'correct horse battery';

describe('rutas de /auth', () => {
  let container: TestContainer;
  let server: TestServer;

  const call = async (path: string, init: RequestInit = {}) => {
    const response = await server.request(path, init);
    const text = await response.text();
    return { response, status: response.status, body: (text ? JSON.parse(text) : undefined) as Envelope };
  };
  const csrfToken = async () => (await call('/auth/csrf')).body.data.csrfToken as string;
  const register = (body: unknown, token?: string) =>
    call('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
      body: JSON.stringify(body),
    });

  beforeEach(async () => {
    container = createTestContainer();
    server = await startTestServer(createApp(container));
  });
  afterEach(() => server.close());

  describe('GET /auth/csrf', () => {
    it('devuelve un token CSRF previo a la sesión, sin cookies ni cabeceras de hora (RF-22, RF-30)', async () => {
      const { response, status, body } = await call('/auth/csrf');
      expect(status).toBe(200);
      expect(body).toMatchObject({ success: true, status: 200, message: 'Operación realizada con éxito' });
      expect(body.data.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(response.headers.getSetCookie()).toEqual([]);
    });
  });

  describe('POST /auth/register', () => {
    it('crea la cuenta → 201 con el recurso User, sin abrir sesión ni devolver la contraseña (RF-01, RF-06, RNF-04)', async () => {
      const { response, status, body } = await register(
        { email: '  Ana@Example.COM ', password: PASSWORD, name: '  Ana  ' },
        await csrfToken(),
      );
      expect(status).toBe(201);
      expect(body).toEqual({
        success: true,
        status: 201,
        message: 'Cuenta creada con éxito',
        data: { id: expect.stringMatching(/^[0-9a-f-]{36}$/), email: 'ana@example.com', name: 'Ana', createdAt: expect.stringMatching(/Z$/) },
      });
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(JSON.stringify(body)).not.toContain(PASSWORD);
    });

    it('un email ya registrado, aunque cambien las mayúsculas → 409 EMAIL_ALREADY_REGISTERED (RF-03)', async () => {
      const token = await csrfToken();
      await register({ email: 'ana@example.com', password: PASSWORD }, token);
      const { status, body } = await register({ email: 'ANA@example.com', password: PASSWORD }, token);
      expect(status).toBe(409);
      expect(body.error?.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('datos no válidos → 400 VALIDATION_ERROR con cada campo en details (RF-02, RF-04)', async () => {
      const { status, body } = await register({ email: 'no-es-un-email', password: 'corta' }, await csrfToken());
      expect(status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      expect(body.error?.details?.map((detail) => detail.field).sort()).toEqual(['email', 'password']);
    });

    it('sin X-CSRF-Token → 403 INVALID_CSRF_TOKEN, también con el cuerpo no válido (RF-23, RF-34)', async () => {
      const { status, body } = await register({ email: 'no-es-un-email' });
      expect(status).toBe(403);
      expect(body.error?.code).toBe('INVALID_CSRF_TOKEN');
      expect(container.users.count()).toBe(0);
    });

    it('con un token inventado → 403 INVALID_CSRF_TOKEN (RF-23)', async () => {
      expect((await register({ email: 'ana@example.com', password: PASSWORD }, 'inventado')).body.error?.code).toBe(
        'INVALID_CSRF_TOKEN',
      );
    });

    it('el token previo vale 30 minutos y se puede reutilizar dentro de ese tiempo (RF-22)', async () => {
      const token = await csrfToken();
      container.clock.advance(60_000);
      expect((await register({ email: 'ana@example.com', password: PASSWORD }, token)).status).toBe(201);
      container.clock.advance(28 * 60_000);
      expect((await register({ email: 'bea@example.com', password: PASSWORD }, token)).status).toBe(201);
      container.clock.advance(60_000);
      const { status, body } = await register({ email: 'cris@example.com', password: PASSWORD }, token);
      expect(status).toBe(403);
      expect(body.error?.code).toBe('INVALID_CSRF_TOKEN');
    });

    it('no pide X-Client-Time ni X-Timezone (RF-30)', async () => {
      expect((await register({ email: 'ana@example.com', password: PASSWORD }, await csrfToken())).status).toBe(201);
    });
  });

  describe('peticiones previas de CORS (RF-36)', () => {
    it.each([
      ['/auth/csrf', 'GET'],
      ['/auth/register', 'POST'],
    ])('OPTIONS %s desde el frontend pidiendo %s → 200', async (path, method) => {
      const { response, status } = await call(path, {
        method: 'OPTIONS',
        headers: { Origin: FRONTEND_ORIGIN, 'Access-Control-Request-Method': method },
      });
      expect(status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN);
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    });
  });
});
