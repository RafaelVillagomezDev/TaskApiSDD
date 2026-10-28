import { startTestServer, type TestServer } from '../../tests/support/test.container.js';
import { createApp } from '../app.factory.js';
import { type Container, createContainer } from '../dependency.container.js';
import { AlertScheduler } from '../modules/alerts/infrastructure/alert.scheduler.js';
import { AuthCleanupScheduler } from '../modules/users/infrastructure/auth-cleanup.scheduler.js';
import { getPrismaClient } from '../shared/infrastructure/prisma/prisma.client.js';

interface ErrorBody {
  error: { code: string };
}

// Cableado real de producción (composition root). Las peticiones se quedan en la sesión o en el CSRF (sin
// cookie ni X-CSRF-Token), así que no se toca la base de datos: PrismaClient no conecta hasta la primera consulta
describe('createContainer', () => {
  let container: Container;
  let server: TestServer;

  beforeAll(async () => {
    container = createContainer();
    server = await startTestServer(createApp(container));
  });

  afterAll(async () => {
    await server.close();
    await container.prisma.$disconnect();
  });

  it('crea el reloj del sistema, las zonas horarias y los planificadores sin arrancarlos', () => {
    const before = Date.now();
    const now = container.clock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
    expect(container.timeZones.isValid('Europe/Madrid')).toBe(true);
    expect(container.alertScheduler).toBeInstanceOf(AlertScheduler);
    expect(container.authCleanupScheduler).toBeInstanceOf(AuthCleanupScheduler);
  });

  it('usa la instancia única de PrismaClient', () => {
    expect(container.prisma).toBe(getPrismaClient());
  });

  // Con X-CSRF-Token para que en POST, PATCH y DELETE el primer error sea el de sesión (decisión 19)
  it.each([
    ['POST', '/tasks'],
    ['GET', '/tasks'],
    ['GET', '/tasks/abc'],
    ['PATCH', '/tasks/abc'],
    ['DELETE', '/tasks/abc'],
    ['GET', '/streak'],
    ['GET', '/alerts'],
    ['GET', '/me'],
    ['POST', '/auth/logout'],
  ])('monta %s %s con la sesión: sin cookie → 401 MISSING_TOKEN (RF-18 de la 002)', async (method, path) => {
    const response = await server.request(path, { method, headers: { 'X-CSRF-Token': 'cualquiera' } });
    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorBody).error.code).toBe('MISSING_TOKEN');
  });

  it.each([
    ['/auth/register'],
    ['/auth/login'],
    ['/auth/refresh'],
  ])('monta POST %s: sin X-CSRF-Token → 403 INVALID_CSRF_TOKEN (RF-23 de la 002)', async (path) => {
    const response = await server.request(path, { method: 'POST' });
    expect(response.status).toBe(403);
    expect(((await response.json()) as ErrorBody).error.code).toBe('INVALID_CSRF_TOKEN');
  });

  it('una ruta que no existe → 404 ROUTE_NOT_FOUND', async () => {
    const response = await server.request('/no-existe');
    expect(response.status).toBe(404);
    expect(((await response.json()) as ErrorBody).error.code).toBe('ROUTE_NOT_FOUND');
  });
});
