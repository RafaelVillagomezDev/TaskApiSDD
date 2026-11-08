import type { RequestContext } from '../../../shared/application/request-context.type.js';
import { AppError } from '../../../shared/domain/app.error.js';
import type { Clock } from '../../../shared/domain/clock.port.js';
import type { PomodoroRepository } from '../domain/pomodoro.repository.js';
import { buildPomodoroDetail, type PomodoroDetail } from './pomodoro-detail.helper.js';
import type { SettleDuePomodoroUseCase } from './settle-due-pomodoro.use-case.js';

// Una sesión del usuario con su estado, sus tareas y su resultado (RF-16, RF-17, RF-20, RF-58)
export class GetPomodoroUseCase {
  constructor(
    private readonly pomodoros: PomodoroRepository,
    private readonly settle: SettleDuePomodoroUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(context: RequestContext, pomodoroId: string): Promise<PomodoroDetail> {
    // Una sesión vencida se ve terminada aunque el barrido no haya pasado (R-2)
    await this.settle.forUser(context.userId);
    const pomodoro = await this.pomodoros.findById(context.userId, pomodoroId);
    if (!pomodoro) throw new AppError('POMODORO_NOT_FOUND');
    // Una terminada se devuelve con su foto; solo una activa necesita sus tareas actuales
    const tasks = pomodoro.isActive() ? await this.pomodoros.findTasksOf(pomodoro.id) : [];
    return buildPomodoroDetail(pomodoro, tasks, this.clock.now());
  }
}
