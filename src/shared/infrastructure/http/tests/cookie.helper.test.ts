import { Router } from 'express';

import { startTestServer, type TestServer } from '../../../../../tests/support/test.container.js';
import { createApp } from '../../../../app.factory.js';
import {
  ACCESS_TOKEN_COOKIE,
  clearSessionCookies,
  readCookie,
  REFRESH_TOKEN_COOKIE,
  setSessionCookies,
} from '../cookie.helper.js';
import { sendSuccess } from '../response-envelope.helper.js';

const NOW = new Date('2026-10-28T10:00:00Z');

function buildRouter(): Router {
  const router = Router();
  router.get('/read/:name', (req, res) => {
    sendSuccess(res, 200, 'ok', { value: readCookie(req, req.params.name) ?? null });
  });
  router.get('/set', (_req, res) => {
    setSessionCookies(res, {
      accessToken: 'acceso',
      refreshToken: 'refresco',
      accessExpiresAt: new Date(NOW.getTime() + 15 * 60_000),
      refreshExpiresAt: new Date(NOW.getTime() + 7 * 24 * 3_600_000),
      now: NOW,
    });
    sendSuccess(res, 200, 'ok', null);
  });
  router.get('/clear', (_req, res) => {
    clearSessionCookies(res);
    sendSuccess(res, 200, 'ok', null);
  });
  return router;
}

describe('cookie.helper', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer(createApp({ routers: [buildRouter()] }));
  });
  afterAll(() => server.close());

  const read = async (name: string, cookie?: string) => {
    const response = await server.request(`/read/${name}`, { headers: cookie ? { Cookie: cookie } : {} });
    return ((await response.json()) as { data: { value: string | null } }).data.value;
  };
  const setCookies = async (path: string) => (await server.request(path)).headers.getSetCookie();
  const cookieFor = (cookies: string[], name: string) => cookies.find((cookie) => cookie.startsWith(`${name}=`)) ?? '';

  describe('readCookie', () => {
    it('lee una cookie entre varias', async () => {
      expect(await read('access_token', 'otra=1; access_token=abc123; refresh_token=xyz')).toBe('abc123');
    });

    it('sin cabecera Cookie o sin esa cookie → undefined', async () => {
      expect(await read('access_token')).toBeNull();
      expect(await read('access_token', 'otra=1')).toBeNull();
    });

    it('ignora fragmentos mal formados y valores vacíos', async () => {
      expect(await read('access_token', 'basura; =sin-nombre; access_token=')).toBeNull();
      expect(await read('access_token', 'basura;access_token=ok')).toBe('ok');
    });

    it('no confunde cookies cuyo nombre contiene al buscado', async () => {
      expect(await read('access_token', 'old_access_token=no')).toBeNull();
    });
  });

  describe('setSessionCookies (RF-07, D-5, RNF-05)', () => {
    it('token de acceso: HttpOnly, Secure, SameSite=Strict, Path=/ y 15 minutos', async () => {
      const access = cookieFor(await setCookies('/set'), ACCESS_TOKEN_COOKIE);
      expect(access).toMatch(/^access_token=acceso;/);
      expect(access).toMatch(/; Max-Age=900;/);
      expect(access).toMatch(/; Path=\/;/);
      expect(access).toMatch(/; HttpOnly/);
      expect(access).toMatch(/; Secure/);
      expect(access).toMatch(/; SameSite=Strict/);
    });

    it('refresh token: mismos atributos con Path=/auth y 7 días', async () => {
      const refresh = cookieFor(await setCookies('/set'), REFRESH_TOKEN_COOKIE);
      expect(refresh).toMatch(/^refresh_token=refresco;/);
      expect(refresh).toMatch(/; Max-Age=604800;/);
      expect(refresh).toMatch(/; Path=\/auth;/);
      expect(refresh).toMatch(/; HttpOnly/);
      expect(refresh).toMatch(/; Secure/);
      expect(refresh).toMatch(/; SameSite=Strict/);
    });
  });

  describe('clearSessionCookies (RF-15)', () => {
    it('borra las dos cookies con su misma ruta y atributos', async () => {
      const cookies = await setCookies('/clear');
      const access = cookieFor(cookies, ACCESS_TOKEN_COOKIE);
      const refresh = cookieFor(cookies, REFRESH_TOKEN_COOKIE);
      expect(access).toMatch(/^access_token=;/);
      expect(access).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(access).toMatch(/; Path=\/;/);
      expect(refresh).toMatch(/^refresh_token=;/);
      expect(refresh).toMatch(/; Path=\/auth;/);
      expect(refresh).toMatch(/; HttpOnly/);
    });
  });
});
