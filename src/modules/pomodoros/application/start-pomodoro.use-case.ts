import type { RequestContext } from '../../../shared/application/request-context.type.js';
import { AppError } from '../../../shared/domain/app.error.js';
import type { Clock } from '../../../shared/domain/clock.port.js';
import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import type { PomodoroTask } from '../domain/pomodoro-task.entity.js';
import { Pomodoro } from '../domain/pomodoro.entity.js';
import type { PomodoroRepository, PomodoroUnitOfWork } from '../domain/pomodoro.repository.js';
import { buildPomodoroDetail, type PomodoroDetail } from './pomodoro-detail.helper.js';
import type { SettleDuePomodoroUseCase } from './settle-due-pomodoro.use-case.js';

export interface NewTaskInput {
  title: string;
  description: string | null;
  date: LocalDate;
}

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
      const waiting = await this.waitingTasks(unit, context.userId, input.waitingTaskIds);
      if (await unit.lockActivePomodoro(context.userId)) {
        throw new AppError('POMODORO_ALREADY_ACTIVE');
      }
      if (input.newTasks.some((task) => task.date.isBefore(context.today))) {
        throw new AppError('DAY_CLOSED');
      }

      const pomodoro = await unit.createPomodoro(Pomodoro.plan(context.userId, input.durationMinutes, now));
      // Primero las nuevas y después las en espera, cada lista en el orden del cuerpo (RF-64)
      const created = await unit.createTasks(
        input.newTasks.map((task, index) => ({
          ...task,
          userId: context.userId,
          pomodoroId: pomodoro.id,
          position: index + 1,
        })),
      );
      waiting.forEach((task, index) => task.moveTo(pomodoro.id, created.length + index + 1, context.today));
      await unit.saveTasks(waiting);

      return buildPomodoroDetail(pomodoro, [...created, ...waiting], now);
    });
  }

  // Las tareas en espera pedidas, en el orden del cuerpo; si alguna no existe, es de otro usuario o no está
  // en espera → POMODORO_TASK_NOT_FOUND (RF-11)
  private async waitingTasks(unit: PomodoroUnitOfWork, userId: string, ids: readonly string[]): Promise<PomodoroTask[]> {
    const found = new Map((await unit.findTasks(userId, ids)).map((task) => [task.id, task]));
    return ids.map((id) => {
      const task = found.get(id);
      if (!task?.isWaiting()) throw new AppError('POMODORO_TASK_NOT_FOUND');
      return task;
    });
  }
}
