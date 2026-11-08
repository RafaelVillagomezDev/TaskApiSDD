import { AppError } from '../../../shared/domain/app.error.js';
import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import type { PomodoroTask } from '../domain/pomodoro-task.entity.js';
import type { Pomodoro } from '../domain/pomodoro.entity.js';
import type { PomodoroUnitOfWork } from '../domain/pomodoro.repository.js';

// Tarea nueva ya validada (RF-06, RF-53)
export interface NewTaskInput {
  title: string;
  description: string | null;
  date: LocalDate;
}

export interface AppendTasksInput {
  userId: string;
  pomodoroId: string;
  today: LocalDate;
  newTasks: readonly NewTaskInput[];
  // Ya comprobadas con findWaitingTasks
  waiting: readonly PomodoroTask[];
}

// Las tareas en espera pedidas, en el orden del cuerpo; si alguna no existe, es de otro usuario o no está en
// espera → POMODORO_TASK_NOT_FOUND (RF-11)
export async function findWaitingTasks(
  unit: PomodoroUnitOfWork,
  userId: string,
  ids: readonly string[],
): Promise<PomodoroTask[]> {
  const found = new Map((await unit.findTasks(userId, ids)).map((task) => [task.id, task]));
  return ids.map((id) => {
    const task = found.get(id);
    if (!task?.isWaiting()) throw new AppError('POMODORO_TASK_NOT_FOUND');
    return task;
  });
}

// Añade al final de la sesión las tareas nuevas y después las en espera, cada lista en el orden del cuerpo
// (RF-64, D-12); las en espera con fecha pasada toman la de hoy (RF-21). Devuelve las añadidas en ese orden
export async function appendTasks(unit: PomodoroUnitOfWork, input: AppendTasksInput): Promise<PomodoroTask[]> {
  const first = (await unit.maxPosition(input.pomodoroId)) + 1;
  const created = await unit.createTasks(
    input.newTasks.map((task, index) => ({
      ...task,
      userId: input.userId,
      pomodoroId: input.pomodoroId,
      position: first + index,
    })),
  );
  input.waiting.forEach((task, index) => task.moveTo(input.pomodoroId, first + created.length + index, input.today));
  await unit.saveTasks(input.waiting);
  return [...created, ...input.waiting];
}

export interface LockedTask {
  task: PomodoroTask;
  // Sesión en la que está, bloqueada; null si la tarea está en espera
  pomodoro: Pomodoro | null;
}

// La tarea con su sesión bloqueada, leída de nuevo tras el bloqueo para no cruzarse con el asentamiento de esa
// sesión (D-4). Inexistente o de otro usuario → POMODORO_TASK_NOT_FOUND (RF-07)
export async function lockTaskWithSession(unit: PomodoroUnitOfWork, userId: string, taskId: string): Promise<LockedTask> {
  const [found] = await unit.findTasks(userId, [taskId]);
  if (!found) throw new AppError('POMODORO_TASK_NOT_FOUND');
  if (found.pomodoroId === null) return { task: found, pomodoro: null };

  const pomodoro = await unit.lockPomodoro(userId, found.pomodoroId);
  const [task] = await unit.findTasks(userId, [taskId]);
  if (!task) throw new AppError('POMODORO_TASK_NOT_FOUND');
  return { task, pomodoro: task.pomodoroId === null ? null : pomodoro };
}
