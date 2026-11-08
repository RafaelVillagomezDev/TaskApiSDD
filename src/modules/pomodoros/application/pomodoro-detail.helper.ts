import type { PomodoroTask } from '../domain/pomodoro-task.entity.js';
import type { Pomodoro, PomodoroTaskSnapshot } from '../domain/pomodoro.entity.js';

// Sesión con sus tareas y el tiempo restante en el instante de la petición: lo que devuelven las rutas de
// sesiones (recurso Pomodoro de la spec)
export interface PomodoroDetail {
  pomodoro: Pomodoro;
  // Estado actual mientras está activa; la foto del fin cuando está terminada (RF-16, RF-58), en orden (RF-64)
  tasks: PomodoroTaskSnapshot[];
  remainingSeconds: number;
}

export function buildPomodoroDetail(pomodoro: Pomodoro, currentTasks: readonly PomodoroTask[], now: Date): PomodoroDetail {
  return {
    pomodoro,
    tasks: pomodoro.snapshot ?? currentTasks.map((task) => task.toSnapshot()),
    remainingSeconds: pomodoro.remainingSeconds(now),
  };
}
