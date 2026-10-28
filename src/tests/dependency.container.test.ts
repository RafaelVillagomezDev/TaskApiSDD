import { startTestServer, type TestServer } from '../../tests/support/test.container.js';
import { createApp } from '../app.factory.js';
import { type Container, createContainer } from '../dependency.container.js';
import { AlertScheduler } from '../modules/alerts/infrastructure/alert.scheduler.js';
import { getPrismaClient } from '../shared/infrastructure/prisma/prisma.client.js';

interface ErrorBody {
  error: { code: string };
}

// Cableado real de producción (composition root). Las peticiones se quedan en el contexto (sin X-User-Id),
// así que no se toca la base de datos: PrismaClient no conecta hasta la primera consulta
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

  it('crea el reloj del sistema, las zonas horarias y el planificador de avisos sin arrancarlo', () => {
    const before = Date.now();
    const now = container.clock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
    expect(container.timeZones.isValid('Europe/Madrid')).toBe(true);
    expect(container.alertScheduler).toBeInstanceOf(AlertScheduler);
  });

  it('usa la instancia única de PrismaClient', () => {
    expect(container.prisma).toBe(getPrismaClient());
  });

  it.each([
    ['POST', '/tasks'],
    ['GET', '/tasks'],
    ['GET', '/tasks/abc'],
    ['PATCH', '/tasks/abc'],
    ['DELETE', '/tasks/abc'],
    ['GET', '/streak'],
    ['GET', '/alerts'],
  ])('monta %s %s con el contexto de petición: sin X-User-Id → 401 MISSING_USER', async (method, path) => {
    const response = await server.request(path, { method });
    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorBody).error.code).toBe('MISSING_USER');
  });

  it('una ruta que no existe → 404 ROUTE_NOT_FOUND', async () => {
    const response = await server.request('/no-existe');
    expect(response.status).toBe(404);
    expect(((await response.json()) as ErrorBody).error.code).toBe('ROUTE_NOT_FOUND');
  });
});
