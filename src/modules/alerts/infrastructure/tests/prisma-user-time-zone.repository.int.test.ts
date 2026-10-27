import { PrismaClient } from '@prisma/client';

import { truncateTables } from '../../../../../tests/integration/test-database.helper.js';
import { PrismaUserTimeZoneRepository } from '../prisma-user-time-zone.repository.js';

const prisma = new PrismaClient();
const repository = new PrismaUserTimeZoneRepository(prisma);
const storedAt = async (userId: string) => (await prisma.userTimeZone.findUnique({ where: { userId } }))?.updatedAt;

describe('PrismaUserTimeZoneRepository', () => {
  // Solo su tabla: los ficheros de integración se ejecutan en paralelo
  beforeEach(() => truncateTables(prisma, ['user_time_zones']));
  afterAll(() => prisma.$disconnect());

  it('record guarda la zona de un usuario nuevo (RF-34)', async () => {
    await repository.record('user-1', 'Europe/Madrid');
    expect(await prisma.userTimeZone.findUnique({ where: { userId: 'user-1' } })).toMatchObject({
      timeZone: 'Europe/Madrid',
    });
  });

  it('record no escribe si la zona no cambia (RF-34)', async () => {
    await repository.record('user-1', 'Europe/Madrid');
    const before = await storedAt('user-1');
    await new Promise((resolve) => setTimeout(resolve, 20));
    await repository.record('user-1', 'Europe/Madrid');
    expect((await storedAt('user-1'))?.getTime()).toBe(before?.getTime());
  });

  it('record actualiza la zona y su fecha cuando cambia (RF-34)', async () => {
    await repository.record('user-1', 'Europe/Madrid');
    const before = await storedAt('user-1');
    await new Promise((resolve) => setTimeout(resolve, 20));
    await repository.record('user-1', 'America/New_York');
    const row = await prisma.userTimeZone.findUnique({ where: { userId: 'user-1' } });
    expect(row?.timeZone).toBe('America/New_York');
    expect(row!.updatedAt.getTime()).toBeGreaterThan(before!.getTime());
  });

  it('listBatch recorre los usuarios con zona por lotes, en orden de usuario (RF-36)', async () => {
    for (const userId of ['user-c', 'user-a', 'user-e', 'user-b', 'user-d']) {
      await repository.record(userId, 'Europe/Madrid');
    }
    const first = await repository.listBatch(null, 2);
    const second = await repository.listBatch(first.at(-1)!.userId, 2);
    const third = await repository.listBatch(second.at(-1)!.userId, 2);
    expect([first, second, third].map((batch) => batch.map((zone) => zone.userId))).toEqual([
      ['user-a', 'user-b'],
      ['user-c', 'user-d'],
      ['user-e'],
    ]);
    expect(first[0]).toEqual({ userId: 'user-a', timeZone: 'Europe/Madrid' });
    expect(await repository.listBatch('user-e', 2)).toEqual([]);
  });
});
