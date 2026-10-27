import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import type { TaskRepository } from '../domain/task.repository.js';

// Lo que otros módulos ven de una tarea pendiente
export interface PendingTask {
  id: string;
  title: string;
  date: LocalDate;
}

// Tareas pendientes de un usuario entre dos días, ambos incluidos; lo consume el módulo alerts (RF-24 a RF-26)
export class GetPendingTaskUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  async execute(userId: string, from: LocalDate, to: LocalDate): Promise<PendingTask[]> {
    const pending = await this.tasks.findPending(userId, from, to);
    return pending.map(({ id, title, date }) => ({ id, title, date }));
  }
}
