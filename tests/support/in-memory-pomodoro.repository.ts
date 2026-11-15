import { randomUUID } from 'node:crypto';

import {
  type NewPomodoroTask,
  PomodoroTask,
  type PomodoroTaskProps,
} from '../../src/modules/pomodoros/domain/pomodoro-task.entity.js';
import { type NewPomodoro, Pomodoro, type PomodoroProps } from '../../src/modules/pomodoros/domain/pomodoro.entity.js';
import type {
  AchievementRepository,
  AchievementStats,
  UnlockedAchievement,
} from '../../src/modules/pomodoros/domain/achievement.repository.js';
import type {
  DuePomodoro,
  PageResult,
  PomodoroRepository,
  PomodoroUnitOfWork,
} from '../../src/modules/pomodoros/domain/pomodoro.repository.js';
import { AppError } from '../../src/shared/domain/app.error.js';
import type { LocalDate } from '../../src/shared/domain/local-date.value-object.js';
import type { Pagination } from '../../src/shared/domain/pagination.value-object.js';

interface StoredTask {
  props: PomodoroTaskProps;
  // Orden de creación exacto, como pomodoro_tasks.sequence
  sequence: number;
}

// Implementación en memoria de PomodoroRepository con la misma semántica que la de Prisma: una sola sesión
// activa por usuario, tareas por position y en espera por fecha y creación (plan de la 004, T015).
// Las transacciones se ejecutan una a una; si el trabajo falla, se deshacen sus cambios
export class InMemoryPomodoroRepository implements PomodoroRepository {
  private pomodoros = new Map<string, PomodoroProps>();
  private tasks = new Map<string, StoredTask>();
  // Logros conseguidos por usuario: código → instante
  private unlocked = new Map<string, Map<string, Date>>();
  private sequence = 0;

  // Logros calculados con las sesiones y tareas de este repositorio, como hace la base de datos (plan, 5.9)
  readonly achievements: AchievementRepository = {
    stats: async (userId) => this.stats(userId),
    listUnlocked: async (userId) => this.listUnlocked(userId),
    unlock: async (userId, codes, at) => this.unlock(userId, codes, at),
  };

  async transaction<T>(work: (unit: PomodoroUnitOfWork) => Promise<T>): Promise<T> {
    const pomodoros = new Map([...this.pomodoros].map(([id, props]) => [id, { ...props }]));
    const tasks = new Map([...this.tasks].map(([id, task]) => [id, { ...task, props: { ...task.props } }]));
    const unlocked = new Map([...this.unlocked].map(([userId, codes]) => [userId, new Map(codes)]));
    try {
      return await work(this.unitOfWork());
    } catch (error) {
      this.pomodoros = pomodoros;
      this.tasks = tasks;
      this.unlocked = unlocked;
      throw error;
    }
  }

  async findById(userId: string, pomodoroId: string): Promise<Pomodoro | null> {
    const props = this.pomodoros.get(pomodoroId);
    return props?.userId === userId ? Pomodoro.restore(props) : null;
  }

  async findPage(userId: string, pagination: Pagination): Promise<PageResult<Pomodoro>> {
    const rows = [...this.pomodoros.values()]
      .filter((props) => props.userId === userId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || (a.id < b.id ? 1 : -1));
    return this.page(rows.map((props) => Pomodoro.restore(props)), pagination);
  }

  async findTasksOf(pomodoroId: string): Promise<PomodoroTask[]> {
    return this.sessionTasks(pomodoroId);
  }

  async findTask(userId: string, taskId: string): Promise<PomodoroTask | null> {
    const task = this.tasks.get(taskId);
    return task?.props.userId === userId ? this.restoreTask(task) : null;
  }

  async findWaitingPage(userId: string, pagination: Pagination): Promise<PageResult<PomodoroTask>> {
    const rows = [...this.tasks.values()]
      .filter(({ props }) => props.userId === userId && props.pomodoroId === null && !props.completed)
      .sort((a, b) => a.props.date.compare(b.props.date) || a.sequence - b.sequence);
    return this.page(rows.map((task) => this.restoreTask(task)), pagination);
  }

  async findDueId(userId: string, now: Date): Promise<string | null> {
    return this.due(now).find((pomodoro) => pomodoro.userId === userId)?.id ?? null;
  }

  async findDue(now: Date, limit: number): Promise<DuePomodoro[]> {
    return this.due(now)
      .slice(0, limit)
      .map((pomodoro) => ({ id: pomodoro.id, userId: pomodoro.userId }));
  }

  async findProductiveDates(userId: string, until: LocalDate): Promise<LocalDate[]> {
    const dates = new Map<string, LocalDate>();
    for (const props of this.pomodoros.values()) {
      const day = props.finishedOn;
      if (props.userId === userId && props.endReason === 'time' && day && !day.isAfter(until)) {
        dates.set(day.toString(), day);
      }
    }
    return [...dates.values()].sort((a, b) => a.compare(b));
  }

  private unitOfWork(): PomodoroUnitOfWork {
    return {
      achievements: this.achievements,
      lockPomodoro: (userId, pomodoroId) => this.findById(userId, pomodoroId),
      lockActivePomodoro: async (userId) => {
        const props = [...this.pomodoros.values()].find((row) => row.userId === userId && row.status !== 'finished');
        return props ? Pomodoro.restore(props) : null;
      },
      createPomodoro: async (data) => this.createPomodoro(data),
      savePomodoro: async (pomodoro) => {
        this.pomodoros.set(pomodoro.id, pomodoro.toProps());
      },
      tasksOf: async (pomodoroId) => this.sessionTasks(pomodoroId),
      maxPosition: async (pomodoroId) =>
        Math.max(0, ...this.sessionTasks(pomodoroId).map((task) => task.position ?? 0)),
      findTasks: async (userId, ids) =>
        ids.flatMap((id) => {
          const task = this.tasks.get(id);
          return task?.props.userId === userId ? [this.restoreTask(task)] : [];
        }),
      createTasks: async (tasks) => tasks.map((task) => this.createTask(task)),
      saveTasks: async (tasks) => {
        for (const task of tasks) {
          const stored = this.tasks.get(task.id);
          if (stored) this.tasks.set(task.id, { props: task.toProps(), sequence: stored.sequence });
        }
      },
      deleteTask: async (userId, taskId) => {
        if (this.tasks.get(taskId)?.props.userId === userId) this.tasks.delete(taskId);
      },
    };
  }

  // Equivale al índice único de active_user_id (RF-12, D-3)
  private createPomodoro(data: NewPomodoro): Pomodoro {
    const active = [...this.pomodoros.values()].some((row) => row.userId === data.userId && row.status !== 'finished');
    if (active) throw new AppError('POMODORO_ALREADY_ACTIVE');
    const props: PomodoroProps = {
      ...data,
      id: randomUUID(),
      status: 'running',
      remainingMs: null,
      finishedAt: null,
      finishedOn: null,
      endReason: null,
      focusedSeconds: null,
      snapshot: null,
      createdAt: data.startedAt,
    };
    this.pomodoros.set(props.id, props);
    return Pomodoro.restore(props);
  }

  private createTask(task: NewPomodoroTask): PomodoroTask {
    const createdAt = new Date(Date.UTC(2026, 0, 1) + this.sequence * 1000);
    const stored: StoredTask = {
      props: { ...task, id: randomUUID(), completed: false, completedAt: null, createdAt, updatedAt: createdAt },
      sequence: this.sequence++,
    };
    this.tasks.set(stored.props.id, stored);
    return this.restoreTask(stored);
  }

  private sessionTasks(pomodoroId: string): PomodoroTask[] {
    return [...this.tasks.values()]
      .filter(({ props }) => props.pomodoroId === pomodoroId)
      .sort((a, b) => (a.props.position ?? 0) - (b.props.position ?? 0))
      .map((task) => this.restoreTask(task));
  }

  private due(now: Date): PomodoroProps[] {
    return [...this.pomodoros.values()]
      .filter((props) => props.status === 'running' && props.endsAt !== null && props.endsAt <= now)
      .sort((a, b) => (a.endsAt?.getTime() ?? 0) - (b.endsAt?.getTime() ?? 0));
  }

  private stats(userId: string): AchievementStats {
    const finished = [...this.pomodoros.values()].filter((props) => props.userId === userId && props.status === 'finished');
    const timed = finished.filter((props) => props.endReason === 'time');
    const perDay = new Map<string, number>();
    for (const props of timed) {
      const key = props.finishedOn?.toString() ?? '';
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    const days = new Map(timed.flatMap((props) => (props.finishedOn ? [[props.finishedOn.toString(), props.finishedOn]] : [])));
    return {
      timedSessions: timed.length,
      bestDaySessions: Math.max(0, ...perDay.values()),
      completedTasks: [...this.tasks.values()].filter(({ props }) => props.userId === userId && props.completed).length,
      focusedSeconds: finished.reduce((total, props) => total + (props.focusedSeconds ?? 0), 0),
      productiveDates: [...days.values()].sort((a, b) => a.compare(b)),
    };
  }

  private listUnlocked(userId: string): UnlockedAchievement[] {
    return [...(this.unlocked.get(userId) ?? new Map<string, Date>())].map(([code, unlockedAt]) => ({ code, unlockedAt }));
  }

  // Como skipDuplicates: un logro ya guardado conserva su instante
  private unlock(userId: string, codes: readonly string[], at: Date): void {
    const userCodes = this.unlocked.get(userId) ?? new Map<string, Date>();
    for (const code of codes) if (!userCodes.has(code)) userCodes.set(code, at);
    this.unlocked.set(userId, userCodes);
  }

  private restoreTask(task: StoredTask): PomodoroTask {
    return PomodoroTask.restore(task.props);
  }

  private page<T>(items: T[], pagination: Pagination): PageResult<T> {
    return { items: items.slice(pagination.offset, pagination.offset + pagination.pageSize), total: items.length };
  }
}
