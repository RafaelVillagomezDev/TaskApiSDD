import { AppError } from '../../../shared/domain/app.error.js';
import type { SecretCipher } from '../domain/secret-cipher.port.js';
import type { SessionRepository } from '../domain/session.repository.js';

// Devuelve el token CSRF de la sesión, el mismo que entregó el login, a partir de su copia cifrada
// (RF-01 y RF-02 de la 003; plan de la 003 §5.2, D-5)
export class GetSessionCsrfTokenUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly cipher: SecretCipher,
  ) {}

  async execute(sessionId: string): Promise<string> {
    const record = await this.sessions.findById(sessionId);
    // Solo ocurre si la sesión se cerró entre el middleware de sesión y esta consulta (RF-19 de la 002)
    if (!record) {
      throw new AppError('INVALID_TOKEN');
    }
    // Una copia que no se abre (clave cambiada sin cerrar las sesiones) es un error interno (D-4)
    return this.cipher.open(record.csrfTokenSealed);
  }
}
