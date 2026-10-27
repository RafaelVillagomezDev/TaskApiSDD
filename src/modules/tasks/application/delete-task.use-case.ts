import type { RequestContext } from '../../../shared/application/request-context.type.js';
import { AppError } from '../../../shared/domain/app.error.js';
import { Task } from '../domain/task.entity.js';
import type { TaskRepository } from '../domain/task.repository.js';

// Borra definitivamente una tarea de hoy o futura (RF-14 a RF-16).
// Orden: TASK_NOT_FOUND → DAY_CLOSED (RF-46)
export class DeleteTaskUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  async execute(context: RequestContext, id: string): Promise<void> {
    const task = Task.isValidId(id) ? await this.tasks.findById(context.userId, id) : null;
    if (!task) {
      throw new AppError('TASK_NOT_FOUND');
    }

    task.assertModifiable(context.today);
    await this.tasks.delete(context.userId, task.id);
  }
}
