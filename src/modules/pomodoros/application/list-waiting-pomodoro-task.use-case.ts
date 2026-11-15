import type { RequestContext } from '../../../shared/application/request-context.type.js';
import { createPage, type Page, type Pagination } from '../../../shared/domain/pagination.value-object.js';
import type { PomodoroTask } from '../domain/pomodoro-task.entity.js';
import type { PomodoroRepository } from '../domain/pomodoro.repository.js';
import type { SettleDuePomodoroUseCase } from './settle-due-pomodoro.use-case.js';

// Tareas en espera: pendientes y fuera de cualquier sesión activa, por fecha y orden de creación, paginadas
// (RF-23, RF-24)
export class ListWaitingPomodoroTasksUseCase {
  constructor(
    private readonly pomodoros: PomodoroRepository,
    private readonly settle: SettleDuePomodoroUseCase,
  ) {}

  async execute(context: RequestContext, pagination: Pagination): Promise<Page<PomodoroTask>> {
    // Las pendientes de una sesión vencida ya están en espera (RF-15, RF-23)
    await this.settle.forUser(context.userId);
    const { items, total } = await this.pomodoros.findWaitingPage(context.userId, pagination);
    return createPage(items, pagination, total);
  }
}
