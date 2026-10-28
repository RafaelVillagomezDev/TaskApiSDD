import type { NewUser, User } from './user.entity.js';

// Puerto de salida de cuentas
export interface UserRepository {
  // Si el email ya existe lanza EMAIL_ALREADY_REGISTERED, también en una carrera entre dos registros (RF-03)
  create(user: NewUser): Promise<User>;
  findById(id: string): Promise<User | null>;
  // Recibe el email ya normalizado (recortado y en minúsculas)
  findByEmail(email: string): Promise<User | null>;
  updateName(id: string, name: string | null): Promise<User>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  // Borra la cuenta y, en cascada, todos sus datos (RF-29, D-9)
  delete(id: string): Promise<void>;
}
