import { Router } from 'express';

import { startTestServer, type TestServer } from '../../../../../tests/support/test.container.js';
import { createApp } from '../../../../app.factory.js';
import { allowPreflight } from '../cors.middleware.js';
import { sendSuccess } from '../response-envelope.helper.js';

const FRONTEND = 'http://localhost:5173';
const OTHER = 'https://otra-web.com';

function buildRouter(): Router {
  const router = Router();
  router.get('/things', (_req, res) => sendSuccess(res, 200, 'Operación realizada con éxito', []));
  router.post('/things', (_req, res) => sendSuccess(res, 201, 'Creado', null));
  allowPreflight(router, '/things', ['GET', 'POST']);
  return router;
}

interface Envelope {
  success: boolean;
  status: number;
  message?: string;
  data?: unknown;
  error?: { code: string };
}

describe('CORS (RF-35, RF-36)', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer(createApp({ routers: [buildRouter()], corsOrigin: FRONTEND }));
  });
  afterAll(() => server.close());

  const preflight = (path: string, origin: string | null, method: string | null) =>
    server.request(path, {
      method: 'OPTIONS',
      headers: {
        ...(origin ? { Origin: origin } : {}),
        ...(method ? { 'Access-Control-Request-Method': method } : {}),
      },
    });
  const body = async (response: Response) => (await response.json()) as Envelope;

  describe('respuestas normales', () => {
    it('al origen del frontend le permite leer la respuesta con cookies (RF-35)', async () => {
      const response = await server.request('/things', { headers: { Origin: FRONTEND } });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND);
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
      expect(response.headers.get('vary')).toMatch(/Origin/);
    });

    it('a otro origen no le da ninguna cabecera CORS (RF-35)', async () => {
      const response = await server.request('/things', { headers: { Origin: OTHER } });
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    });

    it('sin Origin (Postman, curl) responde como siempre y sin cabeceras CORS (S-06)', async () => {
      const response = await server.request('/things');
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('los errores al origen del frontend también llevan las cabeceras, para que pueda leerlos', async () => {
      const response = await server.request('/no-existe', { headers: { Origin: FRONTEND } });
      expect(response.status).toBe(404);
      expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND);
    });
  });

  describe('petición previa (RF-36)', () => {
    it('desde el frontend y a un método de la ruta → 200 con el sobre y las cabeceras permitidas', async () => {
      const response = await preflight('/things', FRONTEND, 'POST');
      expect(response.status).toBe(200);
      expect(await body(response)).toEqual({
        success: true,
        status: 200,
        message: 'Operación realizada con éxito',
        data: null,
      });
      expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND);
      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
      expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST');
      expect(response.headers.get('access-control-allow-headers')).toBe(
        'Content-Type, X-CSRF-Token, X-Client-Time, X-Timezone',
      );
      expect(response.headers.get('access-control-max-age')).toBe('600');
    });

    it('acepta el método pedido en minúsculas', async () => {
      expect((await preflight('/things', FRONTEND, 'post')).status).toBe(200);
    });

    it.each([
      ['un método que la ruta no tiene', '/things', FRONTEND, 'DELETE'],
      ['una ruta que no existe', '/no-existe', FRONTEND, 'GET'],
      ['otro origen', '/things', OTHER, 'POST'],
      ['sin Origin', '/things', null, 'POST'],
      ['sin Access-Control-Request-Method', '/things', FRONTEND, null],
    ])('%s → 404 ROUTE_NOT_FOUND con el sobre', async (_case, path, origin, method) => {
      const response = await preflight(path, origin, method);
      expect(response.status).toBe(404);
      expect((await body(response)).error?.code).toBe('ROUTE_NOT_FOUND');
    });

    it('desde otro origen no da ninguna cabecera CORS', async () => {
      const response = await preflight('/things', OTHER, 'POST');
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      expect(response.headers.get('access-control-allow-methods')).toBeNull();
    });
  });

  it('sin origen configurado (tests de otros middlewares) no añade cabeceras CORS', async () => {
    const plain = await startTestServer(createApp({ routers: [buildRouter()] }));
    try {
      const response = await plain.request('/things', { headers: { Origin: FRONTEND } });
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      expect((await plain.request('/things', { method: 'OPTIONS', headers: { Origin: FRONTEND, 'Access-Control-Request-Method': 'GET' } })).status).toBe(404);
    } finally {
      await plain.close();
    }
  });
});
