import { AppError } from '../../../shared/domain/app.error.js';
import type { PasswordHasher } from '../domain/password-hasher.port.js';
import type { User } from '../domain/user.entity.js';
import type { UserRepository } from '../domain/user.repository.js';

export interface RegisterUserInput {
  // Ya recortado y en minúsculas por el schema (RF-03)
  email: string;
  password: string;
  name: string | null;
}

// Crea la cuenta sin abrir sesión: para entrar hay que iniciar sesión (RF-01, RF-03, RF-06)
export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: RegisterUserInput): Promise<User> {
    if (await this.users.findByEmail(input.email)) {
      throw new AppError('EMAIL_ALREADY_REGISTERED');
    }
    const passwordHash = await this.passwordHasher.hash(input.password);
    // Si otro registro gana la carrera, el repositorio también responde EMAIL_ALREADY_REGISTERED
    return this.users.create({ email: input.email, name: input.name, passwordHash });
  }
}
