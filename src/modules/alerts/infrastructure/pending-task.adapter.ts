import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import type { GetPendingTaskUseCase } from '../../tasks/task.facade.js';
import type { AlertTask } from '../domain/alert.entity.js';
import type { PendingTaskSource } from '../domain/pending-task.port.js';

// Obtiene las tareas pendientes a través de la fachada pública de tasks (principio V)
export class PendingTaskAdapter implements PendingTaskSource {
  constructor(private readonly getPendingTasks: GetPendingTaskUseCase) {}

  find(userId: string, from: LocalDate, to: LocalDate): Promise<AlertTask[]> {
    return this.getPendingTasks.execute(userId, from, to);
  }
}
