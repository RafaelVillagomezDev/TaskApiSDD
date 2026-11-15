import type { PrismaClient } from '@prisma/client';

import type { TurnstileTokenRepository } from '../domain/turnstile-token.repository.js';

// Una sola fila afectada: el token se ha reservado en esta petición
const RESERVED_ROWS = 1;

export class PrismaTurnstileTokenRepository implements TurnstileTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // Una sola sentencia atómica (plan de la 005, D-3): inserta la huella o, si ya existe con la reserva caducada,
  // la renueva. Con una reserva vigente no toca la fila y afecta a 0 filas, también con peticiones simultáneas.
  // Plantilla etiquetada: los valores viajan como parámetros enlazados (AGENTS.md §8)
  async reserve(tokenHash: string, now: Date, expiresAt: Date): Promise<boolean> {
    const affectedRows = await this.prisma.$executeRaw`
      INSERT INTO "turnstile_tokens" ("token_hash", "expires_at")
      VALUES (${tokenHash}, ${expiresAt})
      ON CONFLICT ("token_hash") DO UPDATE SET "expires_at" = EXCLUDED."expires_at"
      WHERE "turnstile_tokens"."expires_at" <= ${now}`;
    return affectedRows === RESERVED_ROWS;
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.prisma.turnstileToken.deleteMany({ where: { expiresAt: { lte: now } } });
  }
}
