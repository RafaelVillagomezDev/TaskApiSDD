import { AppError } from '../../../shared/domain/app.error.js';
import type { User } from '../domain/user.entity.js';
import type { UserRepository } from '../domain/user.repository.js';

// Cambia el nombre visible de la cuenta de la sesión; el email y la contraseña no se tocan (RF-05, RF-26)
export class UpdateProfileUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string, name: string | null): Promise<User> {
    const user = await this.users.findById(userId);
    // Borrar la cuenta borra sus sesiones en cascada: solo ocurre si se borró durante la petición (RF-19)
    if (!user) {
      throw new AppError('INVALID_TOKEN');
    }
    // La entidad recorta el nombre y guarda el vacío como null
    user.rename(name);
    return this.users.updateName(user.id, user.name);
  }
}
