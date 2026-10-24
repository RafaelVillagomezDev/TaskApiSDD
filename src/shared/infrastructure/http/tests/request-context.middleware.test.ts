import type { NextFunction, Request, Response } from 'express';

import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { AppError } from '../../../domain/app.error.js';
import { IntlTimeZoneAdapter } from '../../time/intl-time-zone.adapter.js';
import { createRequestContextMiddleware, getRequestContext } from '../request-context.middleware.js';

const VALID_HEADERS = {
  'x-user-id': 'user-1',
  'x-client-time': '2026-10-24T23:30:00+02:00',
  'x-timezone': 'Europe/Madrid',
};

interface Outcome {
  error: unknown;
  res: Response;
  acceptedZones: [string, string][];
}

async function run(headers: Record<string, string | undefined>, now = '2026-10-24T21:30:00Z'): Promise<Outcome> {
  const acceptedZones: [string, string][] = [];
  const middleware = createRequestContextMiddleware({
    clock: new FakeClock(now),
    timeZones: new IntlTimeZoneAdapter(),
    onAcceptedTimeZone: async (userId, zone) => {
      acceptedZones.push([userId, zone]);
    },
  });
  const req = { header: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
  const res = { locals: {} } as unknown as Response;
  let error: unknown = 'next no llamado';
  const next: NextFunction = (err?: unknown) => {
    error = err;
  };
  await middleware(req, res, next);
  return { error, res, acceptedZones };
}

const codeOf = (error: unknown) => (error instanceof AppError ? error.code : error);

describe('createRequestContextMiddleware', () => {
  let warn: jest.SpiedFunction<typeof console.warn>;
  beforeEach(() => {
    warn = import.meta.jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('acepta cabeceras válidas y deja el contexto con el día actual local (RF-23)', async () => {
    const { error, res } = await run(VALID_HEADERS);
    expect(error).toBeUndefined();
    const context = getRequestContext(res);
    expect(context.userId).toBe('user-1');
    expect(context.today.toString()).toBe('2026-10-24');
    expect(context.timeZone).toBe('Europe/Madrid');
  });

  it('a medianoche local el día actual ya es el siguiente aunque en UTC no (RF-23)', async () => {
    const { res } = await run(
      { ...VALID_HEADERS, 'x-client-time': '2026-10-25T00:10:00+02:00' },
      '2026-10-24T22:10:00Z',
    );
    expect(getRequestContext(res).today.toString()).toBe('2026-10-25');
  });

  describe('X-User-Id (RF-01)', () => {
    it.each([undefined, '', '   '])('rechaza %p con MISSING_USER', async (userId) => {
      const { error } = await run({ ...VALID_HEADERS, 'x-user-id': userId });
      expect(codeOf(error)).toBe('MISSING_USER');
    });
  });

  describe('X-Client-Time (RF-31, D-18)', () => {
    it.each([
      ['ausente', undefined],
      ['con Z', '2026-10-24T21:30:00Z'],
      ['formato básico', '20261024T233000+0200'],
      ['desfase sin dos puntos', '2026-10-24T23:30:00+0200'],
      ['día inexistente', '2026-02-30T23:30:00+02:00'],
      ['hora inexistente', '2026-10-24T25:30:00+02:00'],
      ['texto', 'ahora'],
    ])('rechaza %s con INVALID_CLIENT_TIME', async (_case, clientTime) => {
      const { error } = await run({ ...VALID_HEADERS, 'x-client-time': clientTime });
      expect(codeOf(error)).toBe('INVALID_CLIENT_TIME');
    });

    it('acepta fracciones de segundo de 6 dígitos', async () => {
      const { error } = await run({ ...VALID_HEADERS, 'x-client-time': '2026-10-24T23:30:00.123456+02:00' });
      expect(error).toBeUndefined();
    });

    it('acepta +00:00 para un usuario en UTC', async () => {
      const { error } = await run({ ...VALID_HEADERS, 'x-client-time': '2026-10-24T21:30:00+00:00', 'x-timezone': 'UTC' });
      expect(error).toBeUndefined();
    });

    it('tolera 4:59 de desviación y rechaza 5:01 en ambos sentidos', async () => {
      const ahead = await run({ ...VALID_HEADERS, 'x-client-time': '2026-10-24T23:34:59+02:00' });
      const tooAhead = await run({ ...VALID_HEADERS, 'x-client-time': '2026-10-24T23:35:01+02:00' });
      const tooBehind = await run({ ...VALID_HEADERS, 'x-client-time': '2026-10-24T23:24:59+02:00' });
      expect(ahead.error).toBeUndefined();
      expect(codeOf(tooAhead.error)).toBe('INVALID_CLIENT_TIME');
      expect(codeOf(tooBehind.error)).toBe('INVALID_CLIENT_TIME');
    });

    it('escribe en consola una línea JSON con la desviación al rechazar (R-7)', async () => {
      await run({ ...VALID_HEADERS, 'x-client-time': '2026-10-24T23:40:00+02:00' });
      expect(warn).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(String(warn.mock.calls[0]?.[0]));
      expect(logged).toMatchObject({ event: 'INVALID_CLIENT_TIME', deviationSeconds: 600 });
    });
  });

  describe('X-Timezone (RF-32, RF-33)', () => {
    it.each([undefined, 'Mars/Olympus', '+02:00', ''])('rechaza %p con INVALID_TIMEZONE', async (zone) => {
      const { error } = await run({ ...VALID_HEADERS, 'x-timezone': zone });
      expect(codeOf(error)).toBe('INVALID_TIMEZONE');
    });

    it('rechaza un desfase que no coincide con la zona en ese instante', async () => {
      const { error } = await run({
        ...VALID_HEADERS,
        'x-client-time': '2026-10-25T02:30:00+05:00',
      });
      expect(codeOf(error)).toBe('INVALID_TIMEZONE');
    });
  });

  describe('precedencia entre cabeceras (RF-46)', () => {
    it('MISSING_USER gana a una hora no válida', async () => {
      const { error } = await run({ 'x-client-time': 'mal', 'x-timezone': 'mal' });
      expect(codeOf(error)).toBe('MISSING_USER');
    });

    it('INVALID_CLIENT_TIME gana a una zona no válida', async () => {
      const { error } = await run({ 'x-user-id': 'user-1', 'x-client-time': 'mal', 'x-timezone': 'mal' });
      expect(codeOf(error)).toBe('INVALID_CLIENT_TIME');
    });
  });

  describe('recordar la zona (RF-34, D-1)', () => {
    it('avisa de la zona en cuanto las cabeceras son válidas', async () => {
      const { acceptedZones } = await run(VALID_HEADERS);
      expect(acceptedZones).toEqual([['user-1', 'Europe/Madrid']]);
    });

    it('no avisa si alguna cabecera es inválida', async () => {
      const { acceptedZones } = await run({ ...VALID_HEADERS, 'x-timezone': 'Mars/Olympus' });
      expect(acceptedZones).toEqual([]);
    });
  });
});
