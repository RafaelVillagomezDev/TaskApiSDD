import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import type { TaskRepository } from '../domain/task.repository.js';

// Días productivos de un usuario hasta un día dado; lo consume el módulo streaks (RF-17, RF-18, RF-22)
export class GetProductiveDateUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  execute(userId: string, until: LocalDate): Promise<LocalDate[]> {
    return this.tasks.findProductiveDates(userId, until);
  }
}
