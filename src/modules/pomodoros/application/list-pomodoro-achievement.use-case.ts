import type { RequestContext } from '../../../shared/application/request-context.type.js';
import type { AchievementRepository } from '../domain/achievement.repository.js';
import {
  ACHIEVEMENT_CATALOG,
  type AchievementDefinition,
  achievementProgress,
  metricsFromStats,
} from '../domain/achievement.value-object.js';
import type { SettleDuePomodoroUseCase } from './settle-due-pomodoro.use-case.js';

// Un logro del catálogo con el estado del usuario (recurso Achievement de la spec)
export interface AchievementStatus {
  definition: AchievementDefinition;
  progress: number;
  unlocked: boolean;
  unlockedAt: Date | null;
}

// Los 11 logros del catálogo en su orden, sin paginar, con su progreso y si están conseguidos (RF-19). Un logro
// guardado sale conseguido aunque su progreso haya bajado (RF-44)
export class ListPomodoroAchievementsUseCase {
  constructor(
    private readonly achievements: AchievementRepository,
    private readonly settle: SettleDuePomodoroUseCase,
  ) {}

  async execute(context: RequestContext): Promise<AchievementStatus[]> {
    // Asentar una sesión vencida también desbloquea sus logros
    await this.settle.forUser(context.userId);
    const metrics = metricsFromStats(await this.achievements.stats(context.userId));
    const unlocked = new Map(
      (await this.achievements.listUnlocked(context.userId)).map((row) => [row.code, row.unlockedAt]),
    );
    return ACHIEVEMENT_CATALOG.map((definition) => {
      const unlockedAt = unlocked.get(definition.code) ?? null;
      return {
        definition,
        progress: achievementProgress(definition, metrics),
        unlocked: unlockedAt !== null,
        unlockedAt,
      };
    });
  }
}
