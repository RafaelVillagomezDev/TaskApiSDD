import { AppError } from '../../../shared/domain/app.error.js';
import type { TokenService } from '../domain/token.port.js';

// Compara el X-CSRF-Token con el token CSRF de la sesión, que no cambia en toda la sesión (RF-23, RF-24).
// Solo se llama cuando ya hay sesión: sin ella gana el error de sesión (decisión 19)
export class VerifySessionCsrfUseCase {
  constructor(private readonly tokens: TokenService) {}

  execute(csrfToken: string, sessionCsrfTokenHash: string): void {
    if (!this.matches(csrfToken, sessionCsrfTokenHash)) {
      throw new AppError('INVALID_CSRF_TOKEN');
    }
  }

  // Huellas en tiempo constante, para no revelar por el tiempo cuánto coincide (R-6)
  matches(csrfToken: string, sessionCsrfTokenHash: string): boolean {
    return this.tokens.equals(this.tokens.fingerprint(csrfToken), sessionCsrfTokenHash);
  }
}
