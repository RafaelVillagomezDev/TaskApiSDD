import { PrismaClient } from '@prisma/client';

import { createTestUser, truncateTables } from '../../../../../tests/integration/test-database.helper.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { PrismaAchievementRepository } from '../prisma-achievement.repository.js';

const prisma = new PrismaClient();
const repository = new PrismaAchievementRepository(prisma);
const MINUTE = 60_000;
const START = new Date('2026-11-08T09:00:00Z');
const at = (minutes: number) => new Date(START.getTime() + minutes * MINUTE);

describe('PrismaAchievementRepository', () => {
  let userId: string;

  beforeEach(async () => {
    // Solo su tabla: pomodoros y pomodoro_tasks las usa también prisma-pomodoro.repository.int.test.ts, que se
    // ejecuta en paralelo. Las estadísticas son por usuario y cada test crea el suyo, así que no hace falta vaciarlas
    await truncateTables(prisma, ['pomodoro_achievements']);
    userId = await createTestUser(prisma, 'logros');
  });
  afterAll(() => prisma.$disconnect());

  // Sesión terminada guardada directamente, con el motivo, el día y la concentración indicados
  const finished = (finishedOn: string, endReason: 'time' | 'manual', focusedSeconds: number, owner = userId) =>
    prisma.pomodoro.create({
      data: {
        userId: owner,
        durationMinutes: 25,
        status: 'finished',
        startedAt: START,
        finishedAt: at(25),
        finishedOn: new Date(`${finishedOn}T00:00:00Z`),
        endReason,
        focusedSeconds,
      },
    });

  it('sin actividad: cada estadística a cero (RF-19)', async () => {
    expect(await repository.stats(userId)).toEqual({
      timedSessions: 0,
      bestDaySessions: 0,
      completedTasks: 0,
      focusedSeconds: 0,
      productiveDates: [],
    });
  });

  it('cuenta las sesiones por tiempo, el mejor día y los días productivos (RF-38, RF-43, RF-45)', async () => {
    await finished('2026-11-06', 'time', 1500);
    await finished('2026-11-06', 'time', 1500);
    await finished('2026-11-06', 'manual', 600);
    await finished('2026-11-07', 'time', 1500);
    const stats = await repository.stats(userId);
    expect(stats).toMatchObject({ timedSessions: 3, bestDaySessions: 2 });
    expect(stats.productiveDates.map((day) => day.toString())).toEqual(['2026-11-06', '2026-11-07']);
  });

  it('suma la concentración de todas las terminadas, por tiempo o a mano (RF-47)', async () => {
    await finished('2026-11-06', 'time', 1500);
    await finished('2026-11-06', 'manual', 600);
    expect((await repository.stats(userId)).focusedSeconds).toBe(2100);
  });

  it('cuenta cada tarea completada una vez (RF-46)', async () => {
    const pomodoro = await finished('2026-11-06', 'time', 1500);
    const task = (completed: boolean) => ({
      userId,
      pomodoroId: pomodoro.id,
      title: 'Tarea',
      date: new Date('2026-11-06T00:00:00Z'),
      completed,
      completedAt: completed ? at(5) : null,
    });
    await prisma.pomodoroTask.createMany({ data: [task(true), task(true), task(false)] });
    expect((await repository.stats(userId)).completedTasks).toBe(2);
  });

  it('no mezcla los datos de otros usuarios (RF-01)', async () => {
    const other = await createTestUser(prisma, 'otro');
    await finished('2026-11-06', 'time', 1500, other);
    expect((await repository.stats(userId)).timedSessions).toBe(0);
  });

  it('unlock guarda los logros y no cambia el instante de los ya conseguidos (RF-44)', async () => {
    await repository.unlock(userId, ['FIRST_POMODORO'], at(1));
    await repository.unlock(userId, ['FIRST_POMODORO', 'SESSIONS_10'], at(30));
    const unlocked = await repository.listUnlocked(userId);
    expect(new Map(unlocked.map((row) => [row.code, row.unlockedAt]))).toEqual(
      new Map([
        ['FIRST_POMODORO', at(1)],
        ['SESSIONS_10', at(30)],
      ]),
    );
    await expect(repository.unlock(userId, [], at(40))).resolves.toBeUndefined();
  });

  it('productiveDates devuelve LocalDate sin desplazar el día', async () => {
    await finished('2026-12-31', 'time', 1500);
    expect((await repository.stats(userId)).productiveDates).toEqual([LocalDate.parse('2026-12-31')]);
  });
});
