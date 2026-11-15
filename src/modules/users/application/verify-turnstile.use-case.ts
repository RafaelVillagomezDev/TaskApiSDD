import { AppError } from '../../../shared/domain/app.error.js';
import type { Clock } from '../../../shared/domain/clock.port.js';
import type { TokenService } from '../domain/token.port.js';
import type { TurnstileTokenRepository } from '../domain/turnstile-token.repository.js';
import {
  TURNSTILE_FIRST_ATTEMPT_TIMEOUT_MS,
  TURNSTILE_TOKEN_TTL_MS,
  TURNSTILE_TOTAL_TIMEOUT_MS,
  type TurnstileAction,
  TurnstileVerdict,
  type VerdictCriteria,
  type VerdictKind,
} from '../domain/turnstile-verdict.value-object.js';
import type { SiteverifyOutcome, TurnstileVerifier } from '../domain/turnstile-verifier.port.js';

// Errores de Cloudflare que indican una clave secreta mal configurada (RF-09b de la 005)
const MISCONFIGURATION_ERROR_CODES: ReadonlySet<string> = new Set(['missing-input-secret', 'invalid-input-secret']);

export interface VerifyTurnstileInput {
  token: string;
  // Acción que debe devolver Cloudflare: la de la ruta que se protege (RF-06)
  action: TurnstileAction;
}

export interface VerifyTurnstileOptions {
  // En minúsculas, como los deja la configuración (RF-07)
  allowedHostnames: readonly string[];
  // false con una clave secreta de prueba: ni se reserva el token ni se comprueba la acción (RF-06b, RF-33)
  checkReplayAndAction: boolean;
}

// Verifica con Cloudflare que hay una persona detrás de un login o un registro (spec 005; plan, 5.2). Termina sin
// devolver nada si el token es válido; si no, lanza TURNSTILE_FAILED o TURNSTILE_UNAVAILABLE
export class VerifyTurnstileUseCase {
  constructor(
    private readonly verifier: TurnstileVerifier,
    private readonly reservations: TurnstileTokenRepository,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    private readonly options: VerifyTurnstileOptions,
  ) {}

  async execute(input: VerifyTurnstileInput): Promise<void> {
    const startedAt = this.clock.now().getTime();
    if (this.options.checkReplayAndAction) {
      await this.reserve(input.token, startedAt);
    }
    const criteria: VerdictCriteria = {
      expectedAction: input.action,
      allowedHostnames: this.options.allowedHostnames,
      checkAction: this.options.checkReplayAndAction,
    };
    // Una clave por petición, la misma en el reintento (RF-24); no se guarda ni se registra (RNF-06)
    const idempotencyKey = this.tokens.randomUuid();
    const ask = (timeoutMs: number) => this.verifier.siteverify({ token: input.token, idempotencyKey, timeoutMs });

    let outcome = await ask(TURNSTILE_FIRST_ATTEMPT_TIMEOUT_MS);
    let verdict = TurnstileVerdict.evaluate(outcome, criteria);
    if (verdict === 'retry') {
      // Un solo reintento con el tiempo que queda de los 5 s; si no queda, no se reintenta (RF-25, RNF-03)
      const remainingMs = startedAt + TURNSTILE_TOTAL_TIMEOUT_MS - this.clock.now().getTime();
      if (remainingMs > 0) {
        outcome = await ask(remainingMs);
        verdict = TurnstileVerdict.evaluate(outcome, criteria);
      }
    }
    this.warnIfMisconfigured(outcome);
    VerifyTurnstileUseCase.throwUnlessPassed(verdict);
  }

  // Reserva atómica antes de consultar a Cloudflare, y no se libera pase lo que pase después (RF-20 a RF-22, RF-30)
  private async reserve(token: string, now: number): Promise<void> {
    const reserved = await this.reservations.reserve(
      this.tokens.fingerprint(token),
      new Date(now),
      new Date(now + TURNSTILE_TOKEN_TTL_MS),
    );
    if (!reserved) {
      throw new AppError('TURNSTILE_FAILED');
    }
  }

  // Solo los códigos de error: nunca la clave, el token ni la clave de idempotencia (RF-09b, RNF-02)
  private warnIfMisconfigured(outcome: SiteverifyOutcome): void {
    if (outcome.kind !== 'answered') {
      return;
    }
    const errorCodes = outcome.errorCodes.filter((code) => MISCONFIGURATION_ERROR_CODES.has(code));
    if (errorCodes.length > 0) {
      console.warn(JSON.stringify({ event: 'TURNSTILE_MISCONFIGURED', errorCodes }));
    }
  }

  // Un `retry` que ya no se puede repetir cuenta como Cloudflare inaccesible (RF-09, RF-28)
  private static throwUnlessPassed(verdict: VerdictKind): void {
    if (verdict === 'passed') {
      return;
    }
    throw new AppError(verdict === 'failed' ? 'TURNSTILE_FAILED' : 'TURNSTILE_UNAVAILABLE');
  }
}
