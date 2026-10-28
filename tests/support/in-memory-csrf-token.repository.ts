import type { CsrfTokenRepository } from '../../src/modules/users/domain/csrf-token.repository.js';

// Implementación en memoria de CsrfTokenRepository (plan de la 001, D-21)
export class InMemoryCsrfTokenRepository implements CsrfTokenRepository {
  private readonly tokens = new Map<string, Date>();

  async save(tokenHash: string, expiresAt: Date): Promise<void> {
    this.tokens.set(tokenHash, expiresAt);
  }

  async isValid(tokenHash: string, now: Date): Promise<boolean> {
    const expiresAt = this.tokens.get(tokenHash);
    return expiresAt !== undefined && now.getTime() < expiresAt.getTime();
  }

  async deleteExpired(now: Date): Promise<void> {
    for (const [hash, expiresAt] of this.tokens) {
      if (expiresAt.getTime() <= now.getTime()) this.tokens.delete(hash);
    }
  }

  // Ayuda para los tests: huellas guardadas
  hashes(): string[] {
    return [...this.tokens.keys()];
  }
}
