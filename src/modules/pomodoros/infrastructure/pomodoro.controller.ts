import type { RequestHandler } from 'express';

import { getRequestContext } from '../../../shared/infrastructure/http/request-context.middleware.js';
import { parseOrThrow } from '../../../shared/infrastructure/http/request-validation.helper.js';
import { sendSuccess } from '../../../shared/infrastructure/http/response-envelope.helper.js';
import type { StartPomodoroUseCase } from '../application/start-pomodoro.use-case.js';
import { toPomodoroResponse } from './pomodoro.mapper.js';
import { startPomodoroBodySchema } from './pomodoro.schema.js';

// Traduce HTTP ↔ casos de uso de las sesiones pomodoro (plan, D-11)
export class PomodoroController {
  constructor(private readonly startPomodoro: StartPomodoroUseCase) {}

  // Sin cuerpo equivale a un cuerpo vacío: todos sus campos son opcionales (RF-49)
  start: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const input = parseOrThrow(startPomodoroBodySchema, req.body ?? {});
    const detail = await this.startPomodoro.execute(context, input);
    sendSuccess(res, 201, 'Sesión pomodoro iniciada', toPomodoroResponse(detail));
  };
}
