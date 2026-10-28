import type { Clock } from '../../../shared/domain/clock.port.js';
import { AppError } from '../../../shared/domain/app.error.js';
import type { LoginAttemptRepository } from '../domain/login-attempt.repository.js';
import type { PasswordHasher } from '../domain/password-hasher.port.js';
import { Session } from '../domain/session.entity.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { TokenService } from '../domain/token.port.js';
import type { User } from '../domain/user.entity.js';
import type { UserRepository } from '../domain/user.repository.js';

export interface LoginInput {
  // Ya recortado y en minúsculas por el schema (RF-03)
  email: string;
  password: string;
}

export interface LoginResult {
  user: User;
  session: Session;
  // Solo viajan en cookies (RNF-05)
  accessToken: string;
  refreshToken: string;
  // Token CSRF de la sesión, en el cuerpo de la respuesta (RF-24)
  csrfToken: string;
}

// Inicia sesión con bloqueo por fuerza bruta, sin revelar si el email existe (RF-07 a RF-10, RF-16, RF-24)
export class LoginUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly loginAttempts: LoginAttemptRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const now = this.clock.now();
    const throttle = await this.loginAttempts.find(input.email);
    // Bloqueado, ni se comprueba la contraseña ni cuenta otro fallo (RF-09)
    if (throttle.isLocked(now)) {
      throw new AppError('TOO_MANY_ATTEMPTS');
    }
    const user = await this.verifyCredentials(input);
    if (!user) {
      await this.loginAttempts.save(input.email, throttle.registerFailure(now));
      throw new AppError('INVALID_CREDENTIALS');
    }
    await this.loginAttempts.clear(input.email);
    return this.openSession(user, now);
  }

  // Con un email inexistente verifica contra el hash ficticio, para gastar el mismo tiempo (RF-08, D-3)
  private async verifyCredentials(input: LoginInput): Promise<User | null> {
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      await this.passwordHasher.verifyDummy(input.password);
      return null;
    }
    return (await this.passwordHasher.verify(input.password, user.passwordHash)) ? user : null;
  }

  // Tres tokens aleatorios; en la base de datos solo sus huellas (RNF-06)
  private async openSession(user: User, now: Date): Promise<LoginResult> {
    const accessToken = this.tokens.randomToken();
    const refreshToken = this.tokens.randomToken();
    const csrfToken = this.tokens.randomToken();
    const session = await this.sessions.create({
      userId: user.id,
      accessTokenHash: this.tokens.fingerprint(accessToken),
      refreshTokenHash: this.tokens.fingerprint(refreshToken),
      csrfTokenHash: this.tokens.fingerprint(csrfToken),
      schedule: Session.schedule(now),
      now,
    });
    return { user, session, accessToken, refreshToken, csrfToken };
  }
}
