import type { Clock } from '../../../shared/domain/clock.port.js';
import type { CsrfTokenRepository } from '../domain/csrf-token.repository.js';
import type { LoginAttemptRepository } from '../domain/login-attempt.repository.js';
import { REFRESH_GRACE_MS } from '../domain/session.entity.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { TurnstileTokenRepository } from '../domain/turnstile-token.repository.js';

// Borra lo que ya no puede usarse: copias cifradas de más de 30 s, tokens CSRF previos caducados, sesiones
// caducadas (con sus refresh tokens), bloqueos vencidos sin fallos recientes (D-12, R-13) y huellas de tokens de
// Turnstile caducadas (RF-31 de la 005; plan de la 005, D-6)
export class PurgeExpiredAuthDataUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly csrfTokens: CsrfTokenRepository,
    private readonly loginAttempts: LoginAttemptRepository,
    private readonly turnstileTokens: TurnstileTokenRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<void> {
    const now = this.clock.now();
    await this.sessions.clearGraceTokens(new Date(now.getTime() - REFRESH_GRACE_MS));
    await this.sessions.deleteExpired(now);
    await this.csrfTokens.deleteExpired(now);
    await this.loginAttempts.deleteStale(now);
    await this.turnstileTokens.deleteExpired(now);
  }
}
