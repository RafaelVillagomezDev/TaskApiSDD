import { PrismaClient } from '@prisma/client';

import { createTestUser, truncateTables } from '../../../../../tests/integration/test-database.helper.js';
import { PrismaUserTimeZoneRepository } from '../prisma-user-time-zone.repository.js';

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
    // Mismo orden que el de los UUID en PostgreSQL: hexadecimal en minúsculas
    const [a, b, c, d, e] = [...userIds].sort();
    const first = await repository.listBatch(null, 2);
    const second = await repository.listBatch(first.at(-1)!.userId, 2);
    const third = await repository.listBatch(second.at(-1)!.userId, 2);
    expect([first, second, third].map((batch) => batch.map((zone) => zone.userId))).toEqual([
      [a, b],
      [c, d],
      [e],
    ]);
    expect(first[0]).toEqual({ userId: a, timeZone: 'Europe/Madrid' });
    expect(await repository.listBatch(e, 2)).toEqual([]);
  });
});
