import type { PrismaClient } from '@prisma/client';

import type { CsrfTokenRepository } from '../domain/csrf-token.repository.js';

export class PrismaCsrfTokenRepository implements CsrfTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.csrfToken.create({ data: { tokenHash, expiresAt } });
  }

  async isValid(tokenHash: string, now: Date): Promise<boolean> {
    return (await this.prisma.csrfToken.count({ where: { tokenHash, expiresAt: { gt: now } } })) > 0;
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.prisma.csrfToken.deleteMany({ where: { expiresAt: { lte: now } } });
  }
}
