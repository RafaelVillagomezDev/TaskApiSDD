import type { RequestContext } from '../../../shared/application/request-context.type.js';
import { AppError } from '../../../shared/domain/app.error.js';
import type { Clock } from '../../../shared/domain/clock.port.js';
import { Pomodoro } from '../domain/pomodoro.entity.js';
import type { PomodoroRepository } from '../domain/pomodoro.repository.js';
import { buildPomodoroDetail, type PomodoroDetail } from './pomodoro-detail.helper.js';
import { appendTasks, findWaitingTasks, type NewTaskInput } from './pomodoro-task.helper.js';
import type { SettleDuePomodoroUseCase } from './settle-due-pomodoro.use-case.js';

export type { NewTaskInput } from './pomodoro-task.helper.js';

// Cuerpo de POST /pomodoros ya validado: duración y número de tareas dentro de los límites (RF-09, RF-10)
export interface StartPomodoroInput {
  durationMinutes: number;
  newTasks: NewTaskInput[];
  waitingTaskIds: string[];
}

// Empieza una sesión con sus tareas nuevas y, si se quiere, tareas en espera (RF-04, RF-05, RF-08, RF-11,
// RF-12, RF-21, RF-52, RF-64). Los errores siguen el orden de RF-63: tarea no encontrada, sesión activa y
// DAY_CLOSED; nada se crea si alguno falla
export class StartPomodoroUseCase {
  constructor(
    private readonly pomodoros: PomodoroRepository,
    private readonly settle: SettleDuePomodoroUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(context: RequestContext, input: StartPomodoroInput): Promise<PomodoroDetail> {
    // Una sesión vencida ya está terminada y no impide empezar otra (RF-15)
    await this.settle.forUser(context.userId);
    const now = this.clock.now();

    return this.pomodoros.transaction(async (unit) => {
      const waiting = await findWaitingTasks(unit, context.userId, input.waitingTaskIds);
      if (await unit.lockActivePomodoro(context.userId)) {
        throw new AppError('POMODORO_ALREADY_ACTIVE');
      }
      if (input.newTasks.some((task) => task.date.isBefore(context.today))) {
        throw new AppError('DAY_CLOSED');
      }

      const pomodoro = await unit.createPomodoro(Pomodoro.plan(context.userId, input.durationMinutes, now));
      const tasks = await appendTasks(unit, {
        userId: context.userId,
        pomodoroId: pomodoro.id,
        today: context.today,
        newTasks: input.newTasks,
        waiting,
      });
      return buildPomodoroDetail(pomodoro, tasks, now);
    });
  }
}
