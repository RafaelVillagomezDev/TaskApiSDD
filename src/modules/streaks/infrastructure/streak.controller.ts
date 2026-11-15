import type { RequestHandler } from 'express';

import { getRequestContext } from '../../../shared/infrastructure/http/request-context.middleware.js';
import { sendSuccess } from '../../../shared/infrastructure/http/response-envelope.helper.js';
import type { GetStreakUseCase } from '../application/get-streak.use-case.js';

// GET /streak
export class StreakController {
  constructor(private readonly getStreak: GetStreakUseCase) {}

  get: RequestHandler = async (_req, res) => {
    const streak = await this.getStreak.execute(getRequestContext(res));
    sendSuccess(res, 200, 'Operación realizada con éxito', { current: streak.current, best: streak.best });
  };
}
