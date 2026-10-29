import type { User as UserRow } from '@prisma/client';

import { User } from '../domain/user.entity.js';

// Recurso User del contrato de la spec 002: nunca incluye la contraseña ni su huella (RNF-04)
export interface UserResponse {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export function toUserDomain(row: UserRow): User {
  return User.restore({
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
  });
}

export function toUserResponse(user: User): UserResponse {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt.toISOString() };
}

// Cuenta y token CSRF de la sesión: misma forma en el login y en GET /me (RF-24 de la 002, RF-01 de la 003)
export interface SessionUserResponse {
  user: UserResponse;
  csrfToken: string;
}

export function toSessionUserResponse(user: User, csrfToken: string): SessionUserResponse {
  return { user: toUserResponse(user), csrfToken };
}
