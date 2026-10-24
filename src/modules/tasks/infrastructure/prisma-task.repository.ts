import type { Prisma, PrismaClient } from '@prisma/client';

import { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import type { Pagination } from '../../../shared/domain/pagination.value-object.js';
import type { NewTask, Task } from '../domain/task.entity.js';
import type { TaskFilters, TaskPageResult, TaskRepository } from '../domain/task.repository.js';
import { toTaskDomain } from './task.mapper.js';

// Orden de las listas: fecha y, dentro de cada fecha, orden de creación exacto (RF-41, D-24)
const TASK_ORDER: Prisma.TaskOrderByWithRelationInput[] = [{ date: 'asc' }, { sequence: 'asc' }];

export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(task: NewTask): Promise<Task> {
    const row = await this.prisma.task.create({
      data: {
        userId: task.userId,
        title: task.title,
        description: task.description,
        date: task.date.toUtcDate(),
      },
    });
    return toTaskDomain(row);
  }

  async findById(userId: string, id: string): Promise<Task | null> {
    const row = await this.prisma.task.findFirst({ where: { id, userId } });
    return row ? toTaskDomain(row) : null;
  }

  async update(task: Task): Promise<Task> {
    const row = await this.prisma.task.update({
      where: { id: task.id },
      data: { title: task.title, description: task.description, completed: task.completed },
    });
    return toTaskDomain(row);
  }

  async findPage(userId: string, filters: TaskFilters, pagination: Pagination): Promise<TaskPageResult> {
    const where: Prisma.TaskWhereInput = {
      userId,
      ...(filters.date ? { date: filters.date.toUtcDate() } : {}),
      ...(filters.status !== 'all' ? { completed: filters.status === 'completed' } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({ where, orderBy: TASK_ORDER, skip: pagination.offset, take: pagination.pageSize }),
      this.prisma.task.count({ where }),
    ]);
    return { items: rows.map(toTaskDomain), total };
  }

  // SELECT DISTINCT sobre el índice (user_id, completed, date): como mucho un valor por día (R-6)
  async findProductiveDates(userId: string, until: LocalDate): Promise<LocalDate[]> {
    const rows = await this.prisma.$queryRaw<{ date: Date }[]>`
      SELECT DISTINCT "date" FROM "tasks"
      WHERE "user_id" = ${userId} AND "completed" = true AND "date" <= ${until.toString()}::date
      ORDER BY "date"`;
    return rows.map((row) => LocalDate.fromUtcDate(row.date));
  }
}
