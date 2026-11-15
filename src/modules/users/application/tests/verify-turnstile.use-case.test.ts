import { AppError } from '../../../../shared/domain/app.error.js';
import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import {
  FAKE_TURNSTILE_HOSTNAME,
  FakeTurnstileVerifier,
  turnstileTokenFor,
} from '../../../../../tests/support/fake-turnstile-verifier.adapter.js';
import { InMemoryTurnstileTokenRepository } from '../../../../../tests/support/in-memory-turnstile-token.repository.js';
import type { SiteverifyOutcome, SiteverifyRequest } from '../../domain/turnstile-verifier.port.js';
import { CryptoTokenService } from '../../infrastructure/crypto-token.adapter.js';
import { VerifyTurnstileUseCase } from '../verify-turnstile.use-case.js';

const jest = import.meta.jest;

const NOW = '2026-11-15T10:00:00.000Z';
const TTL_MS = 300_000;
const UNREACHABLE: SiteverifyOutcome = { kind: 'unreachable' };
const SERVER_ERROR: SiteverifyOutcome = { kind: 'http-error', status: 503 };
const rejected = (errorCodes: string[]): SiteverifyOutcome => ({
  kind: 'answered',
  success: false,
  hostname: null,
  action: null,
  errorCodes,
});

function setup(checkReplayAndAction = true) {
  const clock = new FakeClock(NOW);
  const verifier = new FakeTurnstileVerifier();
  const reservations = new InMemoryTurnstileTokenRepository();
  const tokens = new CryptoTokenService();
  const useCase = new VerifyTurnstileUseCase(verifier, reservations, tokens, clock, {
    allowedHostnames: [FAKE_TURNSTILE_HOSTNAME],
    checkReplayAndAction,
  });
  // Respuesta que llega tras `elapsedMs` milisegundos del reloj simulado
  const after = (elapsedMs: number, outcome: SiteverifyOutcome) => async (): Promise<SiteverifyOutcome> => {
    clock.advance(elapsedMs);
    return outcome;
  };
  return { clock, verifier, reservations, tokens, useCase, after };
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
}

describe('VerifyTurnstileUseCase', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  it('un token válido para la acción pasa, con una sola consulta (RF-03, RF-04)', async () => {
    const { useCase, verifier } = setup();
    await expect(useCase.execute({ token: turnstileTokenFor('login'), action: 'login' })).resolves.toBeUndefined();
    expect(verifier.requests).toHaveLength(1);
  });

  it('un token con la acción de otra ruta → TURNSTILE_FAILED (RF-06)', async () => {
    const { useCase } = setup();
    expect(await codeOf(useCase.execute({ token: turnstileTokenFor('register'), action: 'login' }))).toBe(
      'TURNSTILE_FAILED',
    );
  });

  it('un token rechazado por Cloudflare → TURNSTILE_FAILED (RF-05, RF-08)', async () => {
    const { useCase, verifier } = setup();
    verifier.rejectNext(['timeout-or-duplicate']);
    expect(await codeOf(useCase.execute({ token: turnstileTokenFor('login'), action: 'login' }))).toBe(
      'TURNSTILE_FAILED',
    );
  });

  describe('un solo uso de cada token (RF-20 a RF-23, RF-30)', () => {
    it('reserva la huella durante 300 s antes de consultar a Cloudflare', async () => {
      const { useCase, verifier, reservations, tokens } = setup();
      const token = turnstileTokenFor('login');
      verifier.respondWith(async (request: SiteverifyRequest) => {
        // Cuando Cloudflare recibe la consulta, el token ya está reservado (RF-22)
        expect(reservations.hashes()).toEqual([tokens.fingerprint(request.token)]);
        return { kind: 'answered', success: true, hostname: FAKE_TURNSTILE_HOSTNAME, action: 'login', errorCodes: [] };
      });
      await useCase.execute({ token, action: 'login' });
      expect(reservations.hashes()).toEqual([tokens.fingerprint(token)]);
      expect(reservations.hashes()[0]).not.toContain(token);
    });

    it('un token ya recibido → TURNSTILE_FAILED sin consultar a Cloudflare (RF-21)', async () => {
      const { useCase, verifier } = setup();
      const token = turnstileTokenFor('login');
      await useCase.execute({ token, action: 'login' });
      expect(await codeOf(useCase.execute({ token, action: 'login' }))).toBe('TURNSTILE_FAILED');
      expect(verifier.requests).toHaveLength(1);
    });

    it('el mismo token en el login y después en el registro → TURNSTILE_FAILED (RF-21)', async () => {
      const { useCase, verifier } = setup();
      const token = turnstileTokenFor('login');
      await useCase.execute({ token, action: 'login' });
      expect(await codeOf(useCase.execute({ token, action: 'register' }))).toBe('TURNSTILE_FAILED');
      expect(verifier.requests).toHaveLength(1);
    });

    it.each<[string, SiteverifyOutcome]>([
      ['un rechazo de Cloudflare', rejected(['invalid-input-response'])],
      ['Cloudflare inaccesible', rejected(['invalid-input-secret'])],
    ])('tras %s, el token sigue reservado (RF-30)', async (_case, outcome) => {
      const { useCase, verifier } = setup();
      const token = turnstileTokenFor('login');
      verifier.respondWith(outcome);
      await expect(useCase.execute({ token, action: 'login' })).rejects.toBeInstanceOf(AppError);
      expect(await codeOf(useCase.execute({ token, action: 'login' }))).toBe('TURNSTILE_FAILED');
      expect(verifier.requests).toHaveLength(1);
    });

    it('pasados 300 s, la reserva caduca (RF-20, RF-31)', async () => {
      const { useCase, verifier, clock } = setup();
      const token = turnstileTokenFor('login');
      await useCase.execute({ token, action: 'login' });
      clock.advance(TTL_MS);
      await useCase.execute({ token, action: 'login' });
      expect(verifier.requests).toHaveLength(2);
    });

    it('con una clave secreta de prueba no reserva el token ni comprueba la acción (RF-06b, RF-33)', async () => {
      const { useCase, verifier, reservations } = setup(false);
      // Token sin prefijo de acción: el simulado no devuelve acción, como las claves de prueba (S-03)
      const dummy = 'XXXX.DUMMY.TOKEN.XXXX';
      await useCase.execute({ token: dummy, action: 'login' });
      await useCase.execute({ token: dummy, action: 'register' });
      expect(verifier.requests).toHaveLength(2);
      expect(reservations.hashes()).toEqual([]);
    });
  });

  describe('reintento único (RF-24 a RF-26, RF-28, RF-29, RNF-03)', () => {
    it.each<[string, SiteverifyOutcome]>([
      ['sin respuesta', UNREACHABLE],
      ['un 5xx', SERVER_ERROR],
      ['internal-error', rejected(['internal-error'])],
    ])('tras %s reintenta una vez con el mismo token y la misma clave de idempotencia', async (_case, first) => {
      const { useCase, verifier } = setup();
      const token = turnstileTokenFor('login');
      verifier.respondWith(first);
      await useCase.execute({ token, action: 'login' });
      expect(verifier.requests).toHaveLength(2);
      const [attempt, retry] = verifier.requests;
      expect(retry?.token).toBe(token);
      expect(retry?.idempotencyKey).toBe(attempt?.idempotencyKey);
    });

    it('el veredicto del reintento es el definitivo: un rechazo → TURNSTILE_FAILED', async () => {
      const { useCase, verifier } = setup();
      verifier.respondWith(UNREACHABLE, rejected(['timeout-or-duplicate']));
      expect(await codeOf(useCase.execute({ token: turnstileTokenFor('login'), action: 'login' }))).toBe(
        'TURNSTILE_FAILED',
      );
    });

    it('si el reintento tampoco responde → TURNSTILE_UNAVAILABLE, sin un tercer intento (RF-28)', async () => {
      const { useCase, verifier } = setup();
      verifier.respondWith(UNREACHABLE, SERVER_ERROR);
      expect(await codeOf(useCase.execute({ token: turnstileTokenFor('login'), action: 'login' }))).toBe(
        'TURNSTILE_UNAVAILABLE',
      );
      expect(verifier.requests).toHaveLength(2);
    });

    it.each<[string, SiteverifyOutcome, string]>([
      ['un rechazo del token', rejected(['invalid-input-response']), 'TURNSTILE_FAILED'],
      ['bad-request', rejected(['bad-request']), 'TURNSTILE_UNAVAILABLE'],
      ['invalid-input-secret', rejected(['invalid-input-secret']), 'TURNSTILE_UNAVAILABLE'],
      ['un 4xx', { kind: 'http-error', status: 400 }, 'TURNSTILE_UNAVAILABLE'],
    ])('tras %s no reintenta (RF-26)', async (_case, first, code) => {
      const { useCase, verifier } = setup();
      verifier.respondWith(first);
      expect(await codeOf(useCase.execute({ token: turnstileTokenFor('login'), action: 'login' }))).toBe(code);
      expect(verifier.requests).toHaveLength(1);
    });

    it('el primer intento tiene 3 s y el reintento el tiempo que queda hasta 5 s (RNF-03, D-8)', async () => {
      const { useCase, verifier, after } = setup();
      verifier.respondWith(after(1_200, UNREACHABLE));
      await useCase.execute({ token: turnstileTokenFor('login'), action: 'login' });
      expect(verifier.requests.map((request) => request.timeoutMs)).toEqual([3_000, 3_800]);
    });

    it('si el primer intento agota los 5 s, no reintenta → TURNSTILE_UNAVAILABLE (RF-09)', async () => {
      const { useCase, verifier, after } = setup();
      verifier.respondWith(after(5_000, UNREACHABLE));
      expect(await codeOf(useCase.execute({ token: turnstileTokenFor('login'), action: 'login' }))).toBe(
        'TURNSTILE_UNAVAILABLE',
      );
      expect(verifier.requests).toHaveLength(1);
    });

    it('cada petición usa una clave de idempotencia distinta (RF-24, RNF-06)', async () => {
      const { useCase, verifier } = setup();
      await useCase.execute({ token: turnstileTokenFor('login'), action: 'login' });
      await useCase.execute({ token: turnstileTokenFor('login'), action: 'login' });
      const [first, second] = verifier.requests.map((request) => request.idempotencyKey);
      expect(first).not.toBe(second);
    });
  });

  describe('aviso de configuración (RF-09b, RNF-02, RNF-06)', () => {
    it.each(['missing-input-secret', 'invalid-input-secret'])(
      'con %s registra TURNSTILE_MISCONFIGURED solo con los códigos de error',
      async (errorCode) => {
        const { useCase, verifier } = setup();
        const token = turnstileTokenFor('login');
        verifier.respondWith(rejected([errorCode]));
        await codeOf(useCase.execute({ token, action: 'login' }));

        expect(warn).toHaveBeenCalledTimes(1);
        const logged = String(warn.mock.calls[0]?.[0]);
        expect(JSON.parse(logged)).toEqual({ event: 'TURNSTILE_MISCONFIGURED', errorCodes: [errorCode] });
        expect(logged).not.toContain(token);
        expect(logged).not.toContain(verifier.requests[0]?.idempotencyKey);
      },
    );

    it.each<[string, SiteverifyOutcome]>([
      ['un rechazo del token', rejected(['invalid-input-response'])],
      ['internal-error en los dos intentos', rejected(['internal-error'])],
    ])('con %s no registra nada', async (_case, outcome) => {
      const { useCase, verifier } = setup();
      verifier.respondWith(outcome, outcome);
      await codeOf(useCase.execute({ token: turnstileTokenFor('login'), action: 'login' }));
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
