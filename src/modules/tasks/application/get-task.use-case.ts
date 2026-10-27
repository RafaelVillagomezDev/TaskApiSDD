import type { RequestContext } from '../../../shared/application/request-context.type.js';
import { AppError } from '../../../shared/domain/app.error.js';
import { Task } from '../domain/task.entity.js';
import type { TaskRepository } from '../domain/task.repository.js';

// Devuelve una tarea del usuario por su id, también de días pasados (RF-16, RF-44)
export class GetTaskUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  async execute(context: RequestContext, id: string): Promise<Task> {
    // Un id no UUID no puede existir: TASK_NOT_FOUND sin consultar la base de datos (D-10)
    const task = Task.isValidId(id) ? await this.tasks.findById(context.userId, id) : null;
    if (!task) {
      throw new AppError('TASK_NOT_FOUND');
    }
    return task;
  }
}
