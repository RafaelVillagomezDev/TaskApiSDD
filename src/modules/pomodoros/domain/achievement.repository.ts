import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';

// Estadísticas de un usuario con las que se calculan sus logros (plan, 5.9)
export interface AchievementStats {
  timedSessions: number;
  bestDaySessions: number;
  completedTasks: number;
  focusedSeconds: number;
  // Días con al menos una sesión terminada por tiempo, sin repetir y en orden (RF-38)
  productiveDates: LocalDate[];
}

export interface UnlockedAchievement {
  code: string;
  unlockedAt: Date;
}

// Puerto de salida de los logros: solo se guardan los conseguidos; el progreso se calcula al leer (D-5)
export interface AchievementRepository {
  stats(userId: string): Promise<AchievementStats>;
  listUnlocked(userId: string): Promise<UnlockedAchievement[]>;
  // Guarda los que falten con ese instante; nunca cambia uno ya guardado (RF-44)
  unlock(userId: string, codes: readonly string[], at: Date): Promise<void>;
}
