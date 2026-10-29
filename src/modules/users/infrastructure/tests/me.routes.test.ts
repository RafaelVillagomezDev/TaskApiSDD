import {
  clientHeaders,
  createTestContainer,
  FRONTEND_ORIGIN,
  signIn,
  TEST_PASSWORD,
  startTestServer,
  type TestContainer,
  type TestServer,
} from '../../../../../tests/support/test.container.js';
import { createApp } from '../../../../app.factory.js';

interface Envelope {
  success: boolean;
  status: number;
  message?: string;
  data?: unknown;
  error?: { code: string; message: string; details?: { field: string; message: string }[] };
}

describe('rutas de /me', () => {
  let container: TestContainer;
  let server: TestServer;

  const me = async (headers: Record<string, string> = {}) => {
    const response = await server.request('/me', { headers });
    return { response, status: response.status, body: (await response.json()) as Envelope };
  };

  const patchMe = async (body: unknown, headers: Record<string, string>) => {
    const response = await server.request('/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { response, status: response.status, body: (await response.json()) as Envelope };
  };

  const changePassword = async (body: unknown, headers: Record<string, string>) => {
    const response = await server.request('/me/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    return { response, status: response.status, body: (await response.json()) as Envelope };
  };
  // Login directo con el token previo, para comprobar qué contraseña vale
  const login = async (password: string, email = 'ana@example.com') => {
    const presession = (await (await server.request('/auth/csrf')).json()) as { data: { csrfToken: string } };
    const response = await server.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': presession.data.csrfToken },
      body: JSON.stringify({ email, password }),
    });
    return { status: response.status, body: (await response.json()) as Envelope };
  };
  const NEW_PASSWORD = 'otra frase bastante larga';
  const WRONG = 'contraseña equivocada';

  beforeEach(async () => {
    container = createTestContainer();
    server = await startTestServer(createApp(container));
  });
  afterEach(() => server.close());

  describe('GET /me', () => {
    it('con sesión → 200 con el recurso User, sin la contraseña (RF-25, RNF-04)', async () => {
      const { status, body } = await me({ Cookie: (await signIn(server)).Cookie });
      expect(status).toBe(200);
      expect(body).toEqual({
        success: true,
        status: 200,
        message: 'Operación realizada con éxito',
        data: { id: expect.any(String), email: 'ana@example.com', name: 'Ana', createdAt: expect.stringMatching(/Z$/) },
      });
      expect(Object.keys(body.data as object).sort()).toEqual(['createdAt', 'email', 'id', 'name']);
    });

    it('no pide X-Client-Time, X-Timezone ni X-CSRF-Token (RF-23, RF-30)', async () => {
      const { Cookie } = await signIn(server);
      expect((await me({ Cookie })).status).toBe(200);
    });

    it('sin cookie → 401 MISSING_TOKEN, aunque lleve X-User-Id (RF-18, RF-32)', async () => {
      const { status, body } = await me({ 'X-User-Id': 'ana' });
      expect(status).toBe(401);
      expect(body.error?.code).toBe('MISSING_TOKEN');
    });

    it('con un token inventado → 401 INVALID_TOKEN (RF-19)', async () => {
      const { status, body } = await me({ Cookie: 'access_token=inventado' });
      expect(status).toBe(401);
      expect(body.error?.code).toBe('INVALID_TOKEN');
    });

    it('con el token caducado a los 15 minutos → 401 TOKEN_EXPIRED (RF-20)', async () => {
      const { Cookie } = await signIn(server);
      container.clock.advance(15 * 60_000);
      const { status, body } = await me({ Cookie });
      expect(status).toBe(401);
      expect(body.error?.code).toBe('TOKEN_EXPIRED');
    });

    it('cada sesión ve solo su cuenta (RF-21)', async () => {
      await signIn(server);
      const bea = await signIn(server, 'bea@example.com');
      expect((await me({ Cookie: bea.Cookie })).body.data).toMatchObject({ email: 'bea@example.com' });
    });
  });

  describe('PATCH /me', () => {
    it('cambia el nombre recortado → 200 con el recurso User; GET /me lo devuelve (RF-05, RF-26, HU-05)', async () => {
      const session = await signIn(server);
      const { status, body } = await patchMe({ name: '  Ana García  ' }, session);
      expect(status).toBe(200);
      expect(body).toEqual({
        success: true,
        status: 200,
        message: 'Perfil actualizado con éxito',
        data: { id: expect.any(String), email: 'ana@example.com', name: 'Ana García', createdAt: expect.stringMatching(/Z$/) },
      });
      expect((await me({ Cookie: session.Cookie })).body.data).toMatchObject({ name: 'Ana García' });
    });

    it.each([['   '], [null]])('nombre %p → 200 con name null (RF-05)', async (name) => {
      const { status, body } = await patchMe({ name }, await signIn(server));
      expect(status).toBe(200);
      expect(body.data).toMatchObject({ name: null });
    });

    it('con email → 400 VALIDATION_ERROR y la cuenta no cambia (RF-26)', async () => {
      const session = await signIn(server);
      const { status, body } = await patchMe({ name: 'Otra', email: 'otro@example.com' }, session);
      expect(status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      expect(body.error?.details?.length).toBeGreaterThan(0);
      expect((await me({ Cookie: session.Cookie })).body.data).toMatchObject({ email: 'ana@example.com', name: 'Ana' });
    });

    it.each([
      ['sin name', {}],
      ['con un nombre de 101 caracteres', { name: 'n'.repeat(101) }],
      ['con un JSON mal formado', '{"name": '],
    ])('%s → 400 VALIDATION_ERROR (RF-05)', async (_case, body) => {
      expect((await patchMe(body, await signIn(server))).body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('sin X-CSRF-Token → 403 INVALID_CSRF_TOKEN y el nombre no cambia (RF-23)', async () => {
      const session = await signIn(server);
      const { status, body } = await patchMe({ name: 'Otra' }, { Cookie: session.Cookie });
      expect(status).toBe(403);
      expect(body.error?.code).toBe('INVALID_CSRF_TOKEN');
      expect((await me({ Cookie: session.Cookie })).body.data).toMatchObject({ name: 'Ana' });
    });

    it('sin cookie de sesión → 401 MISSING_TOKEN (RF-18)', async () => {
      const { status, body } = await patchMe({ name: 'Otra' }, { 'X-CSRF-Token': 'cualquiera' });
      expect(status).toBe(401);
      expect(body.error?.code).toBe('MISSING_TOKEN');
    });

    it('con email y el token de acceso caducado gana TOKEN_EXPIRED (RF-34)', async () => {
      const session = await signIn(server);
      container.clock.advance(16 * 60_000);
      expect((await patchMe({ email: 'otro@example.com' }, session)).body.error?.code).toBe('TOKEN_EXPIRED');
    });

    it('solo cambia la cuenta de la sesión (RF-21)', async () => {
      const ana = await signIn(server);
      const bea = await signIn(server, 'bea@example.com');
      await patchMe({ name: 'Bea' }, bea);
      expect((await me({ Cookie: ana.Cookie })).body.data).toMatchObject({ email: 'ana@example.com', name: 'Ana' });
    });
  });

  describe('PATCH /me/password', () => {
    it('cambia la contraseña → 200 con data null; la otra sesión se cierra y la actual sigue (RF-27, HU-06)', async () => {
      const laptop = await signIn(server);
      const phone = await signIn(server);
      const { status, body } = await changePassword({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }, phone);
      expect(status).toBe(200);
      expect(body).toEqual({ success: true, status: 200, message: 'Contraseña cambiada con éxito', data: null });
      expect((await me({ Cookie: phone.Cookie })).status).toBe(200);
      expect((await me({ Cookie: laptop.Cookie })).body.error?.code).toBe('INVALID_TOKEN');
      const refresh = await server.request('/auth/refresh', { method: 'POST', headers: laptop });
      expect(((await refresh.json()) as Envelope).error?.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('después, el login con la anterior → INVALID_CREDENTIALS y con la nueva → 200 (RF-27, HU-06)', async () => {
      await changePassword({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }, await signIn(server));
      expect((await login(TEST_PASSWORD)).body.error?.code).toBe('INVALID_CREDENTIALS');
      expect((await login(NEW_PASSWORD)).status).toBe(200);
    });

    it('con la contraseña actual errónea → 403 WRONG_PASSWORD y no cambia nada (RF-28)', async () => {
      const laptop = await signIn(server);
      const phone = await signIn(server);
      const { status, body } = await changePassword({ currentPassword: WRONG, newPassword: NEW_PASSWORD }, phone);
      expect(status).toBe(403);
      expect(body.error?.code).toBe('WRONG_PASSWORD');
      expect((await me({ Cookie: laptop.Cookie })).status).toBe(200);
      expect((await login(TEST_PASSWORD)).status).toBe(200);
    });

    it('3 logins fallidos y 2 contraseñas actuales erróneas bloquean; la sesión abierta sigue en /tasks (RF-09)', async () => {
      const session = await signIn(server);
      for (let attempt = 0; attempt < 3; attempt++) {
        expect((await login(WRONG)).body.error?.code).toBe('INVALID_CREDENTIALS');
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        expect((await changePassword({ currentPassword: WRONG, newPassword: NEW_PASSWORD }, session)).status).toBe(403);
      }
      const locked = await changePassword({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }, session);
      expect(locked.status).toBe(429);
      expect(locked.body.error?.code).toBe('TOO_MANY_ATTEMPTS');
      expect((await login(TEST_PASSWORD)).body.error?.code).toBe('TOO_MANY_ATTEMPTS');
      const tasks = await server.request('/tasks', { headers: { ...clientHeaders(), ...session } });
      expect(tasks.status).toBe(200);
      expect((await me({ Cookie: session.Cookie })).status).toBe(200);
    });

    it.each([
      ['una nueva de 11 caracteres', { currentPassword: TEST_PASSWORD, newPassword: 'a'.repeat(11) }],
      ['sin la contraseña actual', { newPassword: NEW_PASSWORD }],
    ])('con %s → 400 VALIDATION_ERROR (RF-04)', async (_case, input) => {
      const { status, body } = await changePassword(input, await signIn(server));
      expect(status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('bloqueada y sin newPassword gana VALIDATION_ERROR (RF-34)', async () => {
      const session = await signIn(server);
      for (let attempt = 0; attempt < 5; attempt++) await login(WRONG);
      expect((await changePassword({ currentPassword: TEST_PASSWORD }, session)).body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('sin X-CSRF-Token → 403 INVALID_CSRF_TOKEN y la contraseña no cambia (RF-23)', async () => {
      const session = await signIn(server);
      const { status, body } = await changePassword(
        { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD },
        { Cookie: session.Cookie },
      );
      expect(status).toBe(403);
      expect(body.error?.code).toBe('INVALID_CSRF_TOKEN');
      expect((await login(TEST_PASSWORD)).status).toBe(200);
    });

    it('sin cookie de sesión → 401 MISSING_TOKEN (RF-18)', async () => {
      const { status, body } = await changePassword(
        { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD },
        { 'X-CSRF-Token': 'cualquiera' },
      );
      expect(status).toBe(401);
      expect(body.error?.code).toBe('MISSING_TOKEN');
    });

    it('petición previa de CORS de PATCH /me/password → 200 (RF-36)', async () => {
      const response = await server.request('/me/password', {
        method: 'OPTIONS',
        headers: { Origin: FRONTEND_ORIGIN, 'Access-Control-Request-Method': 'PATCH' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-methods')).toBe('PATCH');
    });
  });

  it.each([
    ['GET'],
    ['PATCH'],
  ])('petición previa de CORS de %s /me → 200 con GET y PATCH (RF-36)', async (method) => {
    const response = await server.request('/me', {
      method: 'OPTIONS',
      headers: { Origin: FRONTEND_ORIGIN, 'Access-Control-Request-Method': method },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, PATCH');
  });
});
