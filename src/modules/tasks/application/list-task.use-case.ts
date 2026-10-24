import type { RequestContext } from '../../../shared/application/request-context.type.js';
import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import { createPage, type Page, type Pagination } from '../../../shared/domain/pagination.value-object.js';
import type { Task } from '../domain/task.entity.js';
import type { TaskRepository, TaskStatusFilter } from '../domain/task.repository.js';

export interface ListTasksInput {
  date?: LocalDate;
  status: TaskStatusFilter;
  pagination: Pagination;
}

// Lista paginada de las tareas del usuario (RF-08, RF-39, RF-41)
export class ListTasksUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  async execute(context: RequestContext, input: ListTasksInput): Promise<Page<Task>> {
    const { items, total } = await this.tasks.findPage(
      context.userId,
      { status: input.status, date: input.date },
      input.pagination,
    );
    return createPage(items, input.pagination, total);
  }
}
