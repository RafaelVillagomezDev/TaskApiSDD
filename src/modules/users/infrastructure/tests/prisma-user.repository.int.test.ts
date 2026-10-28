import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { PrismaUserRepository } from '../prisma-user.repository.js';

const prisma = new PrismaClient();
const repository = new PrismaUserRepository(prisma);
// Emails únicos: `users` no se vacía por fichero porque se ejecutan en paralelo (R-12)
const uniqueEmail = () => `ana-${randomUUID()}@example.com`;
const newUser = (email = uniqueEmail()) => ({ email, name: 'Ana', passwordHash: '$argon2id$prueba' });

describe('PrismaUserRepository', () => {
  afterAll(() => prisma.$disconnect());

  it('crea la cuenta con id UUID de PostgreSQL y la encuentra por id y por email', async () => {
    const user = await repository.create(newUser());
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await repository.findById(user.id))?.email).toBe(user.email);
    expect((await repository.findByEmail(user.email))?.id).toBe(user.id);
    expect(await repository.findByEmail(uniqueEmail())).toBeNull();
  });

  it('un email repetido → EMAIL_ALREADY_REGISTERED gracias al índice único (RF-03)', async () => {
    const email = uniqueEmail();
    await repository.create(newUser(email));
    await expect(repository.create(newUser(email))).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
  });

  it('cambia el nombre y la huella de la contraseña', async () => {
    const user = await repository.create(newUser());
    expect((await repository.updateName(user.id, null)).name).toBeNull();
    await repository.updatePasswordHash(user.id, '$argon2id$otra');
    expect((await repository.findById(user.id))?.passwordHash).toBe('$argon2id$otra');
  });

  it('borrar la cuenta borra en cascada tareas, avisos, periodos, zona, sesiones y refresh tokens (RF-29, D-9)', async () => {
    const { id: userId } = await repository.create(newUser());
    const day = LocalDate.parse('2026-10-28').toUtcDate();
    await prisma.task.create({ data: { userId, title: 'Tarea', date: day } });
    await prisma.alert.create({ data: { userId, type: 'daily', periodStart: day, periodEnd: day, tasks: [] } });
    await prisma.alertPeriodCheck.create({ data: { userId, type: 'daily', periodStart: day } });
    await prisma.userTimeZone.create({ data: { userId, timeZone: 'Europe/Madrid' } });
    const session = await prisma.session.create({
      data: {
        userId,
        accessTokenHash: 'a'.repeat(64),
        csrfTokenHash: 'c'.repeat(64),
        accessExpiresAt: new Date(),
        refreshExpiresAt: new Date(),
        expiresAt: new Date(),
        refreshTokens: { create: { tokenHash: 'b'.repeat(64), generation: 0 } },
      },
    });

    await repository.delete(userId);

    const where = { where: { userId } };
    expect(await prisma.user.count({ where: { id: userId } })).toBe(0);
    expect(await prisma.task.count(where)).toBe(0);
    expect(await prisma.alert.count(where)).toBe(0);
    expect(await prisma.alertPeriodCheck.count(where)).toBe(0);
    expect(await prisma.userTimeZone.count(where)).toBe(0);
    expect(await prisma.session.count(where)).toBe(0);
    expect(await prisma.refreshToken.count({ where: { sessionId: session.id } })).toBe(0);
  });

  it('no puede existir una tarea sin cuenta: la clave foránea la rechaza (RF-33)', async () => {
    await expect(
      prisma.task.create({
        data: { userId: randomUUID(), title: 'Huérfana', date: LocalDate.parse('2026-10-28').toUtcDate() },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});
