import { Prisma, type PrismaClient } from '@prisma/client';

import { AppError } from '../../../shared/domain/app.error.js';
import { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import type { Pagination } from '../../../shared/domain/pagination.value-object.js';
import { type NewPomodoroTask, PomodoroTask } from '../domain/pomodoro-task.entity.js';
import { type NewPomodoro, Pomodoro } from '../domain/pomodoro.entity.js';
import type {
  DuePomodoro,
  PageResult,
  PomodoroRepository,
  PomodoroUnitOfWork,
} from '../domain/pomodoro.repository.js';
import { toPomodoroDomain, toPomodoroTaskDomain, toPomodoroTaskUpdate, toPomodoroUpdate } from './pomodoro.mapper.js';

const UNIQUE_VIOLATION = 'P2002';
// Listado de la más reciente a la más antigua (RF-18)
const POMODORO_ORDER: Prisma.PomodoroOrderByWithRelationInput[] = [{ startedAt: 'desc' }, { id: 'desc' }];
// Tareas de una sesión en el orden en que se añadieron (RF-64)
const SESSION_TASK_ORDER: Prisma.PomodoroTaskOrderByWithRelationInput = { position: 'asc' };
// Tareas en espera por fecha y orden de creación exacto (RF-24)
const WAITING_TASK_ORDER: Prisma.PomodoroTaskOrderByWithRelationInput[] = [{ date: 'asc' }, { sequence: 'asc' }];

// Operaciones de una transacción: cada sesión se bloquea con SELECT … FOR UPDATE antes de leerla (plan, D-4)
class PrismaPomodoroUnitOfWork implements PomodoroUnitOfWork {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async lockPomodoro(userId: string, pomodoroId: string): Promise<Pomodoro | null> {
    if (!Pomodoro.isValidId(pomodoroId)) return null;
    await this.tx.$queryRaw`
      SELECT 1 FROM "pomodoros" WHERE "id" = ${pomodoroId}::uuid AND "user_id" = ${userId}::uuid FOR UPDATE`;
    const row = await this.tx.pomodoro.findFirst({ where: { id: pomodoroId, userId } });
    return row ? toPomodoroDomain(row) : null;
  }

  async lockActivePomodoro(userId: string): Promise<Pomodoro | null> {
    const [active] = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "pomodoros" WHERE "active_user_id" = ${userId}::uuid FOR UPDATE`;
    if (!active) return null;
    const row = await this.tx.pomodoro.findUnique({ where: { id: active.id } });
    return row ? toPomodoroDomain(row) : null;
  }

  // El índice único de active_user_id cubre también dos inicios simultáneos (RF-12, D-3)
  async createPomodoro(data: NewPomodoro): Promise<Pomodoro> {
    try {
      const row = await this.tx.pomodoro.create({
        data: { ...data, activeUserId: data.userId, status: 'running' },
      });
      return toPomodoroDomain(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        throw new AppError('POMODORO_ALREADY_ACTIVE');
      }
      throw error;
    }
  }

  async savePomodoro(pomodoro: Pomodoro): Promise<void> {
    await this.tx.pomodoro.update({ where: { id: pomodoro.id }, data: toPomodoroUpdate(pomodoro) });
  }

  async tasksOf(pomodoroId: string): Promise<PomodoroTask[]> {
    const rows = await this.tx.pomodoroTask.findMany({ where: { pomodoroId }, orderBy: SESSION_TASK_ORDER });
    return rows.map(toPomodoroTaskDomain);
  }

  async maxPosition(pomodoroId: string): Promise<number> {
    const result = await this.tx.pomodoroTask.aggregate({ where: { pomodoroId }, _max: { position: true } });
    return result._max.position ?? 0;
  }

  async findTasks(userId: string, ids: readonly string[]): Promise<PomodoroTask[]> {
    const validIds = ids.filter((id) => PomodoroTask.isValidId(id));
    if (validIds.length === 0) return [];
    const rows = await this.tx.pomodoroTask.findMany({ where: { userId, id: { in: validIds } } });
    return rows.map(toPomodoroTaskDomain);
  }

  // Una a una y en orden: como mucho 20 por petición (RF-10), y sequence sigue el orden recibido (RF-24)
  async createTasks(tasks: readonly NewPomodoroTask[]): Promise<PomodoroTask[]> {
    const created: PomodoroTask[] = [];
    for (const task of tasks) {
      const row = await this.tx.pomodoroTask.create({
        data: { ...task, date: task.date.toUtcDate() },
      });
      created.push(toPomodoroTaskDomain(row));
    }
    return created;
  }

  async saveTasks(tasks: readonly PomodoroTask[]): Promise<void> {
    for (const task of tasks) {
      await this.tx.pomodoroTask.update({ where: { id: task.id }, data: toPomodoroTaskUpdate(task) });
    }
  }

  // deleteMany para filtrar también por usuario sin fallar si no hay fila
  async deleteTask(userId: string, taskId: string): Promise<void> {
    if (!PomodoroTask.isValidId(taskId)) return;
    await this.tx.pomodoroTask.deleteMany({ where: { id: taskId, userId } });
  }
}

export class PrismaPomodoroRepository implements PomodoroRepository {
  constructor(private readonly prisma: PrismaClient) {}

  transaction<T>(work: (unit: PomodoroUnitOfWork) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(new PrismaPomodoroUnitOfWork(tx)));
  }

  async findById(userId: string, pomodoroId: string): Promise<Pomodoro | null> {
    if (!Pomodoro.isValidId(pomodoroId)) return null;
    const row = await this.prisma.pomodoro.findFirst({ where: { id: pomodoroId, userId } });
    return row ? toPomodoroDomain(row) : null;
  }

  async findPage(userId: string, pagination: Pagination): Promise<PageResult<Pomodoro>> {
    const where: Prisma.PomodoroWhereInput = { userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.pomodoro.findMany({ where, orderBy: POMODORO_ORDER, skip: pagination.offset, take: pagination.pageSize }),
      this.prisma.pomodoro.count({ where }),
    ]);
    return { items: rows.map(toPomodoroDomain), total };
  }

  async findTasksOf(pomodoroId: string): Promise<PomodoroTask[]> {
    const rows = await this.prisma.pomodoroTask.findMany({ where: { pomodoroId }, orderBy: SESSION_TASK_ORDER });
    return rows.map(toPomodoroTaskDomain);
  }

  async findTask(userId: string, taskId: string): Promise<PomodoroTask | null> {
    if (!PomodoroTask.isValidId(taskId)) return null;
    const row = await this.prisma.pomodoroTask.findFirst({ where: { id: taskId, userId } });
    return row ? toPomodoroTaskDomain(row) : null;
  }

  // Usa el índice (user_id, pomodoro_id, completed, date, sequence) (RF-24)
  async findWaitingPage(userId: string, pagination: Pagination): Promise<PageResult<PomodoroTask>> {
    const where: Prisma.PomodoroTaskWhereInput = { userId, pomodoroId: null, completed: false };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.pomodoroTask.findMany({
        where,
        orderBy: WAITING_TASK_ORDER,
        skip: pagination.offset,
        take: pagination.pageSize,
      }),
      this.prisma.pomodoroTask.count({ where }),
    ]);
    return { items: rows.map(toPomodoroTaskDomain), total };
  }

  async findDueId(userId: string, now: Date): Promise<string | null> {
    const row = await this.prisma.pomodoro.findFirst({
      where: { userId, status: 'running', endsAt: { lte: now } },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  // Usa el índice (status, ends_at) (D-2)
  findDue(now: Date, limit: number): Promise<DuePomodoro[]> {
    return this.prisma.pomodoro.findMany({
      where: { status: 'running', endsAt: { lte: now } },
      orderBy: { endsAt: 'asc' },
      take: limit,
      select: { id: true, userId: true },
    });
  }

  // SELECT DISTINCT sobre el índice (user_id, end_reason, finished_on) (RF-38, RF-41)
  async findProductiveDates(userId: string, until: LocalDate): Promise<LocalDate[]> {
    const rows = await this.prisma.$queryRaw<{ finished_on: Date }[]>`
      SELECT DISTINCT "finished_on" FROM "pomodoros"
      WHERE "user_id" = ${userId}::uuid AND "end_reason" = 'time' AND "finished_on" <= ${until.toString()}::date
      ORDER BY "finished_on"`;
    return rows.map((row) => LocalDate.fromUtcDate(row.finished_on));
  }
}
