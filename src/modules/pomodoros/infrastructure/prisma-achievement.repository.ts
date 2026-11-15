import type { Prisma } from '@prisma/client';

import { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import type { AchievementRepository, AchievementStats, UnlockedAchievement } from '../domain/achievement.repository.js';

// Funciona igual con el cliente de Prisma que con una transacción: dentro de la de un cambio de sesión o de
// tarea, sus estadísticas ven ese cambio aún sin confirmar (plan, 5.9)
export class PrismaAchievementRepository implements AchievementRepository {
  constructor(private readonly prisma: Prisma.TransactionClient) {}

  // Un agregado por estadística, cada uno sobre su índice (plan, sección 4)
  async stats(userId: string): Promise<AchievementStats> {
    const timedSessions = await this.prisma.pomodoro.count({ where: { userId, endReason: 'time' } });
    const [bestDay] = await this.prisma.$queryRaw<{ sessions: number }[]>`
      SELECT COALESCE(MAX("day_sessions"), 0)::int AS "sessions" FROM (
        SELECT COUNT(*) AS "day_sessions" FROM "pomodoros"
        WHERE "user_id" = ${userId}::uuid AND "end_reason" = 'time'
        GROUP BY "finished_on"
      ) AS "days"`;
    const completedTasks = await this.prisma.pomodoroTask.count({ where: { userId, completed: true } });
    const focus = await this.prisma.pomodoro.aggregate({
      where: { userId, status: 'finished' },
      _sum: { focusedSeconds: true },
    });
    const days = await this.prisma.$queryRaw<{ finished_on: Date }[]>`
      SELECT DISTINCT "finished_on" FROM "pomodoros"
      WHERE "user_id" = ${userId}::uuid AND "end_reason" = 'time'
      ORDER BY "finished_on"`;
    return {
      timedSessions,
      bestDaySessions: bestDay?.sessions ?? 0,
      completedTasks,
      focusedSeconds: focus._sum.focusedSeconds ?? 0,
      productiveDates: days.map((day) => LocalDate.fromUtcDate(day.finished_on)),
    };
  }

  listUnlocked(userId: string): Promise<UnlockedAchievement[]> {
    return this.prisma.pomodoroAchievement.findMany({
      where: { userId },
      select: { code: true, unlockedAt: true },
    });
  }

  // skipDuplicates: un logro ya guardado conserva su instante (RF-44)
  async unlock(userId: string, codes: readonly string[], at: Date): Promise<void> {
    if (codes.length === 0) return;
    await this.prisma.pomodoroAchievement.createMany({
      data: codes.map((code) => ({ userId, code, unlockedAt: at })),
      skipDuplicates: true,
    });
  }
}
