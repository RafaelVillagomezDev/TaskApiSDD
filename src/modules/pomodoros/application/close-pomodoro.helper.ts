import type { PomodoroTask } from '../domain/pomodoro-task.entity.js';
import type { PomodoroUnitOfWork } from '../domain/pomodoro.repository.js';

// Al terminar una sesión, por tiempo o a mano, sus tareas pendientes pasan a espera y las completadas se
// quedan en ella como resultado (RF-23, RF-35). La foto ya se ha guardado en la sesión (RF-16)
export async function moveUnfinishedToWaiting(unit: PomodoroUnitOfWork, tasks: readonly PomodoroTask[]): Promise<void> {
  const pending = tasks.filter((task) => !task.completed);
  for (const task of pending) task.moveToWaiting();
  await unit.saveTasks(pending);
}
