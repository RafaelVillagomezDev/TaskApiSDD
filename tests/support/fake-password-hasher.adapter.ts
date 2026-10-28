import type { PasswordHasher } from '../../src/modules/users/domain/password-hasher.port.js';

// PasswordHasher instantáneo para tests unitarios y HTTP; el de Argon2id se prueba aparte (plan de la 002, §10)
export class FakePasswordHasher implements PasswordHasher {
  // Ayuda para los tests: veces que se ha usado la verificación ficticia (D-3)
  dummyVerifications = 0;

  async hash(password: string): Promise<string> {
    return `fake$${password}`;
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    return passwordHash === `fake$${password}`;
  }

  async verifyDummy(_password: string): Promise<boolean> {
    this.dummyVerifications++;
    return false;
  }
}
