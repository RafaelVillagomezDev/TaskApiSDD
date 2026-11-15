import type { Clock } from '../../../shared/domain/clock.port.js';
import { AppError } from '../../../shared/domain/app.error.js';
import type { LoginAttemptRepository } from '../domain/login-attempt.repository.js';
import type { PasswordHasher } from '../domain/password-hasher.port.js';
import type { User } from '../domain/user.entity.js';
import type { UserRepository } from '../domain/user.repository.js';

// Comprueba la contraseña de la cuenta de la sesión antes de cambiarla o de borrar la cuenta, con el mismo
// bloqueo que el login: los fallos cuentan por el email de la cuenta (RF-09, RF-28; plan de la 002 §5.7 y §5.8)
export class ConfirmPasswordUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly loginAttempts: LoginAttemptRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, password: string): Promise<User> {
    const user = await this.users.findById(userId);
    // Borrar la cuenta borra sus sesiones en cascada: solo ocurre si se borró durante la petición (RF-19)
    if (!user) {
      throw new AppError('INVALID_TOKEN');
    }
    const now = this.clock.now();
    const throttle = await this.loginAttempts.find(user.email);
    // Bloqueada, ni se comprueba la contraseña ni cuenta otro fallo (RF-09)
    if (throttle.isLocked(now)) {
      throw new AppError('TOO_MANY_ATTEMPTS');
    }
    if (!(await this.passwordHasher.verify(password, user.passwordHash))) {
      await this.loginAttempts.save(user.email, throttle.registerFailure(now));
      throw new AppError('WRONG_PASSWORD');
    }
    return user;
  }
}
