import type { PrismaClient } from '@prisma/client';

import type { LoginAttemptRepository } from '../domain/login-attempt.repository.js';
import { FAILURE_WINDOW_MS, LoginThrottle } from '../domain/login-throttle.value-object.js';

export class PrismaLoginAttemptRepository implements LoginAttemptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(email: string): Promise<LoginThrottle> {
    const row = await this.prisma.loginAttempt.findUnique({ where: { email } });
    return row ? LoginThrottle.restore(row.failedAt, row.lockedUntil) : LoginThrottle.empty();
  }

  async save(email: string, throttle: LoginThrottle): Promise<void> {
    const data = { failedAt: [...throttle.failedAt], lockedUntil: throttle.lockedUntil };
    await this.prisma.loginAttempt.upsert({ where: { email }, create: { email, ...data }, update: data });
  }

  async clear(email: string): Promise<void> {
    await this.prisma.loginAttempt.deleteMany({ where: { email } });
  }

  // Misma condición que LoginThrottle.isStale, en SQL: sin bloqueo vigente ni fallos dentro de la ventana
  async deleteStale(now: Date): Promise<void> {
    const windowStart = new Date(now.getTime() - FAILURE_WINDOW_MS);
    await this.prisma.$executeRaw`
      DELETE FROM "login_attempts"
      WHERE ("locked_until" IS NULL OR "locked_until" <= ${now})
        AND NOT EXISTS (SELECT 1 FROM unnest("failed_at") AS failure WHERE failure > ${windowStart})`;
  }
}
