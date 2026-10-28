import type { SessionContext } from '../../../shared/application/request-context.type.js';
import type { Clock } from '../../../shared/domain/clock.port.js';
import { AppError } from '../../../shared/domain/app.error.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { TokenService } from '../domain/token.port.js';
import type { VerifySessionCsrfUseCase } from './verify-session-csrf.use-case.js';

export interface AuthenticateSessionInput {
  // Cookie access_token; undefined si falta
  accessToken: string | undefined;
  // X-CSRF-Token, solo en POST, PATCH y DELETE (el middleware ya comprobó que llega)
  csrfToken?: string;
}

// Resuelve el token de acceso en el usuario y la sesión, en el orden de RF-34: sesión inexistente,
// CSRF de la sesión y caducidad (RF-17 a RF-20, RF-23, decisión 19)
export class AuthenticateSessionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly tokens: TokenService,
    private readonly verifyCsrf: VerifySessionCsrfUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(input: AuthenticateSessionInput): Promise<SessionContext> {
    if (!input.accessToken) {
      throw new AppError('MISSING_TOKEN');
    }
    // Solo existe la huella del token de la generación vigente (D-14)
    const record = await this.sessions.findByAccessTokenHash(this.tokens.fingerprint(input.accessToken));
    if (!record) {
      throw new AppError('INVALID_TOKEN');
    }
    if (input.csrfToken !== undefined) {
      this.verifyCsrf.execute(input.csrfToken, record.csrfTokenHash);
    }
    if (record.session.isAccessExpired(this.clock.now())) {
      throw new AppError('TOKEN_EXPIRED');
    }
    return { userId: record.session.userId, sessionId: record.session.id };
  }
}
