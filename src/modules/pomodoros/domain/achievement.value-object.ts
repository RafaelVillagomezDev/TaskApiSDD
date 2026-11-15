import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import { Streak } from '../../../shared/domain/streak.value-object.js';
import type { AchievementStats } from './achievement.repository.js';

const SECONDS_PER_MINUTE = 60;

// Valor que mide cada logro
export interface AchievementMetrics {
  // Sesiones terminadas por tiempo (RF-43)
  timedSessions: number;
  // Mejor racha del pomodoro, en días (RF-45)
  bestStreak: number;
  // Mayor número de sesiones por tiempo en un mismo día local (MARATHON, RF-43)
  bestDaySessions: number;
  // Tareas completadas en ese momento, cada una una vez (RF-46)
  completedTasks: number;
  // Concentración acumulada en minutos enteros, hacia abajo (RF-47, RF-65)
  focusMinutes: number;
}

export interface AchievementDefinition {
  code: string;
  name: string;
  description: string;
  target: number;
  metric: keyof AchievementMetrics;
}

// Catálogo fijo de RF-43, en su orden (RF-19)
export const ACHIEVEMENT_CATALOG = [
  {
    code: 'FIRST_POMODORO',
    name: 'Primer pomodoro',
    description: 'Termina por tiempo tu primera sesión pomodoro.',
    target: 1,
    metric: 'timedSessions',
  },
  {
    code: 'SESSIONS_10',
    name: 'Concentrado',
    description: 'Termina por tiempo 10 sesiones pomodoro.',
    target: 10,
    metric: 'timedSessions',
  },
  {
    code: 'SESSIONS_50',
    name: 'Dedicado',
    description: 'Termina por tiempo 50 sesiones pomodoro.',
    target: 50,
    metric: 'timedSessions',
  },
  {
    code: 'SESSIONS_100',
    name: 'Maestro',
    description: 'Termina por tiempo 100 sesiones pomodoro.',
    target: 100,
    metric: 'timedSessions',
  },
  {
    code: 'STREAK_3',
    name: 'Constante',
    description: 'Alcanza una racha del pomodoro de 3 días.',
    target: 3,
    metric: 'bestStreak',
  },
  {
    code: 'STREAK_7',
    name: 'Imparable',
    description: 'Alcanza una racha del pomodoro de 7 días.',
    target: 7,
    metric: 'bestStreak',
  },
  {
    code: 'STREAK_30',
    name: 'Hábito',
    description: 'Alcanza una racha del pomodoro de 30 días.',
    target: 30,
    metric: 'bestStreak',
  },
  {
    code: 'MARATHON',
    name: 'Maratón',
    description: 'Termina por tiempo 4 sesiones pomodoro en un mismo día.',
    target: 4,
    metric: 'bestDaySessions',
  },
  {
    code: 'TASKS_10',
    name: 'Cumplidor',
    description: 'Completa 10 tareas del pomodoro.',
    target: 10,
    metric: 'completedTasks',
  },
  {
    code: 'TASKS_100',
    name: 'Productivo',
    description: 'Completa 100 tareas del pomodoro.',
    target: 100,
    metric: 'completedTasks',
  },
  {
    code: 'FOCUS_10H',
    name: 'Diez horas',
    description: 'Acumula 10 horas de concentración (600 minutos).',
    target: 600,
    metric: 'focusMinutes',
  },
] as const satisfies readonly AchievementDefinition[];

export type AchievementCode = (typeof ACHIEVEMENT_CATALOG)[number]['code'];

// Progreso de un logro: nunca mayor que su meta (RF-19)
export function achievementProgress(definition: AchievementDefinition, metrics: AchievementMetrics): number {
  return Math.min(metrics[definition.metric], definition.target);
}

// Códigos del catálogo cuya meta se alcanza con estas métricas, en el orden del catálogo (RF-44)
export function reachedAchievements(metrics: AchievementMetrics): AchievementCode[] {
  return ACHIEVEMENT_CATALOG.filter((definition) => metrics[definition.metric] >= definition.target).map(
    (definition) => definition.code,
  );
}

// Métricas a partir de las estadísticas guardadas: la mejor racha sale de los días productivos (RF-45) y la
// concentración pasa de segundos a minutos enteros (RF-65)
export function metricsFromStats(stats: AchievementStats): AchievementMetrics {
  return {
    timedSessions: stats.timedSessions,
    bestStreak: bestStreakOf(stats.productiveDates),
    bestDaySessions: stats.bestDaySessions,
    completedTasks: stats.completedTasks,
    focusMinutes: Math.floor(stats.focusedSeconds / SECONDS_PER_MINUTE),
  };
}

// La mejor racha no depende del día actual: se calcula con el último día productivo
function bestStreakOf(productiveDates: readonly LocalDate[]): number {
  const last = productiveDates.at(-1);
  return last ? Streak.calculate(productiveDates, last).best : 0;
}
