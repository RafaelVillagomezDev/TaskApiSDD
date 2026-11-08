import type { RequestContext } from '../../../shared/application/request-context.type.js';
import { AppError } from '../../../shared/domain/app.error.js';
import type { Clock } from '../../../shared/domain/clock.port.js';
import type { PomodoroTask, PomodoroTaskEdit } from '../domain/pomodoro-task.entity.js';
import type { PomodoroRepository, PomodoroUnitOfWork } from '../domain/pomodoro.repository.js';
import type { SettleDuePomodoroUseCase } from './settle-due-pomodoro.use-case.js';

// Cuerpo de PATCH /pomodoro-tasks/{id} ya validado: al menos un campo (RF-54)
export interface UpdatePomodoroTaskInput extends PomodoroTaskEdit {
  completed?: boolean;
}

// Edita el título y la descripción de una tarea en espera o de la sesión activa, y la completa o desmarca
// solo dentro de una sesión activa, sea cual sea su fecha (RF-13, RF-36, RF-48, RF-57). Errores en el orden
// de RF-63: tarea no encontrada, sesión terminada y tarea en espera; si alguno falla, no cambia nada
export class UpdatePomodoroTaskUseCase {
  constructor(
    private readonly pomodoros: PomodoroRepository,
    private readonly settle: SettleDuePomodoroUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(context: RequestContext, taskId: string, input: UpdatePomodoroTaskInput): Promise<PomodoroTask> {
    // Una sesión vencida ya está terminada: sus tareas pendientes están en espera (RF-15, RF-23)
    await this.settle.forUser(context.userId);
    const now = this.clock.now();

    return this.pomodoros.transaction(async (unit) => {
      const task = await this.lockedTask(unit, context.userId, taskId);
      if (task.pomodoroId === null && input.completed !== undefined) {
        throw new AppError('POMODORO_TASK_NOT_IN_SESSION');
      }

      task.edit(input);
      if (input.completed === true) task.complete(now);
      if (input.completed === false) task.uncomplete();
      await unit.saveTasks([task]);
      return task;
    });
  }

  // La tarea con su sesión bloqueada, leída de nuevo tras el bloqueo: así no se cruza con el asentamiento
  // de esa sesión (D-4). Una tarea de una sesión terminada ya no admite cambios (RF-34, RF-35)
  private async lockedTask(unit: PomodoroUnitOfWork, userId: string, taskId: string): Promise<PomodoroTask> {
    const [found] = await unit.findTasks(userId, [taskId]);
    if (!found) throw new AppError('POMODORO_TASK_NOT_FOUND');
    if (found.pomodoroId === null) return found;

    const pomodoro = await unit.lockPomodoro(userId, found.pomodoroId);
    const [task] = await unit.findTasks(userId, [taskId]);
    if (!task) throw new AppError('POMODORO_TASK_NOT_FOUND');
    if (pomodoro && !pomodoro.isActive()) throw new AppError('INVALID_POMODORO_STATE');
    return task;
  }
}
