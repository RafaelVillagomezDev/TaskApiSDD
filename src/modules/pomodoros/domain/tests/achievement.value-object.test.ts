import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import {
  ACHIEVEMENT_CATALOG,
  achievementProgress,
  type AchievementMetrics,
  metricsFromStats,
  reachedAchievements,
} from '../achievement.value-object.js';

const none: AchievementMetrics = {
  timedSessions: 0,
  bestStreak: 0,
  bestDaySessions: 0,
  completedTasks: 0,
  focusMinutes: 0,
};
const days = (...values: string[]) => values.map((value) => LocalDate.parse(value));

describe('catálogo de logros', () => {
  it('tiene los 11 logros de RF-43 en orden, con su meta', () => {
    expect(ACHIEVEMENT_CATALOG.map((achievement) => [achievement.code, achievement.name, achievement.target])).toEqual([
      ['FIRST_POMODORO', 'Primer pomodoro', 1],
      ['SESSIONS_10', 'Concentrado', 10],
      ['SESSIONS_50', 'Dedicado', 50],
      ['SESSIONS_100', 'Maestro', 100],
      ['STREAK_3', 'Constante', 3],
      ['STREAK_7', 'Imparable', 7],
      ['STREAK_30', 'Hábito', 30],
      ['MARATHON', 'Maratón', 4],
      ['TASKS_10', 'Cumplidor', 10],
      ['TASKS_100', 'Productivo', 100],
      ['FOCUS_10H', 'Diez horas', 600],
    ]);
  });

  it('cada logro tiene una descripción en español (RNF-03)', () => {
    for (const achievement of ACHIEVEMENT_CATALOG) expect(achievement.description).toMatch(/[a-záéíóúñ]/);
  });

  it('sin actividad no se alcanza ninguno', () => {
    expect(reachedAchievements(none)).toEqual([]);
  });

  it('las metas son exactas: 9 sesiones no alcanzan SESSIONS_10 y 10 sí (RF-43)', () => {
    expect(reachedAchievements({ ...none, timedSessions: 9 })).toEqual(['FIRST_POMODORO']);
    expect(reachedAchievements({ ...none, timedSessions: 10 })).toEqual(['FIRST_POMODORO', 'SESSIONS_10']);
  });

  it('cada métrica alcanza solo sus logros', () => {
    expect(reachedAchievements({ ...none, bestStreak: 7 })).toEqual(['STREAK_3', 'STREAK_7']);
    expect(reachedAchievements({ ...none, bestDaySessions: 4 })).toEqual(['MARATHON']);
    expect(reachedAchievements({ ...none, completedTasks: 100 })).toEqual(['TASKS_10', 'TASKS_100']);
    expect(reachedAchievements({ ...none, focusMinutes: 600 })).toEqual(['FOCUS_10H']);
    expect(reachedAchievements({ ...none, focusMinutes: 599 })).toEqual([]);
  });

  it('el progreso nunca supera la meta (RF-19)', () => {
    const sessions10 = ACHIEVEMENT_CATALOG[1];
    expect(achievementProgress(sessions10, { ...none, timedSessions: 7 })).toBe(7);
    expect(achievementProgress(sessions10, { ...none, timedSessions: 42 })).toBe(10);
  });
});

describe('metricsFromStats', () => {
  const stats = {
    timedSessions: 5,
    bestDaySessions: 3,
    completedTasks: 12,
    focusedSeconds: 7 * 3600 + 30 * 60 + 59,
    productiveDates: days('2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05'),
  };

  it('la mejor racha sale de los días productivos (RF-45)', () => {
    expect(metricsFromStats(stats).bestStreak).toBe(3);
    expect(metricsFromStats({ ...stats, productiveDates: [] }).bestStreak).toBe(0);
  });

  it('la concentración se cuenta en minutos enteros, hacia abajo: 7 h 30 min 59 s → 450 (RF-65)', () => {
    expect(metricsFromStats(stats).focusMinutes).toBe(450);
  });

  it('copia el resto de estadísticas', () => {
    expect(metricsFromStats(stats)).toMatchObject({ timedSessions: 5, bestDaySessions: 3, completedTasks: 12 });
  });
});
