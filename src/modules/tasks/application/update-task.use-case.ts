import type { RequestContext } from '../../../shared/application/request-context.type.js';
import { AppError } from '../../../shared/domain/app.error.js';
import { Task } from '../domain/task.entity.js';
import type { TaskRepository } from '../domain/task.repository.js';

export interface UpdateTaskChanges {
  completed?: boolean;
}

// Completa o desmarca una tarea aplicando las reglas de día (RF-11, RF-12, RF-14, RF-16, RF-45).
// Orden: TASK_NOT_FOUND → DAY_CLOSED → DAY_NOT_STARTED (RF-46)
export class UpdateTaskUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  async execute(context: RequestContext, id: string, changes: UpdateTaskChanges): Promise<Task> {
    const task = Task.isValidId(id) ? await this.tasks.findById(context.userId, id) : null;
    if (!task) {
      throw new AppError('TASK_NOT_FOUND');
    }

    task.assertModifiable(context.today);
    if (changes.completed === true) {
      task.complete(context.today);
    } else if (changes.completed === false) {
      task.uncomplete(context.today);
    }

    return this.tasks.update(task);
  }
}
