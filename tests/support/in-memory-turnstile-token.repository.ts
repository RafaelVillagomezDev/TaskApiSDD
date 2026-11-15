import type { TurnstileTokenRepository } from '../../src/modules/users/domain/turnstile-token.repository.js';

// Implementación en memoria de TurnstileTokenRepository, con la misma semántica que la de Prisma: una reserva
// caducada cuenta como libre (plan de la 005, D-3). JavaScript no intercala dos `reserve` en memoria, así que
// también es atómica
export class InMemoryTurnstileTokenRepository implements TurnstileTokenRepository {
  private readonly tokens = new Map<string, Date>();

  async reserve(tokenHash: string, now: Date, expiresAt: Date): Promise<boolean> {
    const current = this.tokens.get(tokenHash);
    if (current !== undefined && current.getTime() > now.getTime()) {
      return false;
    }
    this.tokens.set(tokenHash, expiresAt);
    return true;
  }

  async deleteExpired(now: Date): Promise<void> {
    for (const [hash, expiresAt] of this.tokens) {
      if (expiresAt.getTime() <= now.getTime()) this.tokens.delete(hash);
    }
  }

  // Ayuda para los tests: huellas reservadas
  hashes(): string[] {
    return [...this.tokens.keys()];
  }
}
