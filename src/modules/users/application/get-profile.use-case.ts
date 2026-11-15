import { AppError } from '../../../shared/domain/app.error.js';
import type { User } from '../domain/user.entity.js';
import type { UserRepository } from '../domain/user.repository.js';

// Perfil del usuario de la sesión (RF-25)
export class GetProfileUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    // Borrar la cuenta borra sus sesiones en cascada: solo ocurre si se borró durante la petición (RF-19)
    if (!user) {
      throw new AppError('INVALID_TOKEN');
    }
    return user;
  }
}
