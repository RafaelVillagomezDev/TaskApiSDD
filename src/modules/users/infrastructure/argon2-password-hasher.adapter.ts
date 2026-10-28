import { randomBytes } from 'node:crypto';

import { argon2id, hash, verify } from 'argon2';

import type { PasswordHasher } from '../domain/password-hasher.port.js';

// Argon2id con los parámetros mínimos de OWASP: 19 MiB, 2 pasadas, paralelismo 1 (plan de la 002, D-2).
// La cadena PHC resultante incluye los parámetros, así que se pueden endurecer sin migrar los datos
const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export class Argon2PasswordHasher implements PasswordHasher {
  // Huella de una contraseña aleatoria que nadie conoce (D-3). Se calcula la primera vez que hace falta y
  // se reutiliza: un constructor no debe lanzar operaciones asíncronas (regla S7059 de SonarQube)
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  // La librería compara en tiempo constante
  verify(password: string, passwordHash: string): Promise<boolean> {
    return verify(passwordHash, password);
  }

  // Mismo coste que una verificación real, para no revelar por el tiempo si el email existe (RF-08)
  async verifyDummy(password: string): Promise<boolean> {
    await verify(await this.getDummyHash(), password);
    return false;
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hash(randomBytes(32).toString('base64url'), ARGON2_OPTIONS);
    return this.dummyHash;
  }
}
