import { Router } from 'express';
import { z } from 'zod';

import { startTestServer, type TestServer } from '../../../../../tests/support/test.container.js';
import { createApp } from '../../../../app.factory.js';
import { AppError } from '../../../domain/app.error.js';
import { ERROR_CODES, type ErrorCode } from '../../../domain/error-code.constant.js';
import { jsonBodyMiddleware } from '../json-body.middleware.js';
import { parseOrThrow } from '../request-validation.helper.js';
import { sendSuccess } from '../response-envelope.helper.js';

interface ErrorBody {
  error: { code: string; details?: unknown[] };
}

// Router de prueba: imita el montaje real (middlewares encadenados en cada ruta, D-8)
function buildTestRouter(): Router {
  const router = Router();
  // Imita el middleware de sesión: sin cookie no hay sesión (RF-18 de la 002)
  const requireSession = (req: { header(name: string): string | undefined }) => {
    if (!req.header('cookie')) throw new AppError('MISSING_TOKEN');
  };

  router.get('/tasks', (req, res) => {
    requireSession(req);
    sendSuccess(res, 200, 'Operación realizada con éxito', []);
  });
  router.post('/echo', jsonBodyMiddleware, (req, res) => {
    const body = parseOrThrow(z.object({ title: z.string().min(1) }), req.body);
    sendSuccess(res, 201, 'Creado', body);
  });
  router.get('/fail/:code', (req) => {
    throw new AppError(req.params.code as ErrorCode);
  });
  router.get('/boom', () => {
    throw new Error('detalle interno que no debe salir');
  });
  return router;
}

describe('sobre de error y middlewares transversales (principio VII, RF-46)', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer(createApp({ routers: [buildTestRouter()] }));
  });
  afterAll(() => server.close());

  it('responde éxito con el sobre { success, status, message, data }', async () => {
    const response = await server.request('/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Comprar pan' }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      status: 201,
      message: 'Creado',
      data: { title: 'Comprar pan' },
    });
  });

  it('VALIDATION_ERROR incluye details con cada campo erróneo', async () => {
    const response = await server.request('/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    });
    const body = (await response.json()) as ErrorBody;
    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, status: 400, error: { code: 'VALIDATION_ERROR' } });
    expect(body.error.details).toEqual([expect.objectContaining({ field: 'title' })]);
  });

  it('los errores que no son de validación no llevan details', async () => {
    const response = await server.request('/tasks');
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body).toEqual({
      success: false,
      status: 401,
      error: { code: 'MISSING_TOKEN', message: expect.any(String) },
    });
  });

  it.each([
    ['JSON mal formado', 'application/json', '{"title": '],
    ['cuerpo de más de 100 kB', 'application/json', JSON.stringify({ title: 'x'.repeat(120_000) })],
    ['charset no soportado', 'application/json; charset=iso-8859-1', '{"title":"a"}'],
  ])('%s → VALIDATION_ERROR (D-20)', async (_case, contentType, payload) => {
    const response = await server.request('/echo', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: payload,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  // Códigos de las cuentas de usuario (spec 002, RF-34): HTTP de la tabla de la spec y mensaje en español
  it.each([
    ['INVALID_CSRF_TOKEN', 403],
    ['MISSING_TOKEN', 401],
    ['INVALID_TOKEN', 401],
    ['TOKEN_EXPIRED', 401],
    ['INVALID_REFRESH_TOKEN', 401],
    ['SESSION_EXPIRED', 401],
    ['TOO_MANY_ATTEMPTS', 429],
    ['INVALID_CREDENTIALS', 401],
    ['WRONG_PASSWORD', 403],
    ['EMAIL_ALREADY_REGISTERED', 409],
  ])('%s → %i con el sobre y su mensaje en español (RF-34, RNF-02)', async (code, status) => {
    const response = await server.request(`/fail/${code}`);
    const body = (await response.json()) as { status: number; error: { code: string; message: string; details?: unknown } };
    expect(response.status).toBe(status);
    expect(body).toEqual({ success: false, status, error: { code, message: expect.any(String) } });
    expect(body.error.message).toBe(ERROR_CODES[code as ErrorCode].message);
    expect(body.error.message).toMatch(/[a-záéíóúñ]/);
  });

  it('MISSING_USER ya no existe: X-User-Id desaparece con la sesión (RF-32 de la 002)', () => {
    expect(Object.keys(ERROR_CODES)).not.toContain('MISSING_USER');
  });

  it('la precedencia sigue el orden de RF-34 de la 002', () => {
    const precedenceOf = (code: ErrorCode) => ERROR_CODES[code].precedence;
    const order: ErrorCode[][] = [
      ['ROUTE_NOT_FOUND'],
      ['INVALID_CSRF_TOKEN'],
      ['MISSING_TOKEN', 'INVALID_TOKEN', 'TOKEN_EXPIRED', 'INVALID_REFRESH_TOKEN', 'SESSION_EXPIRED'],
      ['INVALID_CLIENT_TIME'],
      ['INVALID_TIMEZONE'],
      ['VALIDATION_ERROR'],
      ['TOO_MANY_ATTEMPTS', 'INVALID_CREDENTIALS', 'WRONG_PASSWORD', 'EMAIL_ALREADY_REGISTERED', 'TASK_NOT_FOUND'],
      ['DAY_CLOSED', 'DAY_NOT_STARTED'],
    ];
    order.forEach((codes, index) => {
      for (const code of codes) expect(precedenceOf(code)).toBe(index + 1);
    });
    expect(precedenceOf('INTERNAL_ERROR')).toBeNull();
    expect(order.flat().length + 1).toBe(Object.keys(ERROR_CODES).length);
  });

  it('un error inesperado → INTERNAL_ERROR sin detalles internos', async () => {
    const response = await server.request('/boom');
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      success: false,
      status: 500,
      error: { code: 'INTERNAL_ERROR', message: expect.any(String) },
    });
    expect(text).not.toContain('detalle interno');
  });

  it.each([
    ['ruta inexistente', 'GET', '/foo'],
    ['OPTIONS', 'OPTIONS', '/tasks'],
    ['PUT sobre una ruta existente', 'PUT', '/tasks'],
  ])('%s → 404 ROUTE_NOT_FOUND con sobre', async (_case, method, path) => {
    const response = await server.request(path, { method });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ success: false, status: 404, error: { code: 'ROUTE_NOT_FOUND' } });
  });

  it('PUT /tasks sin sesión → ROUTE_NOT_FOUND, no MISSING_TOKEN (RF-34 de la 002, D-8)', async () => {
    const response = await server.request('/tasks', { method: 'PUT' });
    expect(((await response.json()) as ErrorBody).error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('HEAD → 404 sin cuerpo (excepción del principio VII)', async () => {
    const response = await server.request('/tasks', { method: 'HEAD' });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });
});
