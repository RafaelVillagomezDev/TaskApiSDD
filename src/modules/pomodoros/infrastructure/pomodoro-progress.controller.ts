import type { RequestHandler } from 'express';

import { getRequestContext } from '../../../shared/infrastructure/http/request-context.middleware.js';
import { sendSuccess } from '../../../shared/infrastructure/http/response-envelope.helper.js';
import type { GetPomodoroStreakUseCase } from '../application/get-pomodoro-streak.use-case.js';
import type { ListPomodoroAchievementsUseCase } from '../application/list-pomodoro-achievement.use-case.js';
import { toAchievementResponse } from './pomodoro.mapper.js';

// Traduce HTTP ↔ racha y logros del pomodoro (plan, D-11)
export class PomodoroProgressController {
  constructor(
    private readonly getStreak: GetPomodoroStreakUseCase,
    private readonly listAchievements: ListPomodoroAchievementsUseCase,
  ) {}

  // La misma forma que GET /streak de la 001: { current, best } (RF-41)
  streak: RequestHandler = async (_req, res) => {
    const streak = await this.getStreak.execute(getRequestContext(res));
    sendSuccess(res, 200, 'Operación realizada con éxito', { current: streak.current, best: streak.best });
  };

  achievements: RequestHandler = async (_req, res) => {
    const achievements = await this.listAchievements.execute(getRequestContext(res));
    sendSuccess(res, 200, 'Operación realizada con éxito', achievements.map(toAchievementResponse));
  };
}
