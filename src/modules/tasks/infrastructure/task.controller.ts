import type { RequestHandler } from 'express';

import { Pagination } from '../../../shared/domain/pagination.value-object.js';
import { getRequestContext } from '../../../shared/infrastructure/http/request-context.middleware.js';
import { parseOrThrow } from '../../../shared/infrastructure/http/request-validation.helper.js';
import { sendSuccess } from '../../../shared/infrastructure/http/response-envelope.helper.js';
import type { CreateTaskUseCase } from '../application/create-task.use-case.js';
import type { GetTaskUseCase } from '../application/get-task.use-case.js';
import type { ListTasksUseCase } from '../application/list-task.use-case.js';
import type { UpdateTaskUseCase } from '../application/update-task.use-case.js';
import { toTaskResponse } from './task.mapper.js';
import { createTaskBodySchema, listTasksQuerySchema, taskIdParamsSchema, updateTaskBodySchema } from './task.schema.js';

// Traduce HTTP ↔ casos de uso de tareas
export class TaskController {
  constructor(
    private readonly createTask: CreateTaskUseCase,
    private readonly listTasks: ListTasksUseCase,
    private readonly updateTask: UpdateTaskUseCase,
    private readonly getTask: GetTaskUseCase,
  ) {}

  create: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const input = parseOrThrow(createTaskBodySchema, req.body);
    const task = await this.createTask.execute(context, input);
    sendSuccess(res, 201, 'Tarea creada con éxito', toTaskResponse(task));
  };

  update: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const { id } = parseOrThrow(taskIdParamsSchema, req.params);
    const changes = parseOrThrow(updateTaskBodySchema, req.body);
    const task = await this.updateTask.execute(context, id, changes);
    sendSuccess(res, 200, 'Tarea actualizada con éxito', toTaskResponse(task));
  };

  get: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const { id } = parseOrThrow(taskIdParamsSchema, req.params);
    const task = await this.getTask.execute(context, id);
    sendSuccess(res, 200, 'Operación realizada con éxito', toTaskResponse(task));
  };

  list: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const query = parseOrThrow(listTasksQuerySchema, req.query);
    const page = await this.listTasks.execute(context, {
      date: query.date,
      from: query.from,
      to: query.to,
      status: query.status,
      pagination: new Pagination(query.page, query.pageSize),
    });
    sendSuccess(res, 200, 'Operación realizada con éxito', { ...page, items: page.items.map(toTaskResponse) });
  };
}
