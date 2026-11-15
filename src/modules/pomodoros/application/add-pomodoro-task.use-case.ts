import type { RequestContext } from '../../../shared/application/request-context.type.js';
import { AppError } from '../../../shared/domain/app.error.js';
import type { Clock } from '../../../shared/domain/clock.port.js';
import { MAX_TASKS_PER_POMODORO } from '../domain/pomodoro.entity.js';
import type { PomodoroRepository } from '../domain/pomodoro.repository.js';
import { buildPomodoroDetail, type PomodoroDetail } from './pomodoro-detail.helper.js';
import { appendTasks, findWaitingTasks, type NewTaskInput } from './pomodoro-task.helper.js';
import type { SettleDuePomodoroUseCase } from './settle-due-pomodoro.use-case.js';

// Cuerpo de POST /pomodoros/{id}/tasks ya validado: al menos una tarea entre las dos listas (RF-51)
export interface AddPomodoroTasksInput {
  newTasks: NewTaskInput[];
  waitingTaskIds: string[];
}

// Añade tareas nuevas o en espera al final de la sesión activa, en curso o pausada (RF-25, RF-64). Errores en
// el orden de RF-63: sesión o tarea no encontrada, sesión terminada, límite de 20 y DAY_CLOSED; si alguno
// falla, no añade ninguna (RF-05, RF-11, RF-27, RF-59)
export class AddPomodoroTaskUseCase {
  constructor(
    private readonly pomodoros: PomodoroRepository,
    private readonly settle: SettleDuePomodoroUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(context: RequestContext, pomodoroId: string, input: AddPomodoroTasksInput): Promise<PomodoroDetail> {
    await this.settle.forUser(context.userId);
    const now = this.clock.now();

    return this.pomodoros.transaction(async (unit) => {
      const pomodoro = await unit.lockPomodoro(context.userId, pomodoroId);
      if (!pomodoro) throw new AppError('POMODORO_NOT_FOUND');
      const waiting = await findWaitingTasks(unit, context.userId, input.waitingTaskIds);
      if (!pomodoro.isActive()) throw new AppError('INVALID_POMODORO_STATE');
      const current = await unit.tasksOf(pomodoro.id);
      if (current.length + input.newTasks.length + waiting.length > MAX_TASKS_PER_POMODORO) {
        throw new AppError('POMODORO_TASK_LIMIT');
      }
      if (input.newTasks.some((task) => task.date.isBefore(context.today))) {
        throw new AppError('DAY_CLOSED');
      }

      const added = await appendTasks(unit, {
        userId: context.userId,
        pomodoroId: pomodoro.id,
        today: context.today,
        newTasks: input.newTasks,
        waiting,
      });
      return buildPomodoroDetail(pomodoro, [...current, ...added], now);
    });
  }
}
