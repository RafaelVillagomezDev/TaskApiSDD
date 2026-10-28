import { randomUUID } from 'node:crypto';

import { type NewUser, User, type UserProps } from '../../src/modules/users/domain/user.entity.js';
import type { UserRepository } from '../../src/modules/users/domain/user.repository.js';
import { AppError } from '../../src/shared/domain/app.error.js';

// Implementación en memoria de UserRepository para tests unitarios y HTTP (plan de la 001, D-21)
export class InMemoryUserRepository implements UserRepository {
  private readonly rows = new Map<string, UserProps>();
  // Instantes de alta crecientes y deterministas
  private sequence = 0;

  async create(user: NewUser): Promise<User> {
    if ([...this.rows.values()].some((row) => row.email === user.email)) {
      throw new AppError('EMAIL_ALREADY_REGISTERED');
    }
    const props: UserProps = {
      ...user,
      id: randomUUID(),
      createdAt: new Date(Date.UTC(2026, 9, 28) + this.sequence++ * 1000),
    };
    this.rows.set(props.id, props);
    return User.restore(props);
  }

  async findById(id: string): Promise<User | null> {
    const row = this.rows.get(id);
    return row ? User.restore(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = [...this.rows.values()].find((candidate) => candidate.email === email);
    return row ? User.restore(row) : null;
  }

  async updateName(id: string, name: string | null): Promise<User> {
    const row = this.require(id);
    row.name = name;
    return User.restore(row);
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    this.require(id).passwordHash = passwordHash;
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  // Ayuda para los tests: número de cuentas
  count(): number {
    return this.rows.size;
  }

  private require(id: string): UserProps {
    const row = this.rows.get(id);
    if (!row) throw new Error(`Cuenta ${id} inexistente en el repositorio en memoria`);
    return row;
  }
}
