import type { Clock } from '../../../shared/domain/clock.port.js';
import { AppError } from '../../../shared/domain/app.error.js';
import type { GraceTokenCipher } from '../domain/grace-token-cipher.port.js';
import type { RefreshTokenRecord, RefreshUnitOfWork, SessionRepository } from '../domain/session.repository.js';
import type { TokenService } from '../domain/token.port.js';
import type { VerifySessionCsrfUseCase } from './verify-session-csrf.use-case.js';

export interface RefreshSessionInput {
  // Cookie refresh_token; undefined si falta
  refreshToken: string | undefined;
  // X-CSRF-Token, que el controlador ya comprobó que llega
  csrfToken: string;
}

// Tokens que se entregan en las cookies, con sus caducidades y el instante de la renovación
export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  now: Date;
}

type RefreshFailure = 'INVALID_REFRESH_TOKEN' | 'SESSION_EXPIRED' | 'INVALID_CSRF_TOKEN';
type RefreshOutcome = { tokens: RefreshResult } | { failure: RefreshFailure };

// Renueva la sesión rotando los dos tokens, con margen de gracia de 30 s y cierre de la sesión si se reutiliza
// un refresh token rotado, siempre con la sesión bloqueada (RF-11 a RF-14, RF-24, plan de la 002 §5.3, D-4)
export class RefreshSessionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly tokens: TokenService,
    private readonly cipher: GraceTokenCipher,
    private readonly verifyCsrf: VerifySessionCsrfUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(input: RefreshSessionInput): Promise<RefreshResult> {
    if (!input.refreshToken) {
      throw new AppError('INVALID_REFRESH_TOKEN');
    }
    const now = this.clock.now();
    const outcome = await this.sessions.withRefreshTokenLocked(this.tokens.fingerprint(input.refreshToken), (record, unit) =>
      this.decide(record, unit, input.csrfToken, now),
    );
    if ('failure' in outcome) {
      throw new AppError(outcome.failure);
    }
    return outcome.tokens;
  }

  // Dentro de la transacción no se lanza ningún error: la desharía, también el cierre de la sesión
  private async decide(
    record: RefreshTokenRecord | null,
    unit: RefreshUnitOfWork,
    csrfToken: string,
    now: Date,
  ): Promise<RefreshOutcome> {
    if (!record) {
      return { failure: 'INVALID_REFRESH_TOKEN' };
    }
    if (!this.verifyCsrf.matches(csrfToken, record.csrfTokenHash)) {
      return { failure: 'INVALID_CSRF_TOKEN' };
    }
    if (!record.session.isRefreshUsable(now)) {
      await unit.close(record.session.id);
      return { failure: 'SESSION_EXPIRED' };
    }
    if (record.tokenRotatedAt === null) {
      return { tokens: await this.rotate(record, unit, now) };
    }
    const replayed = this.replayWithinGrace(record, now);
    if (replayed) {
      return { tokens: replayed };
    }
    // Reutilización fuera del margen: se cierra la sesión entera, no solo se rechaza el token (RF-13)
    await unit.close(record.session.id);
    return { failure: 'INVALID_REFRESH_TOKEN' };
  }

  // Nueva generación con dos tokens aleatorios; se guarda su copia cifrada para el margen de gracia (D-1)
  private async rotate(record: RefreshTokenRecord, unit: RefreshUnitOfWork, now: Date): Promise<RefreshResult> {
    const accessToken = this.tokens.randomToken();
    const refreshToken = this.tokens.randomToken();
    record.session.rotate(now);
    await unit.rotate(
      record,
      {
        accessTokenHash: this.tokens.fingerprint(accessToken),
        refreshTokenHash: this.tokens.fingerprint(refreshToken),
        graceTokens: this.cipher.seal({ accessToken, refreshToken }),
      },
      now,
    );
    return { accessToken, refreshToken, ...this.expiries(record), now };
  }

  // El token de la generación inmediatamente anterior, dentro de los 30 s, recibe los mismos tokens nuevos
  // (dos pestañas que renuevan a la vez, RF-13). Una copia que no se puede abrir (clave cambiada) cuenta
  // como reutilización (R-4)
  private replayWithinGrace(record: RefreshTokenRecord, now: Date): RefreshResult | null {
    const { session, graceTokens } = record;
    const isPreviousGeneration = record.tokenGeneration === session.generation - 1;
    if (!graceTokens || !isPreviousGeneration || !session.isWithinGrace(now)) {
      return null;
    }
    try {
      return { ...this.cipher.open(graceTokens), ...this.expiries(record), now };
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'GRACE_TOKENS_UNREADABLE',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  private expiries(record: RefreshTokenRecord): Pick<RefreshResult, 'accessExpiresAt' | 'refreshExpiresAt'> {
    return { accessExpiresAt: record.session.accessExpiresAt, refreshExpiresAt: record.session.refreshExpiresAt };
  }
}
