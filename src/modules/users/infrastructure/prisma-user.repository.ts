import { Prisma, type PrismaClient } from '@prisma/client';

import { AppError } from '../../../shared/domain/app.error.js';
import type { NewUser, User } from '../domain/user.entity.js';
import type { UserRepository } from '../domain/user.repository.js';
import { toUserDomain } from './user.mapper.js';

// Violación de una restricción única en Prisma
const UNIQUE_VIOLATION = 'P2002';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // El índice único de email cubre también la carrera entre dos registros simultáneos (RF-03)
  async create(user: NewUser): Promise<User> {
    try {
      return toUserDomain(await this.prisma.user.create({ data: user }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        throw new AppError('EMAIL_ALREADY_REGISTERED');
      }
      throw error;
    }
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toUserDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? toUserDomain(row) : null;
  }

  async updateName(id: string, name: string | null): Promise<User> {
    return toUserDomain(await this.prisma.user.update({ where: { id }, data: { name } }));
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  // Las claves foráneas en cascada borran los datos de la cuenta en el mismo DELETE (RF-29, D-9)
  async delete(id: string): Promise<void> {
    await this.prisma.user.deleteMany({ where: { id } });
  }
}
