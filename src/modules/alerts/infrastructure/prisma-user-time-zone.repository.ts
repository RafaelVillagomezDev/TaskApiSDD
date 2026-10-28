import type { PrismaClient } from '@prisma/client';

import type { UserTimeZone, UserTimeZoneRepository } from '../domain/user-time-zone.repository.js';

export class PrismaUserTimeZoneRepository implements UserTimeZoneRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // Upsert que solo escribe cuando la zona cambia: cada petición aceptada llega aquí (plan, 5.6)
  async record(userId: string, timeZone: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "user_time_zones" ("user_id", "time_zone", "updated_at")
      VALUES (${userId}::uuid, ${timeZone}, now())
      ON CONFLICT ("user_id") DO UPDATE SET "time_zone" = EXCLUDED."time_zone", "updated_at" = now()
      WHERE "user_time_zones"."time_zone" <> EXCLUDED."time_zone"`;
  }

  // Paginación por cursor sobre la clave primaria
  async listBatch(afterUserId: string | null, size: number): Promise<UserTimeZone[]> {
    return this.prisma.userTimeZone.findMany({
      where: afterUserId === null ? {} : { userId: { gt: afterUserId } },
      orderBy: { userId: 'asc' },
      take: size,
      select: { userId: true, timeZone: true },
    });
  }
}
