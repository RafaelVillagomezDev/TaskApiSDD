import type { RequestContext } from '../../../shared/application/request-context.type.js';
import type { Clock } from '../../../shared/domain/clock.port.js';
import { createPage, type Page, type Pagination } from '../../../shared/domain/pagination.value-object.js';
import type { PomodoroRepository } from '../domain/pomodoro.repository.js';
import { buildPomodoroDetail, type PomodoroDetail } from './pomodoro-detail.helper.js';
import type { SettleDuePomodoroUseCase } from './settle-due-pomodoro.use-case.js';

// Sesiones del usuario, activas y terminadas, de la más reciente a la más antigua y paginadas (RF-18)
export class ListPomodorosUseCase {
  constructor(
    private readonly pomodoros: PomodoroRepository,
    private readonly settle: SettleDuePomodoroUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(context: RequestContext, pagination: Pagination): Promise<Page<PomodoroDetail>> {
    await this.settle.forUser(context.userId);
    const now = this.clock.now();
    const { items, total } = await this.pomodoros.findPage(context.userId, pagination);
    // Las terminadas llevan su foto; solo la activa, que es como mucho una (RF-12), lee sus tareas
    const details = await Promise.all(
      items.map(async (pomodoro) =>
        buildPomodoroDetail(pomodoro, pomodoro.isActive() ? await this.pomodoros.findTasksOf(pomodoro.id) : [], now),
      ),
    );
    return createPage(details, pagination, total);
  }
}
