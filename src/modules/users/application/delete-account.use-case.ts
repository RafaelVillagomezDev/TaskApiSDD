import type { LoginAttemptRepository } from '../domain/login-attempt.repository.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { ConfirmPasswordUseCase } from './confirm-password.use-case.js';

// Borra la cuenta tras comprobar su contraseña. La base de datos borra en cascada sus tareas, avisos,
// comprobaciones de periodo, zona, sesiones y refresh tokens (RF-28, RF-29; plan de la 002 §5.8, D-9)
export class DeleteAccountUseCase {
  constructor(
    private readonly confirmPassword: ConfirmPasswordUseCase,
    private readonly users: UserRepository,
    private readonly loginAttempts: LoginAttemptRepository,
  ) {}

  async execute(userId: string, password: string): Promise<void> {
    const user = await this.confirmPassword.execute(userId, password);
    await this.users.delete(user.id);
    // El registro de intentos va por email y no cae en cascada: una cuenta nueva con ese email empieza de cero
    await this.loginAttempts.clear(user.email);
  }
}
