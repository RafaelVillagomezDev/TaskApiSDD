import type { Clock } from '../../../shared/domain/clock.port.js';
import type { CsrfTokenRepository } from '../domain/csrf-token.repository.js';
import type { TokenService } from '../domain/token.port.js';

// El token previo a la sesión vale 30 minutos y se puede reutilizar dentro de ese tiempo (RF-22)
export const PRESESSION_CSRF_TTL_MS = 30 * 60_000;

// Emite el token CSRF que piden el registro y el login antes de tener sesión; solo se guarda su huella (RNF-06)
export class IssueCsrfTokenUseCase {
  constructor(
    private readonly tokens: TokenService,
    private readonly csrfTokens: CsrfTokenRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<string> {
    const token = this.tokens.randomToken();
    const expiresAt = new Date(this.clock.now().getTime() + PRESESSION_CSRF_TTL_MS);
    await this.csrfTokens.save(this.tokens.fingerprint(token), expiresAt);
    return token;
  }
}
