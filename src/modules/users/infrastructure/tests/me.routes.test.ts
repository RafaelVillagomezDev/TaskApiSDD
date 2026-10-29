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
  // GET /me devuelve { user, csrfToken } (RF-01 de la 003): la cuenta va en data.user
  const userOf = async (cookie: string) => ((await me({ Cookie: cookie })).body.data as { user: unknown }).user;

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
  const deleteMe = async (body: unknown, headers: Record<string, string>) => {
    const response = await server.request('/me', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    return { response, status: response.status, body: (await response.json()) as Envelope };
  };
  const NEW_PASSWORD = 'otra frase bastante larga';
  const WRONG = 'contraseña equivocada';

  beforeEach(async () => {
    container = createTestContainer();
    server = await startTestServer(createApp(container));
  });
  afterEach(() => server.close());

  describe('GET /me', () => {
    it('con sesión → 200 con data { user, csrfToken }: la cuenta y el mismo token CSRF del login (RF-01, RF-02 de la 003)', async () => {
      const session = await signIn(server);
      const { status, body } = await me({ Cookie: session.Cookie });
      expect(status).toBe(200);
      expect(body).toEqual({
        success: true,
        status: 200,
        message: 'Operación realizada con éxito',
        data: {
          user: { id: expect.any(String), email: 'ana@example.com', name: 'Ana', createdAt: expect.stringMatching(/Z$/) },
          csrfToken: session['X-CSRF-Token'],
        },
      });
      const data = body.data as { user: object };
      expect(Object.keys(data).sort()).toEqual(['csrfToken', 'user']);
      expect(Object.keys(data.user).sort()).toEqual(['createdAt', 'email', 'id', 'name']);
    });

    it('la respuesta no se puede guardar en caché, tampoco la de error (RNF-03 de la 003)', async () => {
      const ok = await me({ Cookie: (await signIn(server)).Cookie });
      expect(ok.response.headers.get('cache-control')).toBe('no-store');
      const missing = await me();
      expect(missing.body.error?.code).toBe('MISSING_TOKEN');
      expect(missing.response.headers.get('cache-control')).toBe('no-store');
    });

    it('ningún token de acceso ni de refresco en el cuerpo (RNF-02 de la 003, CE-02)', async () => {
      const session = await signIn(server);
      const text = JSON.stringify((await me({ Cookie: session.Cookie })).body);
      for (const pair of session.Cookie.split('; ')) {
        expect(text).not.toContain(pair.split('=')[1]);
      }
    });

    it('tras POST /auth/refresh devuelve el mismo csrfToken (RF-02 de la 003, RF-24 de la 002)', async () => {
      const session = await signIn(server);
      const renewed = await server.request('/auth/refresh', { method: 'POST', headers: session });
      const cookie = renewed.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      expect(((await me({ Cookie: cookie })).body.data as { csrfToken: string }).csrfToken).toBe(session['X-CSRF-Token']);
    });

    it('dos sesiones de la misma cuenta → tokens distintos; el de una responde INVALID_CSRF_TOKEN en la otra (RF-01)', async () => {
      const laptop = await signIn(server);
      const phone = await signIn(server);
      const tokenOf = async (cookie: string) => ((await me({ Cookie: cookie })).body.data as { csrfToken: string }).csrfToken;
      const laptopToken = await tokenOf(laptop.Cookie);
      expect(laptopToken).not.toBe(await tokenOf(phone.Cookie));
      const crossed = await patchMe({ name: 'Otra' }, { Cookie: phone.Cookie, 'X-CSRF-Token': laptopToken });
      expect(crossed.body.error?.code).toBe('INVALID_CSRF_TOKEN');
    });

    it('CE-01: solo con las cookies, GET /me y POST /tasks con su csrfToken → 201', async () => {
      const { Cookie } = await signIn(server);
      const { csrfToken } = (await me({ Cookie })).body.data as { csrfToken: string };
      const created = await server.request('/tasks', {
        method: 'POST',
        headers: { ...clientHeaders(), Cookie, 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ title: 'Tras recargar', date: '2026-10-24' }),
      });
      expect(created.status).toBe(201);
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

    it('con un token inventado → 401 INVALID_TOKEN, sin token CSRF (RF-19)', async () => {
      const { status, body } = await me({ Cookie: 'access_token=inventado' });
      expect(status).toBe(401);
      expect(body.error?.code).toBe('INVALID_TOKEN');
      expect(body.data).toBeUndefined();
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
      expect(await userOf(bea.Cookie)).toMatchObject({ email: 'bea@example.com' });
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
      expect(await userOf(session.Cookie)).toMatchObject({ name: 'Ana García' });
      expect(body.data).not.toHaveProperty('csrfToken');
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
      expect(await userOf(session.Cookie)).toMatchObject({ email: 'ana@example.com', name: 'Ana' });
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
      expect(await userOf(session.Cookie)).toMatchObject({ name: 'Ana' });
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
      expect(await userOf(ana.Cookie)).toMatchObject({ email: 'ana@example.com', name: 'Ana' });
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

  describe('DELETE /me', () => {
    it('borra la cuenta → 200 con data null y las cookies borradas; su sesión deja de servir (RF-29, HU-07)', async () => {
      const session = await signIn(server);
      const { response, status, body } = await deleteMe({ password: TEST_PASSWORD }, session);
      expect(status).toBe(200);
      expect(body).toEqual({ success: true, status: 200, message: 'Cuenta eliminada con éxito', data: null });
      const cleared = response.headers.getSetCookie();
      expect(cleared).toHaveLength(2);
      expect(cleared.every((cookie) => cookie.includes('Expires=Thu, 01 Jan 1970'))).toBe(true);
      expect(container.users.count()).toBe(0);
      expect((await me({ Cookie: session.Cookie })).body.error?.code).toBe('INVALID_TOKEN');
    });

    it('después, el login con ese email → INVALID_CREDENTIALS (RF-29, RF-08)', async () => {
      await deleteMe({ password: TEST_PASSWORD }, await signIn(server));
      const { status, body } = await login(TEST_PASSWORD);
      expect(status).toBe(401);
      expect(body.error?.code).toBe('INVALID_CREDENTIALS');
    });

    it('volver a registrarse con el mismo email → 201, como una cuenta nueva sin datos (RF-29, RF-01)', async () => {
      const first = await signIn(server);
      const created = await server.request('/tasks', {
        method: 'POST',
        headers: { ...clientHeaders(), ...first },
        body: JSON.stringify({ title: 'Tarea de la cuenta borrada', date: '2026-10-24' }),
      });
      expect(created.status).toBe(201);
      await deleteMe({ password: TEST_PASSWORD }, first);
      const again = await signIn(server);
      const tasks = await server.request('/tasks', { headers: { ...clientHeaders(), ...again } });
      expect(((await tasks.json()) as { data: { items: unknown[] } }).data.items).toEqual([]);
      expect(container.users.count()).toBe(1);
    });

    it('con la contraseña errónea → 403 WRONG_PASSWORD y la cuenta sigue (RF-28)', async () => {
      const session = await signIn(server);
      const { status, body } = await deleteMe({ password: WRONG }, session);
      expect(status).toBe(403);
      expect(body.error?.code).toBe('WRONG_PASSWORD');
      expect((await me({ Cookie: session.Cookie })).status).toBe(200);
      expect((await login(TEST_PASSWORD)).status).toBe(200);
    });

    it('con la cuenta bloqueada → 429 TOO_MANY_ATTEMPTS aunque la contraseña sea correcta (RF-09)', async () => {
      const session = await signIn(server);
      for (let attempt = 0; attempt < 5; attempt++) await login(WRONG);
      const { status, body } = await deleteMe({ password: TEST_PASSWORD }, session);
      expect(status).toBe(429);
      expect(body.error?.code).toBe('TOO_MANY_ATTEMPTS');
      expect(container.users.count()).toBe(1);
    });

    it('sin password → 400 VALIDATION_ERROR (RF-28)', async () => {
      expect((await deleteMe({}, await signIn(server))).body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('sin X-CSRF-Token → 403 INVALID_CSRF_TOKEN y la cuenta sigue (RF-23)', async () => {
      const session = await signIn(server);
      const { status, body } = await deleteMe({ password: TEST_PASSWORD }, { Cookie: session.Cookie });
      expect(status).toBe(403);
      expect(body.error?.code).toBe('INVALID_CSRF_TOKEN');
      expect(container.users.count()).toBe(1);
    });

    it('sin cookie de sesión → 401 MISSING_TOKEN (RF-18)', async () => {
      expect((await deleteMe({ password: TEST_PASSWORD }, { 'X-CSRF-Token': 'cualquiera' })).body.error?.code).toBe(
        'MISSING_TOKEN',
      );
    });

    it('solo borra la cuenta de la sesión (RF-21)', async () => {
      const ana = await signIn(server);
      const bea = await signIn(server, 'bea@example.com');
      await deleteMe({ password: TEST_PASSWORD }, ana);
      expect(await userOf(bea.Cookie)).toMatchObject({ email: 'bea@example.com' });
    });
  });

  it.each([
    ['GET'],
    ['PATCH'],
    ['DELETE'],
  ])('petición previa de CORS de %s /me → 200 con GET, PATCH y DELETE (RF-36)', async (method) => {
    const response = await server.request('/me', {
      method: 'OPTIONS',
      headers: { Origin: FRONTEND_ORIGIN, 'Access-Control-Request-Method': method },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, PATCH, DELETE');
  });
});
