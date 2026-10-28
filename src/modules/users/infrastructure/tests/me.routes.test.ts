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
  error?: { code: string; message: string };
}

describe('rutas de /me', () => {
  let container: TestContainer;
  let server: TestServer;

  const me = async (headers: Record<string, string> = {}) => {
    const response = await server.request('/me', { headers });
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

  it('petición previa de CORS de GET /me → 200 (RF-36)', async () => {
    const response = await server.request('/me', {
      method: 'OPTIONS',
      headers: { Origin: FRONTEND_ORIGIN, 'Access-Control-Request-Method': 'GET' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET');
  });
});
