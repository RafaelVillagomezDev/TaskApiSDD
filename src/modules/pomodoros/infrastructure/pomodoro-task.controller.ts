import type { RequestHandler } from 'express';

import { Pagination } from '../../../shared/domain/pagination.value-object.js';
import { paginationQuerySchema } from '../../../shared/infrastructure/http/pagination.schema.js';
import { getRequestContext } from '../../../shared/infrastructure/http/request-context.middleware.js';
import { parseOrThrow } from '../../../shared/infrastructure/http/request-validation.helper.js';
import { sendSuccess } from '../../../shared/infrastructure/http/response-envelope.helper.js';
import type { DeletePomodoroTaskUseCase } from '../application/delete-pomodoro-task.use-case.js';
import type { ListWaitingPomodoroTasksUseCase } from '../application/list-waiting-pomodoro-task.use-case.js';
import type { UpdatePomodoroTaskUseCase } from '../application/update-pomodoro-task.use-case.js';
import { toPomodoroTaskResponse } from './pomodoro.mapper.js';
import { idParamsSchema, updatePomodoroTaskBodySchema } from './pomodoro.schema.js';

// Traduce HTTP ↔ casos de uso de las tareas del pomodoro (plan, D-11)
export class PomodoroTaskController {
  constructor(
    private readonly updateTask: UpdatePomodoroTaskUseCase,
    private readonly listWaitingTasks: ListWaitingPomodoroTasksUseCase,
    private readonly deleteTask: DeletePomodoroTaskUseCase,
  ) {}

  update: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const { id } = parseOrThrow(idParamsSchema, req.params);
    const changes = parseOrThrow(updatePomodoroTaskBodySchema, req.body);
    const task = await this.updateTask.execute(context, id, changes);
    sendSuccess(res, 200, 'Operación realizada con éxito', toPomodoroTaskResponse(task.toSnapshot()));
  };

  listWaiting: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const query = parseOrThrow(paginationQuerySchema, req.query);
    const page = await this.listWaitingTasks.execute(context, new Pagination(query.page, query.pageSize));
    const items = page.items.map((task) => toPomodoroTaskResponse(task.toSnapshot()));
    sendSuccess(res, 200, 'Operación realizada con éxito', { ...page, items });
  };

  remove: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const { id } = parseOrThrow(idParamsSchema, req.params);
    await this.deleteTask.execute(context, id);
    sendSuccess(res, 200, 'Operación realizada con éxito', null);
  };
}
