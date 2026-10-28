import { PrismaClient } from '@prisma/client';

import { createTestUser, truncateTables } from '../../../../../tests/integration/test-database.helper.js';
import type { UserTimeZone } from '../../domain/user-time-zone.repository.js';
import { PrismaUserTimeZoneRepository } from '../prisma-user-time-zone.repository.js';

// Lotes pequeños para recorrer varios con pocas zonas, y un tope para que un fallo del cursor no deje el test colgado
const BATCH_SIZE = 2;
const MAX_BATCHES = 100;

const prisma = new PrismaClient();
const repository = new PrismaUserTimeZoneRepository(prisma);
const storedAt = async (userId: string) => (await prisma.userTimeZone.findUnique({ where: { userId } }))?.updatedAt;

describe('PrismaUserTimeZoneRepository', () => {
  // Solo su tabla: los ficheros de integración se ejecutan en paralelo
  let user1: string;

  beforeEach(async () => {
    await truncateTables(prisma, ['user_time_zones']);
    user1 = await createTestUser(prisma);
  });
  afterAll(() => prisma.$disconnect());

  it('record guarda la zona de un usuario nuevo (RF-34)', async () => {
    await repository.record(user1, 'Europe/Madrid');
    expect(await prisma.userTimeZone.findUnique({ where: { userId: user1 } })).toMatchObject({
      timeZone: 'Europe/Madrid',
    });
  });

  it('record no escribe si la zona no cambia (RF-34)', async () => {
    await repository.record(user1, 'Europe/Madrid');
    const before = await storedAt(user1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await repository.record(user1, 'Europe/Madrid');
    expect((await storedAt(user1))?.getTime()).toBe(before?.getTime());
  });

  it('record actualiza la zona y su fecha cuando cambia (RF-34)', async () => {
    await repository.record(user1, 'Europe/Madrid');
    const before = await storedAt(user1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await repository.record(user1, 'America/New_York');
    const row = await prisma.userTimeZone.findUnique({ where: { userId: user1 } });
    expect(row?.timeZone).toBe('America/New_York');
    expect(row!.updatedAt.getTime()).toBeGreaterThan(before!.getTime());
  });

  it('listBatch recorre los usuarios con zona por lotes, en orden de usuario (RF-36)', async () => {
    const userIds: string[] = [];
    for (let index = 0; index < 5; index++) {
      userIds.push(await createTestUser(prisma));
    }
    for (const userId of userIds) {
      await repository.record(userId, 'Europe/Madrid');
    }
    // Recorre la tabla entera por lotes, como el planificador. Otros ficheros de integración escriben zonas en
    // paralelo (prisma-user.repository.int.test.ts), así que se comprueba el recorrido y solo las zonas propias
    const batches: UserTimeZone[][] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_BATCHES; page++) {
      const batch = await repository.listBatch(cursor, BATCH_SIZE);
      if (batch.length === 0) break;
      batches.push(batch);
      cursor = batch[batch.length - 1]?.userId ?? null;
    }
    const visited = batches.flat();

    expect(batches.every((batch) => batch.length <= BATCH_SIZE)).toBe(true);
    // Orden estrictamente creciente de UUID (hexadecimal en minúsculas): ninguna zona se repite ni se salta
    expect(visited.map((zone) => zone.userId)).toEqual([...new Set(visited.map((zone) => zone.userId))].sort());
    const own = visited.filter((zone) => userIds.includes(zone.userId));
    expect(own).toEqual([...userIds].sort().map((userId) => ({ userId, timeZone: 'Europe/Madrid' })));
    expect(await repository.listBatch(cursor, BATCH_SIZE)).toEqual([]);
  });
});
