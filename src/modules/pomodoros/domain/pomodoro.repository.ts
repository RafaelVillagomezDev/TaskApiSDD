import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import type { Pagination } from '../../../shared/domain/pagination.value-object.js';
import type { AchievementRepository } from './achievement.repository.js';
import type { NewPomodoroTask, PomodoroTask } from './pomodoro-task.entity.js';
import type { NewPomodoro, Pomodoro } from './pomodoro.entity.js';

export interface PageResult<T> {
  items: T[];
  total: number;
}

// Sesión vencida pendiente de asentar (RF-15; plan, D-2)
export interface DuePomodoro {
  id: string;
  userId: string;
}

// Operaciones dentro de una transacción. Las sesiones se leen bloqueadas hasta el final de la transacción,
// para que el barrido, las pestañas y las peticiones del mismo usuario no se pisen (plan, D-4)
export interface PomodoroUnitOfWork {
  // Logros dentro de la misma transacción: sus estadísticas ven los cambios aún sin confirmar (plan, 5.9)
  readonly achievements: AchievementRepository;
  // null si no existe o es de otro usuario
  lockPomodoro(userId: string, pomodoroId: string): Promise<Pomodoro | null>;
  lockActivePomodoro(userId: string): Promise<Pomodoro | null>;
  // Lanza POMODORO_ALREADY_ACTIVE si el usuario ya tiene una sesión activa (RF-12, D-3)
  createPomodoro(data: NewPomodoro): Promise<Pomodoro>;
  savePomodoro(pomodoro: Pomodoro): Promise<void>;
  // Tareas de una sesión en orden de position (RF-64)
  tasksOf(pomodoroId: string): Promise<PomodoroTask[]>;
  // Mayor position de la sesión, o 0 si no tiene tareas (D-12)
  maxPosition(pomodoroId: string): Promise<number>;
  // Tareas del usuario con esos ids; las que no existen o son de otro usuario no aparecen
  findTasks(userId: string, ids: readonly string[]): Promise<PomodoroTask[]>;
  // Crea en el orden recibido (RF-64)
  createTasks(tasks: readonly NewPomodoroTask[]): Promise<PomodoroTask[]>;
  saveTasks(tasks: readonly PomodoroTask[]): Promise<void>;
  deleteTask(userId: string, taskId: string): Promise<void>;
}

// Puerto de salida de las sesiones y las tareas del pomodoro (plan, 5.1)
export interface PomodoroRepository {
  transaction<T>(work: (unit: PomodoroUnitOfWork) => Promise<T>): Promise<T>;
  findById(userId: string, pomodoroId: string): Promise<Pomodoro | null>;
  // De la más reciente a la más antigua (RF-18)
  findPage(userId: string, pagination: Pagination): Promise<PageResult<Pomodoro>>;
  // Tareas actuales de una sesión, en orden de position (RF-58, RF-64)
  findTasksOf(pomodoroId: string): Promise<PomodoroTask[]>;
  findTask(userId: string, taskId: string): Promise<PomodoroTask | null>;
  // Tareas en espera por fecha y orden de creación (RF-24)
  findWaitingPage(userId: string, pagination: Pagination): Promise<PageResult<PomodoroTask>>;
  // Sesión en curso del usuario con el fin previsto ya alcanzado, si la hay
  findDueId(userId: string, now: Date): Promise<string | null>;
  // Sesiones en curso vencidas de todos los usuarios, como mucho `limit` (D-2)
  findDue(now: Date, limit: number): Promise<DuePomodoro[]>;
  // Días productivos de pomodoro hasta `until`, sin repetir y en orden (RF-38, RF-41)
  findProductiveDates(userId: string, until: LocalDate): Promise<LocalDate[]>;
}
