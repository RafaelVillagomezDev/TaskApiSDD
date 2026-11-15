import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { LoginThrottle } from '../../domain/login-throttle.value-object.js';
import { PrismaLoginAttemptRepository } from '../prisma-login-attempt.repository.js';

const prisma = new PrismaClient();
const repository = new PrismaLoginAttemptRepository(prisma);
const at = (time: string) => new Date(`2026-10-28T${time}Z`);
// Emails únicos: la tabla la comparten los tests de este fichero y la limpieza borra por condiciones
const uniqueEmail = () => `fallos-${randomUUID()}@example.com`;

describe('PrismaLoginAttemptRepository', () => {
  afterAll(() => prisma.$disconnect());

  it('sin registro devuelve un bloqueo vacío', async () => {
    const throttle = await repository.find(uniqueEmail());
    expect(throttle.failedAt).toEqual([]);
    expect(throttle.lockedUntil).toBeNull();
  });

  it('guarda y lee los fallos y el bloqueo, y los vuelve a guardar sobre el mismo email (RF-09)', async () => {
    const email = uniqueEmail();
    const twoFailures = LoginThrottle.empty().registerFailure(at('10:00:00')).registerFailure(at('10:01:00'));
    await repository.save(email, twoFailures);
    expect((await repository.find(email)).failedAt.map((date) => date.toISOString())).toEqual([
      '2026-10-28T10:00:00.000Z',
      '2026-10-28T10:01:00.000Z',
    ]);

    const locked = ['10:02:00', '10:03:00', '10:04:00'].reduce(
      (throttle, time) => throttle.registerFailure(at(time)),
      twoFailures,
    );
    await repository.save(email, locked);
    expect((await repository.find(email)).lockedUntil?.toISOString()).toBe('2026-10-28T10:19:00.000Z');
  });

  it('clear borra el registro (RF-10)', async () => {
    const email = uniqueEmail();
    await repository.save(email, LoginThrottle.empty().registerFailure(at('10:00:00')));
    await repository.clear(email);
    expect((await repository.find(email)).failedAt).toEqual([]);
  });

  it('la limpieza solo borra los registros sin bloqueo vigente ni fallos en la ventana (D-12)', async () => {
    const [old, recent, locked] = [uniqueEmail(), uniqueEmail(), uniqueEmail()];
    await repository.save(old, LoginThrottle.restore([at('09:00:00')], null));
    await repository.save(recent, LoginThrottle.restore([at('09:50:00')], null));
    await repository.save(locked, LoginThrottle.restore([], at('10:10:00')));

    await repository.deleteStale(at('10:00:00'));

    expect(await prisma.loginAttempt.count({ where: { email: { in: [old, recent, locked] } } })).toBe(2);
    expect(await prisma.loginAttempt.count({ where: { email: old } })).toBe(0);
  });
});
