import type { RequestHandler } from 'express';

import { Pagination } from '../../../shared/domain/pagination.value-object.js';
import { paginationQuerySchema } from '../../../shared/infrastructure/http/pagination.schema.js';
import { getRequestContext } from '../../../shared/infrastructure/http/request-context.middleware.js';
import { parseOrThrow } from '../../../shared/infrastructure/http/request-validation.helper.js';
import { sendSuccess } from '../../../shared/infrastructure/http/response-envelope.helper.js';
import type { GetPomodoroUseCase } from '../application/get-pomodoro.use-case.js';
import type { ListPomodorosUseCase } from '../application/list-pomodoro.use-case.js';
import type { StartPomodoroUseCase } from '../application/start-pomodoro.use-case.js';
import { toPomodoroResponse } from './pomodoro.mapper.js';
import { idParamsSchema, startPomodoroBodySchema } from './pomodoro.schema.js';

// Traduce HTTP ↔ casos de uso de las sesiones pomodoro (plan, D-11)
export class PomodoroController {
  constructor(
    private readonly startPomodoro: StartPomodoroUseCase,
    private readonly getPomodoro: GetPomodoroUseCase,
    private readonly listPomodoros: ListPomodorosUseCase,
  ) {}

  // Sin cuerpo equivale a un cuerpo vacío: todos sus campos son opcionales (RF-49)
  start: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const input = parseOrThrow(startPomodoroBodySchema, req.body ?? {});
    const detail = await this.startPomodoro.execute(context, input);
    sendSuccess(res, 201, 'Sesión pomodoro iniciada', toPomodoroResponse(detail));
  };

  get: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const { id } = parseOrThrow(idParamsSchema, req.params);
    const detail = await this.getPomodoro.execute(context, id);
    sendSuccess(res, 200, 'Operación realizada con éxito', toPomodoroResponse(detail));
  };

  list: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const query = parseOrThrow(paginationQuerySchema, req.query);
    const page = await this.listPomodoros.execute(context, new Pagination(query.page, query.pageSize));
    sendSuccess(res, 200, 'Operación realizada con éxito', { ...page, items: page.items.map(toPomodoroResponse) });
  };
}
