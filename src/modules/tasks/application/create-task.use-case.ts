import type { RequestContext } from '../../../shared/application/request-context.type.js';
import { AppError } from '../../../shared/domain/app.error.js';
import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import type { Task } from '../domain/task.entity.js';
import type { TaskRepository } from '../domain/task.repository.js';

export interface CreateTaskInput {
  title: string;
  description: string | null;
  date: LocalDate;
}

// Crea una tarea pendiente para hoy o un día futuro (RF-03, RF-07)
export class CreateTaskUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  async execute(context: RequestContext, input: CreateTaskInput): Promise<Task> {
    if (input.date.isBefore(context.today)) {
      throw new AppError('DAY_CLOSED');
    }
    return this.tasks.create({ userId: context.userId, ...input });
  }
}
