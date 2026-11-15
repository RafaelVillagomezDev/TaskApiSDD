import type { PasswordHasher } from '../domain/password-hasher.port.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { ConfirmPasswordUseCase } from './confirm-password.use-case.js';

export interface ChangePasswordInput {
  // Usuario y sesión de la petición: la sesión desde la que se cambia sigue abierta
  userId: string;
  sessionId: string;
  currentPassword: string;
  // Ya validada por el schema (RF-04); puede coincidir con la actual
  newPassword: string;
}

// Cambia la contraseña tras comprobar la actual y cierra todas las demás sesiones de la cuenta (RF-27, RF-28)
export class ChangePasswordUseCase {
  constructor(
    private readonly confirmPassword: ConfirmPasswordUseCase,
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: ChangePasswordInput): Promise<void> {
    const user = await this.confirmPassword.execute(input.userId, input.currentPassword);
    await this.users.updatePasswordHash(user.id, await this.passwordHasher.hash(input.newPassword));
    // Un token de acceso o un refresh token de las demás sesiones deja de valer al momento (RF-19, RF-14)
    await this.sessions.deleteAllExcept(user.id, input.sessionId);
  }
}
