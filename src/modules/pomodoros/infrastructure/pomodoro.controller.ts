import type { RequestHandler } from 'express';

import { Pagination } from '../../../shared/domain/pagination.value-object.js';
import { paginationQuerySchema } from '../../../shared/infrastructure/http/pagination.schema.js';
import { getRequestContext } from '../../../shared/infrastructure/http/request-context.middleware.js';
import { parseOrThrow } from '../../../shared/infrastructure/http/request-validation.helper.js';
import { sendSuccess } from '../../../shared/infrastructure/http/response-envelope.helper.js';
import type { AddPomodoroTaskUseCase } from '../application/add-pomodoro-task.use-case.js';
import type { ChangePomodoroStatusUseCase } from '../application/change-pomodoro-status.use-case.js';
import type { GetPomodoroUseCase } from '../application/get-pomodoro.use-case.js';
import type { ListPomodorosUseCase } from '../application/list-pomodoro.use-case.js';
import type { RemovePomodoroTaskUseCase } from '../application/remove-pomodoro-task.use-case.js';
import type { StartPomodoroUseCase } from '../application/start-pomodoro.use-case.js';
import { toPomodoroResponse } from './pomodoro.mapper.js';
import {
  addPomodoroTasksBodySchema,
  changePomodoroStatusBodySchema,
  idParamsSchema,
  sessionTaskParamsSchema,
  startPomodoroBodySchema,
} from './pomodoro.schema.js';

// Traduce HTTP ↔ casos de uso de las sesiones pomodoro (plan, D-11)
export class PomodoroController {
  constructor(
    private readonly startPomodoro: StartPomodoroUseCase,
    private readonly getPomodoro: GetPomodoroUseCase,
    private readonly listPomodoros: ListPomodorosUseCase,
    private readonly changePomodoroStatus: ChangePomodoroStatusUseCase,
    private readonly addPomodoroTasks: AddPomodoroTaskUseCase,
    private readonly removePomodoroTask: RemovePomodoroTaskUseCase,
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

  changeStatus: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const { id } = parseOrThrow(idParamsSchema, req.params);
    const { status } = parseOrThrow(changePomodoroStatusBodySchema, req.body);
    const detail = await this.changePomodoroStatus.execute(context, id, status);
    sendSuccess(res, 200, 'Operación realizada con éxito', toPomodoroResponse(detail));
  };

  addTasks: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const { id } = parseOrThrow(idParamsSchema, req.params);
    const input = parseOrThrow(addPomodoroTasksBodySchema, req.body);
    const detail = await this.addPomodoroTasks.execute(context, id, input);
    sendSuccess(res, 200, 'Operación realizada con éxito', toPomodoroResponse(detail));
  };

  removeTask: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const { id, taskId } = parseOrThrow(sessionTaskParamsSchema, req.params);
    const detail = await this.removePomodoroTask.execute(context, id, taskId);
    sendSuccess(res, 200, 'Operación realizada con éxito', toPomodoroResponse(detail));
  };
}
