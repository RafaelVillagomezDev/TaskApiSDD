import type { RequestHandler } from 'express';

import { getRequestContext } from '../../../shared/infrastructure/http/request-context.middleware.js';
import { parseOrThrow } from '../../../shared/infrastructure/http/request-validation.helper.js';
import { sendSuccess } from '../../../shared/infrastructure/http/response-envelope.helper.js';
import type { UpdatePomodoroTaskUseCase } from '../application/update-pomodoro-task.use-case.js';
import { toPomodoroTaskResponse } from './pomodoro.mapper.js';
import { idParamsSchema, updatePomodoroTaskBodySchema } from './pomodoro.schema.js';

// Traduce HTTP ↔ casos de uso de las tareas del pomodoro (plan, D-11)
export class PomodoroTaskController {
  constructor(private readonly updateTask: UpdatePomodoroTaskUseCase) {}

  update: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const { id } = parseOrThrow(idParamsSchema, req.params);
    const changes = parseOrThrow(updatePomodoroTaskBodySchema, req.body);
    const task = await this.updateTask.execute(context, id, changes);
    sendSuccess(res, 200, 'Operación realizada con éxito', toPomodoroTaskResponse(task.toSnapshot()));
  };
}
