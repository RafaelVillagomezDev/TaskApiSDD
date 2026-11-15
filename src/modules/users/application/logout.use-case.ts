import { AppError } from '../../../shared/domain/app.error.js';
import type { SessionRecord, SessionRepository } from '../domain/session.repository.js';
import type { TokenService } from '../domain/token.port.js';
import type { VerifySessionCsrfUseCase } from './verify-session-csrf.use-case.js';

export interface LogoutInput {
  accessToken?: string;
  refreshToken?: string;
  // X-CSRF-Token, que el controlador ya comprobó que llega
  csrfToken: string;
}

// Cierra la sesión del token de acceso, aunque haya caducado, o, si no hay uno válido, la del refresh token
// vigente; las demás sesiones de la cuenta no cambian (RF-15, RF-16, plan de la 002 §5.4)
export class LogoutUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly tokens: TokenService,
    private readonly verifyCsrf: VerifySessionCsrfUseCase,
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    if (!input.accessToken && !input.refreshToken) {
      throw new AppError('MISSING_TOKEN');
    }
    const record = (await this.byAccessToken(input.accessToken)) ?? (await this.byRefreshToken(input.refreshToken));
    if (!record) {
      throw new AppError('INVALID_TOKEN');
    }
    this.verifyCsrf.execute(input.csrfToken, record.csrfTokenHash);
    // Sus refresh tokens se borran con ella
    await this.sessions.delete(record.session.id);
  }

  private async byAccessToken(accessToken: string | undefined): Promise<SessionRecord | null> {
    return accessToken ? this.sessions.findByAccessTokenHash(this.tokens.fingerprint(accessToken)) : null;
  }

  // Un refresh token ya rotado no identifica la sesión para cerrarla
  private async byRefreshToken(refreshToken: string | undefined): Promise<SessionRecord | null> {
    if (!refreshToken) return null;
    const record = await this.sessions.findByRefreshTokenHash(this.tokens.fingerprint(refreshToken));
    return record?.tokenRotatedAt === null ? record : null;
  }
}
