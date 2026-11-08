import type { RequestContext } from '../../../shared/application/request-context.type.js';
import { AppError } from '../../../shared/domain/app.error.js';
import type { PomodoroRepository } from '../domain/pomodoro.repository.js';
import { lockTaskWithSession } from './pomodoro-task.helper.js';
import type { SettleDuePomodoroUseCase } from './settle-due-pomodoro.use-case.js';

// Borra una tarea en espera (RF-22). Errores en el orden de RF-63: tarea no encontrada; completada de una
// sesión terminada, que forma parte de su historial (RF-34); y de la sesión activa, que primero se quita (RF-29)
export class DeletePomodoroTaskUseCase {
  constructor(
    private readonly pomodoros: PomodoroRepository,
    private readonly settle: SettleDuePomodoroUseCase,
  ) {}

  async execute(context: RequestContext, taskId: string): Promise<void> {
    await this.settle.forUser(context.userId);

    await this.pomodoros.transaction(async (unit) => {
      const { pomodoro } = await lockTaskWithSession(unit, context.userId, taskId);
      if (pomodoro && !pomodoro.isActive()) throw new AppError('INVALID_POMODORO_STATE');
      if (pomodoro) throw new AppError('POMODORO_TASK_IN_SESSION');
      await unit.deleteTask(context.userId, taskId);
    });
  }
}
