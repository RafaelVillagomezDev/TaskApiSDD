import { AppError } from '../../../shared/domain/app.error.js';
import type { PasswordHasher } from '../domain/password-hasher.port.js';
import type { User } from '../domain/user.entity.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { VerifyTurnstileUseCase } from './verify-turnstile.use-case.js';

export interface RegisterUserInput {
  // Ya recortado y en minúsculas por el schema (RF-03)
  email: string;
  password: string;
  name: string | null;
  // Token de Cloudflare Turnstile; solo falta en el modo opcional (RF-15 de la 005)
  turnstileToken?: string;
}

// Crea la cuenta sin abrir sesión: para entrar hay que iniciar sesión (RF-01, RF-03, RF-06). Si llega un token de
// Turnstile, lo verifica antes de mirar el email (RF-04 y RF-13 de la 005; plan de la 005, D-1)
export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly verifyTurnstile: Pick<VerifyTurnstileUseCase, 'execute'>,
  ) {}

  async execute(input: RegisterUserInput): Promise<User> {
    // Antes de buscar el email: un rechazo no revela si ya existe una cuenta
    if (input.turnstileToken !== undefined) {
      await this.verifyTurnstile.execute({ token: input.turnstileToken, action: 'register' });
    }
    if (await this.users.findByEmail(input.email)) {
      throw new AppError('EMAIL_ALREADY_REGISTERED');
    }
    const passwordHash = await this.passwordHasher.hash(input.password);
    // Si otro registro gana la carrera, el repositorio también responde EMAIL_ALREADY_REGISTERED
    return this.users.create({ email: input.email, name: input.name, passwordHash });
  }
}
