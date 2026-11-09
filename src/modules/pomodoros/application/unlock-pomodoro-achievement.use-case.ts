import { metricsFromStats, reachedAchievements } from '../domain/achievement.value-object.js';
import type { PomodoroUnitOfWork } from '../domain/pomodoro.repository.js';

// Desbloquea los logros que el usuario acaba de alcanzar, con el instante del evento que los alcanzó: el fin de
// la sesión o el momento de completar la tarea (RF-44). Se ejecuta dentro de la transacción de ese evento, así
// que sus estadísticas ya lo ven; un logro ya conseguido no cambia (plan, 5.9)
export class UnlockPomodoroAchievementUseCase {
  async execute(unit: PomodoroUnitOfWork, userId: string, at: Date): Promise<void> {
    const stats = await unit.achievements.stats(userId);
    await unit.achievements.unlock(userId, reachedAchievements(metricsFromStats(stats)), at);
  }
}
