import type { SiteverifyOutcome } from '../turnstile-verifier.port.js';
import { TurnstileVerdict, type VerdictCriteria } from '../turnstile-verdict.value-object.js';

const criteria: VerdictCriteria = {
  expectedAction: 'login',
  allowedHostnames: ['kompitu.yandrydev.cloud', 'example.com'],
  checkAction: true,
};

// Respuesta de Cloudflare con lo que se indique; por defecto, un token válido para el login
function answered(overrides: Partial<Extract<SiteverifyOutcome, { kind: 'answered' }>> = {}): SiteverifyOutcome {
  return {
    kind: 'answered',
    success: true,
    hostname: 'kompitu.yandrydev.cloud',
    action: 'login',
    errorCodes: [],
    ...overrides,
  };
}

describe('TurnstileVerdict.evaluate (plan de la 005, 5.3)', () => {
  it('token válido, con la acción y el host esperados → passed (RF-03, RF-04)', () => {
    expect(TurnstileVerdict.evaluate(answered(), criteria)).toBe('passed');
  });

  it.each<[string, SiteverifyOutcome]>([
    ['sin respuesta (red, tiempo agotado o JSON ilegible)', { kind: 'unreachable' }],
    ['HTTP 500', { kind: 'http-error', status: 500 }],
    ['HTTP 503', { kind: 'http-error', status: 503 }],
    ['internal-error', answered({ success: false, errorCodes: ['internal-error'] })],
  ])('%s → retry (RF-25)', (_case, outcome) => {
    expect(TurnstileVerdict.evaluate(outcome, criteria)).toBe('retry');
  });

  it.each<[string, SiteverifyOutcome]>([
    ['HTTP 400', { kind: 'http-error', status: 400 }],
    ['HTTP 404', { kind: 'http-error', status: 404 }],
    ['bad-request', answered({ success: false, errorCodes: ['bad-request'] })],
    ['missing-input-secret', answered({ success: false, errorCodes: ['missing-input-secret'] })],
    ['invalid-input-secret', answered({ success: false, errorCodes: ['invalid-input-secret'] })],
    [
      'invalid-input-secret junto a un error del token',
      answered({ success: false, errorCodes: ['invalid-input-response', 'invalid-input-secret'] }),
    ],
  ])('%s → unavailable, sin reintentar (RF-26, RF-28, RF-29)', (_case, outcome) => {
    expect(TurnstileVerdict.evaluate(outcome, criteria)).toBe('unavailable');
  });

  it('un error que no depende del token gana a uno del token: internal-error se reintenta (RF-25)', () => {
    const outcome = answered({ success: false, errorCodes: ['timeout-or-duplicate', 'internal-error'] });
    expect(TurnstileVerdict.evaluate(outcome, criteria)).toBe('retry');
  });

  it.each<[string, string[]]>([
    ['invalid-input-response', ['invalid-input-response']],
    ['timeout-or-duplicate', ['timeout-or-duplicate']],
    ['missing-input-response', ['missing-input-response']],
    ['un código desconocido', ['algo-nuevo']],
    ['ningún código', []],
  ])('success: false con %s → failed (RF-05, RF-08)', (_case, errorCodes) => {
    expect(TurnstileVerdict.evaluate(answered({ success: false, errorCodes }), criteria)).toBe('failed');
  });

  it.each<[string, string | null]>([
    ['un host que no está en la lista', 'otra-web.com'],
    ['un subdominio de un host permitido', 'evil.kompitu.yandrydev.cloud'],
    ['sin host', null],
  ])('success: true con %s → failed (RF-07)', (_case, hostname) => {
    expect(TurnstileVerdict.evaluate(answered({ hostname }), criteria)).toBe('failed');
  });

  it('compara el host sin distinguir mayúsculas (RF-07)', () => {
    expect(TurnstileVerdict.evaluate(answered({ hostname: 'Kompitu.YandryDev.Cloud' }), criteria)).toBe('passed');
  });

  it.each<[string, string | null]>([
    ['la acción del registro', 'register'],
    ['otra acción', 'checkout'],
    ['sin acción', null],
  ])('con la acción comprobada, %s en el login → failed (RF-06)', (_case, action) => {
    expect(TurnstileVerdict.evaluate(answered({ action }), criteria)).toBe('failed');
  });

  it('en el registro exige la acción register (RF-06)', () => {
    const register: VerdictCriteria = { ...criteria, expectedAction: 'register' };
    expect(TurnstileVerdict.evaluate(answered({ action: 'register' }), register)).toBe('passed');
    expect(TurnstileVerdict.evaluate(answered({ action: 'login' }), register)).toBe('failed');
  });

  it.each<[string, string | null]>([
    ['otra acción', 'register'],
    ['sin acción, como las claves de prueba', null],
  ])('sin comprobar la acción, %s → passed (RF-06b)', (_case, action) => {
    const withoutAction: VerdictCriteria = { ...criteria, checkAction: false };
    expect(TurnstileVerdict.evaluate(answered({ action, hostname: 'example.com' }), withoutAction)).toBe('passed');
  });

  it('sin comprobar la acción, el host se sigue comprobando (RF-07)', () => {
    const withoutAction: VerdictCriteria = { ...criteria, checkAction: false };
    expect(TurnstileVerdict.evaluate(answered({ hostname: 'otra-web.com' }), withoutAction)).toBe('failed');
  });
});
