import {
  cookiesFrom,
  createTestContainer,
  FRONTEND_ORIGIN,
  signIn,
  startTestServer,
  TEST_PASSWORD,
  type TestContainer,
  type TestContainerOptions,
  type TestServer,
  withTurnstileToken,
} from '../../../../../tests/support/test.container.js';
import { turnstileTokenFor } from '../../../../../tests/support/fake-turnstile-verifier.adapter.js';
import { createApp } from '../../../../app.factory.js';
import type { SiteverifyOutcome } from '../../domain/turnstile-verifier.port.js';

interface Envelope {
  success: boolean;
  status: number;
  message?: string;
  data?: any;
  error?: { code: string; message: string; details?: { field: string; message: string }[] };
}

const PASSWORD = TEST_PASSWORD;
// Duraciones de las cookies en segundos (RF-07)
const ACCESS_MAX_AGE = 15 * 60;
const REFRESH_MAX_AGE = 7 * 24 * 3600;

describe('rutas de /auth', () => {
  let container: TestContainer;
  let server: TestServer;

  const call = async (path: string, init: RequestInit = {}) => {
    const response = await server.request(path, init);
    const text = await response.text();
    return { response, status: response.status, body: (text ? JSON.parse(text) : undefined) as Envelope };
  };
  const csrfToken = async () => (await call('/auth/csrf')).body.data.csrfToken as string;
  // Añaden un token de Turnstile válido y único si el cuerpo no trae `turnstileToken` (spec 005)
  const register = (body: unknown, token?: string) =>
    call('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
      body: JSON.stringify(withTurnstileToken(body, 'register')),
    });
  const login = (body: unknown, token?: string) =>
    call('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
      body: JSON.stringify(withTurnstileToken(body, 'login')),
    });
  // Recrea el contenedor y el servidor con otras opciones de Turnstile
  const restartWith = async (options: TestContainerOptions) => {
    await server.close();
    container = createTestContainer(options);
    server = await startTestServer(createApp(container));
  };
  const logout = (headers: Record<string, string>) => call('/auth/logout', { method: 'POST', headers });
  const me = (headers: Record<string, string>) => call('/me', { headers });
  // Cuenta registrada con el token previo, lista para iniciar sesión
  const registered = async (email = 'ana@example.com') => {
    const token = await csrfToken();
    await register({ email, password: PASSWORD, name: 'Ana' }, token);
    return token;
  };

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

  describe('POST /auth/login', () => {
    it('abre la sesión → 200 con { user, csrfToken } y las dos cookies con sus atributos (RF-07, RF-24, RNF-05)', async () => {
      const token = await registered();
      const { response, status, body } = await login({ email: ' ANA@example.com ', password: PASSWORD }, token);
      expect(status).toBe(200);
      expect(body).toEqual({
        success: true,
        status: 200,
        message: 'Sesión iniciada con éxito',
        data: {
          user: { id: expect.any(String), email: 'ana@example.com', name: 'Ana', createdAt: expect.stringMatching(/Z$/) },
          csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        },
      });
      const [access, refresh] = response.headers.getSetCookie();
      expect(access).toMatch(/^access_token=[A-Za-z0-9_-]{43};/);
      expect(access).toContain(`Max-Age=${ACCESS_MAX_AGE}`);
      expect(access).toContain('Path=/;');
      expect(refresh).toMatch(/^refresh_token=[A-Za-z0-9_-]{43};/);
      expect(refresh).toContain(`Max-Age=${REFRESH_MAX_AGE}`);
      expect(refresh).toContain('Path=/auth;');
      for (const cookie of [access, refresh]) {
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=Strict');
      }
    });

    it('ningún cuerpo contiene la contraseña ni los tokens de sesión (RNF-04, RNF-05)', async () => {
      const { response, body } = await login({ email: 'ana@example.com', password: PASSWORD }, await registered());
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain(PASSWORD);
      for (const pair of cookiesFrom(response).split('; ')) {
        expect(serialized).not.toContain(pair.split('=')[1]);
      }
    });

    it('contraseña errónea y email inexistente → el mismo 401 INVALID_CREDENTIALS, sin cookies (RF-08)', async () => {
      const token = await registered();
      const wrong = await login({ email: 'ana@example.com', password: 'contraseña equivocada' }, token);
      const unknown = await login({ email: 'nadie@example.com', password: PASSWORD }, token);
      expect(wrong.status).toBe(401);
      expect(wrong.body.error?.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body).toEqual(wrong.body);
      expect(wrong.response.headers.getSetCookie()).toEqual([]);
    });

    it('tras 5 fallos, el siguiente login → 429 TOO_MANY_ATTEMPTS aunque la contraseña sea correcta (RF-09)', async () => {
      const token = await registered();
      for (let attempt = 0; attempt < 5; attempt++) {
        expect((await login({ email: 'ana@example.com', password: 'contraseña equivocada' }, token)).status).toBe(401);
      }
      const { status, body } = await login({ email: 'ana@example.com', password: PASSWORD }, token);
      expect(status).toBe(429);
      expect(body.error?.code).toBe('TOO_MANY_ATTEMPTS');
    });

    describe('precedencia (RF-34)', () => {
      const lockAna = async (token: string) => {
        for (let attempt = 0; attempt < 5; attempt++) {
          await login({ email: 'ana@example.com', password: 'contraseña equivocada' }, token);
        }
      };

      it('bloqueada y con la contraseña errónea → TOO_MANY_ATTEMPTS, no INVALID_CREDENTIALS', async () => {
        const token = await registered();
        await lockAna(token);
        const { status, body } = await login({ email: 'ana@example.com', password: 'contraseña equivocada' }, token);
        expect(status).toBe(429);
        expect(body.error?.code).toBe('TOO_MANY_ATTEMPTS');
      });

      it('bloqueada y con el cuerpo no válido → VALIDATION_ERROR, que va antes', async () => {
        const token = await registered();
        await lockAna(token);
        expect((await login({ email: 'ana@example.com' }, token)).body.error?.code).toBe('VALIDATION_ERROR');
      });

      it('sin X-CSRF-Token y con el cuerpo no válido → INVALID_CSRF_TOKEN, que va antes', async () => {
        expect((await login({ email: 'no-es-un-email' })).body.error?.code).toBe('INVALID_CSRF_TOKEN');
      });
    });

    it('datos no válidos → 400 VALIDATION_ERROR con cada campo en details (RF-02, RF-04)', async () => {
      const { status, body } = await login({ email: 'no-es-un-email' }, await csrfToken());
      expect(status).toBe(400);
      expect(body.error?.details?.map((detail) => detail.field).sort()).toEqual(['email', 'password']);
    });

    it('el token previo se reutiliza: un login fallido y otro correcto con el mismo token (RF-22)', async () => {
      const token = await registered();
      container.clock.advance(60_000);
      expect((await login({ email: 'ana@example.com', password: 'contraseña equivocada' }, token)).status).toBe(401);
      container.clock.advance(60_000);
      expect((await login({ email: 'ana@example.com', password: PASSWORD }, token)).status).toBe(200);
    });

    it('sin X-CSRF-Token o con el token CSRF de una sesión → 403 INVALID_CSRF_TOKEN (RF-23)', async () => {
      await registered();
      const session = await signIn(server, 'bea@example.com');
      expect((await login({ email: 'ana@example.com', password: PASSWORD })).body.error?.code).toBe('INVALID_CSRF_TOKEN');
      const { status, body } = await login({ email: 'ana@example.com', password: PASSWORD }, session['X-CSRF-Token']);
      expect(status).toBe(403);
      expect(body.error?.code).toBe('INVALID_CSRF_TOKEN');
    });

    it('cada login abre una sesión independiente (RF-16)', async () => {
      const ana = await signIn(server);
      const otherDevice = await signIn(server);
      expect(otherDevice.Cookie).not.toBe(ana.Cookie);
      expect((await me(ana)).status).toBe(200);
      expect((await me(otherDevice)).status).toBe(200);
    });
  });

  describe('POST /auth/login con Cloudflare Turnstile (spec 005)', () => {
    const credentials = { email: 'ana@example.com', password: PASSWORD };
    const rejectedOutcome: SiteverifyOutcome = {
      kind: 'answered',
      success: false,
      hostname: null,
      action: null,
      errorCodes: ['invalid-input-response'],
    };

    it('con un token válido para el login → 200 sin cambios en la respuesta, tras una consulta (RF-03)', async () => {
      const token = await registered();
      container.turnstileVerifier.reset();
      const { status, body } = await login(credentials, token);
      expect(status).toBe(200);
      expect(Object.keys(body.data).sort()).toEqual(['csrfToken', 'user']);
      expect(container.turnstileVerifier.requests).toHaveLength(1);
    });

    it('un token rechazado → 403 TURNSTILE_FAILED con el sobre de error, sin cookies ni sesión (RF-05, RF-10)', async () => {
      const token = await registered();
      container.turnstileVerifier.rejectNext();
      const { response, status, body } = await login(credentials, token);
      expect(status).toBe(403);
      expect(body).toEqual({
        success: false,
        status: 403,
        error: { code: 'TURNSTILE_FAILED', message: 'No se ha podido verificar que eres una persona.' },
      });
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(container.sessions.count()).toBe(0);
    });

    it('el mismo cuerpo de error para cualquier motivo y exista o no el email (RF-11, RF-13)', async () => {
      const token = await registered();
      const verifier = container.turnstileVerifier;
      const reused = turnstileTokenFor('login');
      await login({ ...credentials, turnstileToken: reused }, token);

      verifier.rejectNext();
      const rejected = await login(credentials, token);
      verifier.rejectNext();
      const missingEmail = await login({ ...credentials, email: 'nadie@example.com' }, token);
      const wrongAction = await login({ ...credentials, turnstileToken: turnstileTokenFor('register') }, token);
      verifier.respondWith({ kind: 'answered', success: true, hostname: 'otra-web.com', action: 'login', errorCodes: [] });
      const wrongHost = await login(credentials, token);
      const replayed = await login({ ...credentials, turnstileToken: reused }, token);

      const bodies = [rejected, missingEmail, wrongAction, wrongHost, replayed].map((result) => JSON.stringify(result.body));
      expect(new Set(bodies).size).toBe(1);
      expect(rejected.body.error?.code).toBe('TURNSTILE_FAILED');
    });

    it('Cloudflare inaccesible en los dos intentos → 503 TURNSTILE_UNAVAILABLE con el sobre de error (RF-28)', async () => {
      const token = await registered();
      container.turnstileVerifier.respondWith({ kind: 'unreachable' }, { kind: 'http-error', status: 502 });
      const { status, body } = await login(credentials, token);
      expect(status).toBe(503);
      expect(body).toEqual({
        success: false,
        status: 503,
        error: {
          code: 'TURNSTILE_UNAVAILABLE',
          message: 'No se ha podido verificar que eres una persona; inténtalo de nuevo en unos minutos.',
        },
      });
    });

    it('un token ya usado → 403 sin consultar a Cloudflare otra vez (RF-21, RF-32)', async () => {
      const token = await registered();
      const turnstileToken = turnstileTokenFor('login');
      expect((await login({ ...credentials, turnstileToken }, token)).status).toBe(200);
      container.turnstileVerifier.reset();
      const { status, body } = await login({ ...credentials, turnstileToken }, token);
      expect(status).toBe(403);
      expect(body.error?.code).toBe('TURNSTILE_FAILED');
      expect(container.turnstileVerifier.requests).toHaveLength(0);
    });

    it('dos logins con tokens distintos → dos sesiones; cada petición se procesa de nuevo (RF-27)', async () => {
      const token = await registered();
      expect((await login(credentials, token)).status).toBe(200);
      expect((await login(credentials, token)).status).toBe(200);
      expect(container.sessions.count()).toBe(2);
    });

    it.each([
      ['sin token, en modo obligatorio (RF-17)', undefined],
      ['con un token vacío (RF-02)', ''],
      ['con un token de 2049 caracteres (RF-02)', 'x'.repeat(2049)],
      ['con un token numérico (RF-02)', 12345],
    ])('%s → 400 VALIDATION_ERROR en turnstileToken, sin consultar a Cloudflare', async (_case, turnstileToken) => {
      const token = await registered();
      container.turnstileVerifier.reset();
      const { status, body } = await login({ ...credentials, turnstileToken }, token);
      expect(status).toBe(400);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      expect(body.error?.details?.map((detail) => detail.field)).toEqual(['turnstileToken']);
      expect(container.turnstileVerifier.requests).toHaveLength(0);
    });

    describe('precedencia (RF-14)', () => {
      it('sin X-CSRF-Token y con un token rechazado → INVALID_CSRF_TOKEN, sin consultar a Cloudflare', async () => {
        await registered();
        container.turnstileVerifier.reset();
        container.turnstileVerifier.respondWith(rejectedOutcome);
        expect((await login(credentials)).body.error?.code).toBe('INVALID_CSRF_TOKEN');
        expect(container.turnstileVerifier.requests).toHaveLength(0);
      });

      it('email mal formado y token rechazado → VALIDATION_ERROR, sin consultar a Cloudflare', async () => {
        const token = await registered();
        container.turnstileVerifier.reset();
        container.turnstileVerifier.respondWith(rejectedOutcome);
        expect((await login({ ...credentials, email: 'no-es-un-email' }, token)).body.error?.code).toBe('VALIDATION_ERROR');
        expect(container.turnstileVerifier.requests).toHaveLength(0);
      });

      it('email bloqueado y token rechazado → TURNSTILE_FAILED, que va antes que TOO_MANY_ATTEMPTS', async () => {
        const token = await registered();
        for (let attempt = 0; attempt < 5; attempt++) {
          await login({ ...credentials, password: 'contraseña equivocada' }, token);
        }
        container.turnstileVerifier.rejectNext();
        expect((await login(credentials, token)).body.error?.code).toBe('TURNSTILE_FAILED');
        expect((await login(credentials, token)).body.error?.code).toBe('TOO_MANY_ATTEMPTS');
      });

      it('10 rechazos de Turnstile no bloquean el email: el dueño entra después (RF-12, CE-02)', async () => {
        const token = await registered();
        for (let attempt = 0; attempt < 10; attempt++) {
          container.turnstileVerifier.rejectNext();
          await login({ ...credentials, password: 'contraseña equivocada' }, token);
        }
        expect((await login(credentials, token)).status).toBe(200);
      });
    });

    it('con una clave secreta de prueba, el mismo token ficticio vale en dos logins seguidos (RF-33)', async () => {
      await restartWith({ turnstile: { testSecret: true } });
      const token = await registered();
      const dummy = { ...credentials, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' };
      expect((await login(dummy, token)).status).toBe(200);
      expect((await login(dummy, token)).status).toBe(200);
    });
  });

  describe('POST /auth/register con Cloudflare Turnstile (spec 005)', () => {
    const account = { email: 'ana@example.com', password: PASSWORD, name: 'Ana' };

    it('con un token válido para el registro → 201 sin cambios en la respuesta, tras una consulta (RF-04)', async () => {
      const { status, body } = await register(account, await csrfToken());
      expect(status).toBe(201);
      expect(Object.keys(body.data).sort()).toEqual(['createdAt', 'email', 'id', 'name']);
      expect(container.turnstileVerifier.requests).toHaveLength(1);
    });

    it('token rechazado y email ya registrado → 403 TURNSTILE_FAILED, no 409 (RF-13, CE-01)', async () => {
      const token = await registered();
      container.turnstileVerifier.rejectNext();
      const { status, body } = await register(account, token);
      expect(status).toBe(403);
      expect(body.error?.code).toBe('TURNSTILE_FAILED');
    });

    it('un token rechazado no crea la cuenta (RF-10, CE-01)', async () => {
      container.turnstileVerifier.rejectNext();
      expect((await register(account, await csrfToken())).status).toBe(403);
      expect(container.users.count()).toBe(0);
    });

    it('Cloudflare inaccesible → 503 TURNSTILE_UNAVAILABLE sin crear la cuenta (RF-28)', async () => {
      container.turnstileVerifier.respondWith({ kind: 'unreachable' }, { kind: 'unreachable' });
      const { status, body } = await register(account, await csrfToken());
      expect(status).toBe(503);
      expect(body.error?.code).toBe('TURNSTILE_UNAVAILABLE');
      expect(container.users.count()).toBe(0);
    });

    it('un token ya usado en un login → 403 sin consultar a Cloudflare (RF-21)', async () => {
      const token = await registered();
      const turnstileToken = turnstileTokenFor('register');
      await login({ email: 'ana@example.com', password: PASSWORD, turnstileToken }, token);
      container.turnstileVerifier.reset();
      const { status } = await register({ ...account, email: 'bea@example.com', turnstileToken }, token);
      expect(status).toBe(403);
      expect(container.turnstileVerifier.requests).toHaveLength(0);
    });

    it('dos registros simultáneos con el mismo token → una sola consulta a Cloudflare y una cuenta (RF-20, CE-04)', async () => {
      const token = await csrfToken();
      const turnstileToken = turnstileTokenFor('register');
      const results = await Promise.all([
        register({ ...account, email: 'ana@example.com', turnstileToken }, token),
        register({ ...account, email: 'bea@example.com', turnstileToken }, token),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([201, 403]);
      expect(container.turnstileVerifier.requests).toHaveLength(1);
      expect(container.users.count()).toBe(1);
    });

    it('un campo desconocido se ignora y el token se verifica igualmente', async () => {
      const { status } = await register({ ...account, rol: 'admin' }, await csrfToken());
      expect(status).toBe(201);
      expect(container.turnstileVerifier.requests).toHaveLength(1);
    });

    it('token válido y email ya registrado → 409; reintentar con un token nuevo → 409 de nuevo (RF-27, RF-32)', async () => {
      const token = await registered();
      expect((await register(account, token)).status).toBe(409);
      expect((await register(account, token)).body.error?.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it.each([
      ['sin token, en modo obligatorio (RF-17)', undefined],
      ['con un token de 2049 caracteres (RF-02)', 'x'.repeat(2049)],
    ])('%s → 400 VALIDATION_ERROR en turnstileToken, sin consultar a Cloudflare', async (_case, turnstileToken) => {
      const { status, body } = await register({ ...account, turnstileToken }, await csrfToken());
      expect(status).toBe(400);
      expect(body.error?.details?.map((detail) => detail.field)).toEqual(['turnstileToken']);
      expect(container.turnstileVerifier.requests).toHaveLength(0);
    });

    describe('precedencia (RF-14)', () => {
      it('sin X-CSRF-Token y con un token rechazado → INVALID_CSRF_TOKEN, sin consultar a Cloudflare', async () => {
        container.turnstileVerifier.rejectNext();
        expect((await register(account)).body.error?.code).toBe('INVALID_CSRF_TOKEN');
        expect(container.turnstileVerifier.requests).toHaveLength(0);
      });

      it('email mal formado y token rechazado → VALIDATION_ERROR, sin consultar a Cloudflare', async () => {
        container.turnstileVerifier.rejectNext();
        const { body } = await register({ ...account, email: 'no-es-un-email' }, await csrfToken());
        expect(body.error?.code).toBe('VALIDATION_ERROR');
        expect(container.turnstileVerifier.requests).toHaveLength(0);
      });
    });
  });

  describe('modo opcional de Turnstile, TURNSTILE_ENFORCE=false (HU-03 de la 005)', () => {
    const credentials = { email: 'ana@example.com', password: PASSWORD };
    // `turnstileToken: undefined` hace que el helper no añada token y que JSON lo omita
    const withoutToken = { turnstileToken: undefined };

    beforeEach(() => restartWith({ turnstile: { enforce: false } }));

    it('registro y login sin turnstileToken → 201 y 200, como en la 002, sin consultar a Cloudflare (RF-15)', async () => {
      const token = await csrfToken();
      expect((await register({ ...credentials, name: 'Ana', ...withoutToken }, token)).status).toBe(201);
      expect((await login({ ...credentials, ...withoutToken }, token)).status).toBe(200);
      expect(container.turnstileVerifier.requests).toHaveLength(0);
    });

    it('con un token válido → 201 y 200, tras verificarlo (RF-16)', async () => {
      const token = await csrfToken();
      expect((await register({ ...credentials, name: 'Ana' }, token)).status).toBe(201);
      expect((await login(credentials, token)).status).toBe(200);
      expect(container.turnstileVerifier.requests).toHaveLength(2);
    });

    it('con un token rechazado → 403 TURNSTILE_FAILED: no se procesa como si no hubiera token (RF-16)', async () => {
      const token = await csrfToken();
      await register({ ...credentials, name: 'Ana', ...withoutToken }, token);
      container.turnstileVerifier.rejectNext();
      const { status, body } = await login(credentials, token);
      expect(status).toBe(403);
      expect(body.error?.code).toBe('TURNSTILE_FAILED');
      container.turnstileVerifier.rejectNext();
      expect((await register({ ...credentials, email: 'bea@example.com', name: 'Bea' }, token)).status).toBe(403);
      expect(container.users.count()).toBe(1);
    });

    it('un token no válido sigue siendo VALIDATION_ERROR (RF-02)', async () => {
      const token = await csrfToken();
      const { status, body } = await login({ ...credentials, turnstileToken: '' }, token);
      expect(status).toBe(400);
      expect(body.error?.details?.map((detail) => detail.field)).toEqual(['turnstileToken']);
    });

    it('sin token y con la contraseña incorrecta → INVALID_CREDENTIALS, que sí cuenta para el bloqueo (RF-09 de la 002)', async () => {
      const token = await csrfToken();
      await register({ ...credentials, name: 'Ana', ...withoutToken }, token);
      for (let attempt = 0; attempt < 5; attempt++) {
        const { body } = await login({ ...credentials, password: 'contraseña equivocada', ...withoutToken }, token);
        expect(body.error?.code).toBe('INVALID_CREDENTIALS');
      }
      expect((await login({ ...credentials, ...withoutToken }, token)).body.error?.code).toBe('TOO_MANY_ATTEMPTS');
    });

    it('cambiar al modo obligatorio deja de aceptar peticiones sin token (RF-17, CE-03)', async () => {
      await restartWith({ turnstile: { enforce: true } });
      const token = await csrfToken();
      const { status, body } = await register({ ...credentials, name: 'Ana', ...withoutToken }, token);
      expect(status).toBe(400);
      expect(body.error?.details?.map((detail) => detail.field)).toEqual(['turnstileToken']);
    });
  });

  describe('POST /auth/logout', () => {
    it('cierra la sesión → 200 con data null y borra las cookies; después GET /me → 401 INVALID_TOKEN (RF-15, RF-19)', async () => {
      const session = await signIn(server);
      const { response, status, body } = await logout(session);
      expect(status).toBe(200);
      expect(body).toEqual({ success: true, status: 200, message: 'Sesión cerrada con éxito', data: null });
      const cleared = response.headers.getSetCookie();
      expect(cleared).toHaveLength(2);
      expect(cleared[0]).toMatch(/^access_token=;.*Path=\/;.*Expires=Thu, 01 Jan 1970/);
      expect(cleared[1]).toMatch(/^refresh_token=;.*Path=\/auth;.*Expires=Thu, 01 Jan 1970/);
      const after = await me(session);
      expect(after.status).toBe(401);
      expect(after.body.error?.code).toBe('INVALID_TOKEN');
    });

    it('solo cierra esa sesión: las demás de la cuenta siguen abiertas (RF-16)', async () => {
      const laptop = await signIn(server);
      const phone = await signIn(server);
      await logout(laptop);
      expect((await me(phone)).status).toBe(200);
    });

    it('con el token de acceso caducado y el refresh token válido → 200 y la sesión queda cerrada (RF-15)', async () => {
      const session = await signIn(server);
      container.clock.advance(16 * 60_000);
      expect((await me(session)).body.error?.code).toBe('TOKEN_EXPIRED');
      const refreshOnly = { ...session, Cookie: session.Cookie.split('; ').filter((c) => c.startsWith('refresh_token=')).join('; ') };
      expect((await logout(refreshOnly)).status).toBe(200);
      expect(container.sessions.count()).toBe(0);
    });

    it('dos veces: con las cookies borradas → MISSING_TOKEN; si el cliente las conserva → INVALID_TOKEN (RF-15, RF-19)', async () => {
      const session = await signIn(server);
      await logout(session);
      expect((await logout({ 'X-CSRF-Token': session['X-CSRF-Token'] })).body.error?.code).toBe('MISSING_TOKEN');
      const { status, body } = await logout(session);
      expect(status).toBe(401);
      expect(body.error?.code).toBe('INVALID_TOKEN');
    });

    it('sin X-CSRF-Token → 403 INVALID_CSRF_TOKEN y la sesión sigue abierta (RF-23)', async () => {
      const session = await signIn(server);
      const { status, body } = await logout({ Cookie: session.Cookie });
      expect(status).toBe(403);
      expect(body.error?.code).toBe('INVALID_CSRF_TOKEN');
      expect((await me(session)).status).toBe(200);
    });

    it('con X-CSRF-Token y sin cookies → 401 MISSING_TOKEN: sin sesión el CSRF no se juzga (decisión 19)', async () => {
      const { status, body } = await logout({ 'X-CSRF-Token': 'cualquiera' });
      expect(status).toBe(401);
      expect(body.error?.code).toBe('MISSING_TOKEN');
    });

    it('con el token CSRF de otra sesión o el previo a la sesión → 403 INVALID_CSRF_TOKEN (RF-23)', async () => {
      const ana = await signIn(server);
      const bea = await signIn(server, 'bea@example.com');
      expect((await logout({ ...ana, 'X-CSRF-Token': bea['X-CSRF-Token'] })).body.error?.code).toBe('INVALID_CSRF_TOKEN');
      const presession = await logout({ ...ana, 'X-CSRF-Token': await csrfToken() });
      expect(presession.status).toBe(403);
      expect(presession.body.error?.code).toBe('INVALID_CSRF_TOKEN');
      expect((await me(ana)).status).toBe(200);
    });
  });

  describe('POST /auth/refresh', () => {
    const refresh = (headers: Record<string, string>) => call('/auth/refresh', { method: 'POST', headers });
    // Cabeceras de la sesión con las cookies nuevas de una respuesta
    const renewed = (session: Record<string, string>, response: Response) => ({
      ...session,
      Cookie: cookiesFrom(response),
    });

    it('token de acceso caducado → TOKEN_EXPIRED → refresh → 200 y la petición vuelve a funcionar (RF-11, RF-20)', async () => {
      const session = await signIn(server);
      container.clock.advance(16 * 60_000);
      expect((await me(session)).body.error?.code).toBe('TOKEN_EXPIRED');
      const { response, status, body } = await refresh(session);
      expect(status).toBe(200);
      expect(body).toEqual({ success: true, status: 200, message: 'Sesión renovada con éxito', data: null });
      const [access, refreshCookie] = response.headers.getSetCookie();
      expect(access).toMatch(/^access_token=[A-Za-z0-9_-]{43};/);
      expect(access).toContain(`Max-Age=${ACCESS_MAX_AGE}`);
      expect(refreshCookie).toMatch(/^refresh_token=[A-Za-z0-9_-]{43};/);
      expect(refreshCookie).toContain(`Max-Age=${REFRESH_MAX_AGE}`);
      expect(refreshCookie).toContain('Path=/auth;');
      expect((await me(renewed(session, response))).status).toBe(200);
    });

    it('el token CSRF de la sesión sigue valiendo tras renovar (RF-24)', async () => {
      const session = await signIn(server);
      const { response } = await refresh(session);
      expect((await logout(renewed(session, response))).status).toBe(200);
    });

    it('dos renovaciones con el mismo refresh token y 5 s de diferencia → los mismos tokens (RF-13)', async () => {
      const session = await signIn(server);
      const first = await refresh(session);
      container.clock.advance(5_000);
      const second = await refresh(session);
      expect(second.status).toBe(200);
      expect(cookiesFrom(second.response)).toBe(cookiesFrom(first.response));
      expect((await me(renewed(session, second.response))).status).toBe(200);
    });

    it('el refresh token rotado a los 31 s → 401 INVALID_REFRESH_TOKEN, borra las cookies y cierra la sesión (RF-13, CE-04)', async () => {
      const session = await signIn(server);
      const { response: rotated } = await refresh(session);
      container.clock.advance(31_000);
      const { response, status, body } = await refresh(session);
      expect(status).toBe(401);
      expect(body.error?.code).toBe('INVALID_REFRESH_TOKEN');
      expect(response.headers.getSetCookie().every((cookie) => cookie.includes('Expires=Thu, 01 Jan 1970'))).toBe(true);
      expect(response.headers.getSetCookie()).toHaveLength(2);
      expect((await me(renewed(session, rotated))).body.error?.code).toBe('INVALID_TOKEN');
    });

    it('7 días sin renovar → 401 SESSION_EXPIRED y borra las cookies (RF-12)', async () => {
      const session = await signIn(server);
      container.clock.advance(7 * 24 * 3_600_000);
      const { response, status, body } = await refresh(session);
      expect(status).toBe(401);
      expect(body.error?.code).toBe('SESSION_EXPIRED');
      expect(response.headers.getSetCookie()).toHaveLength(2);
      expect(container.sessions.count()).toBe(0);
    });

    it('sin cookie de refresh → 401 INVALID_REFRESH_TOKEN aunque lleve X-CSRF-Token (RF-14, decisión 19)', async () => {
      const session = await signIn(server);
      const accessOnly = session.Cookie.split('; ').filter((cookie) => cookie.startsWith('access_token=')).join('; ');
      expect((await refresh({ ...session, Cookie: accessOnly })).body.error?.code).toBe('INVALID_REFRESH_TOKEN');
      const { status, body } = await refresh({ 'X-CSRF-Token': 'cualquiera' });
      expect(status).toBe(401);
      expect(body.error?.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('sin X-CSRF-Token o con el de otra sesión → 403 INVALID_CSRF_TOKEN, sin rotar ni borrar cookies (RF-23)', async () => {
      const ana = await signIn(server);
      const bea = await signIn(server, 'bea@example.com');
      const missing = await refresh({ Cookie: ana.Cookie });
      expect(missing.status).toBe(403);
      expect(missing.body.error?.code).toBe('INVALID_CSRF_TOKEN');
      const crossed = await refresh({ ...ana, 'X-CSRF-Token': bea['X-CSRF-Token'] });
      expect(crossed.body.error?.code).toBe('INVALID_CSRF_TOKEN');
      expect(crossed.response.headers.getSetCookie()).toEqual([]);
      expect((await refresh(ana)).status).toBe(200);
    });
  });

  describe('peticiones previas de CORS (RF-36)', () => {
    it.each([
      ['/auth/csrf', 'GET'],
      ['/auth/register', 'POST'],
      ['/auth/login', 'POST'],
      ['/auth/logout', 'POST'],
      ['/auth/refresh', 'POST'],
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
