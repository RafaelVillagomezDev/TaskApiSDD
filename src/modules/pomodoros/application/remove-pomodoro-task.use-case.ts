import type { RequestContext } from '../../../shared/application/request-context.type.js';
import { AppError } from '../../../shared/domain/app.error.js';
import type { Clock } from '../../../shared/domain/clock.port.js';
import type { PomodoroRepository } from '../domain/pomodoro.repository.js';
import { buildPomodoroDetail, type PomodoroDetail } from './pomodoro-detail.helper.js';
import type { SettleDuePomodoroUseCase } from './settle-due-pomodoro.use-case.js';

// Quita una tarea pendiente de la sesión activa: pasa a espera sin borrarse, aunque la sesión se quede vacía
// (RF-26). Errores en el orden de RF-63: sesión no encontrada, tarea que no está en ella, sesión terminada y
// tarea completada (RF-27, RF-28, RF-37)
export class RemovePomodoroTaskUseCase {
  constructor(
    private readonly pomodoros: PomodoroRepository,
    private readonly settle: SettleDuePomodoroUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(context: RequestContext, pomodoroId: string, taskId: string): Promise<PomodoroDetail> {
    await this.settle.forUser(context.userId);
    const now = this.clock.now();

    return this.pomodoros.transaction(async (unit) => {
      const pomodoro = await unit.lockPomodoro(context.userId, pomodoroId);
      if (!pomodoro) throw new AppError('POMODORO_NOT_FOUND');
      const tasks = await unit.tasksOf(pomodoro.id);
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task) throw new AppError('POMODORO_TASK_NOT_FOUND');
      if (!pomodoro.isActive()) throw new AppError('INVALID_POMODORO_STATE');
      if (task.completed) throw new AppError('POMODORO_TASK_COMPLETED');

      task.moveToWaiting();
      await unit.saveTasks([task]);
      return buildPomodoroDetail(
        pomodoro,
        tasks.filter((candidate) => candidate !== task),
        now,
      );
    });
  }
}
