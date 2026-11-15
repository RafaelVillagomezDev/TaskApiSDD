import type { SiteverifyOutcome } from './turnstile-verifier.port.js';

// Un token se acepta una sola vez durante 300 s (RF-20, RF-31 de la 005)
export const TURNSTILE_TOKEN_TTL_MS = 300_000;
// Tiempo máximo total de la verificación, intento y reintento incluidos (RNF-03)
export const TURNSTILE_TOTAL_TIMEOUT_MS = 5_000;
// Tiempo máximo del primer intento, para que un cuelgue deje tiempo al reintento (plan de la 005, D-8)
export const TURNSTILE_FIRST_ATTEMPT_TIMEOUT_MS = 3_000;
// Longitud máxima del token según Cloudflare (RF-01)
export const TURNSTILE_TOKEN_MAX_LENGTH = 2_048;

// Primer estado HTTP de error del servidor: los 5xx se reintentan (RF-25)
const FIRST_SERVER_ERROR_STATUS = 500;

// Errores de Cloudflare que no dependen del token (RF-29): uno se reintenta y el resto no (RF-25, RF-26)
const RETRYABLE_ERROR_CODES: ReadonlySet<string> = new Set(['internal-error']);
const CONFIGURATION_ERROR_CODES: ReadonlySet<string> = new Set([
  'bad-request',
  'missing-input-secret',
  'invalid-input-secret',
]);

export type TurnstileAction = 'login' | 'register';

// passed: sigue la petición; failed: TURNSTILE_FAILED; unavailable: TURNSTILE_UNAVAILABLE; retry: se puede
// repetir la consulta una vez (RF-25)
export type VerdictKind = 'passed' | 'failed' | 'unavailable' | 'retry';

export interface VerdictCriteria {
  expectedAction: TurnstileAction;
  // En minúsculas, como los deja la configuración
  allowedHostnames: readonly string[];
  // false con una clave secreta de prueba, que no devuelve acción (RF-06b)
  checkAction: boolean;
}

// Decide qué hacer con la respuesta de Cloudflare (plan de la 005, 5.3). Las reglas se evalúan en orden: los
// errores que no dependen del token van antes que `success`, porque Cloudflare los devuelve con success: false
export class TurnstileVerdict {
  static evaluate(outcome: SiteverifyOutcome, criteria: VerdictCriteria): VerdictKind {
    if (outcome.kind === 'unreachable') {
      return 'retry';
    }
    if (outcome.kind === 'http-error') {
      return outcome.status >= FIRST_SERVER_ERROR_STATUS ? 'retry' : 'unavailable';
    }
    if (outcome.errorCodes.some((code) => RETRYABLE_ERROR_CODES.has(code))) {
      return 'retry';
    }
    if (outcome.errorCodes.some((code) => CONFIGURATION_ERROR_CODES.has(code))) {
      return 'unavailable';
    }
    if (!outcome.success || !TurnstileVerdict.isAllowedHost(outcome.hostname, criteria)) {
      return 'failed';
    }
    if (criteria.checkAction && outcome.action !== criteria.expectedAction) {
      return 'failed';
    }
    return 'passed';
  }

  // Comparación exacta sin distinguir mayúsculas: un subdominio no cuenta (RF-07)
  private static isAllowedHost(hostname: string | null, criteria: VerdictCriteria): boolean {
    return hostname !== null && criteria.allowedHostnames.includes(hostname.toLowerCase());
  }
}
