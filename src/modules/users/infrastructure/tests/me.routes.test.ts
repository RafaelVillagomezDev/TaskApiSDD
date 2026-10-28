import {
  createTestContainer,
  FRONTEND_ORIGIN,
  signIn,
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
