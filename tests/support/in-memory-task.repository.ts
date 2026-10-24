import { randomUUID } from 'node:crypto';

import { type NewTask, Task, type TaskProps } from '../../src/modules/tasks/domain/task.entity.js';
import type {
  TaskFilters,
  TaskPageResult,
  TaskRepository,
} from '../../src/modules/tasks/domain/task.repository.js';
import { LocalDate } from '../../src/shared/domain/local-date.value-object.js';
import type { Pagination } from '../../src/shared/domain/pagination.value-object.js';

// Implementación en memoria de TaskRepository para tests unitarios y HTTP (plan, D-21)
export class InMemoryTaskRepository implements TaskRepository {
  private readonly rows: TaskProps[] = [];
  // Instantes de creación crecientes para que el orden de creación sea determinista
  private sequence = 0;

  async create(task: NewTask): Promise<Task> {
    const createdAt = new Date(Date.UTC(2026, 0, 1) + this.sequence++ * 1000);
    const props: TaskProps = { ...task, id: randomUUID(), completed: false, createdAt, updatedAt: createdAt };
    this.rows.push(props);
    return Task.restore(props);
  }

  async findById(userId: string, id: string): Promise<Task | null> {
    const row = this.rows.find((candidate) => candidate.id === id && candidate.userId === userId);
    return row ? Task.restore(row) : null;
  }

  async update(task: Task): Promise<Task> {
    const index = this.rows.findIndex((row) => row.id === task.id);
    if (index === -1) throw new Error(`Tarea ${task.id} inexistente en el repositorio en memoria`);
    const props: TaskProps = { ...task.toProps(), updatedAt: new Date(Date.UTC(2026, 0, 1) + this.sequence++ * 1000) };
    this.rows[index] = props;
    return Task.restore(props);
  }

  async findPage(userId: string, filters: TaskFilters, pagination: Pagination): Promise<TaskPageResult> {
    const matching = this.rows
      .filter((row) => row.userId === userId)
      .filter((row) => !filters.date || row.date.equals(filters.date))
      .filter((row) => filters.status === 'all' || row.completed === (filters.status === 'completed'))
      .sort((a, b) => a.date.compare(b.date) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    return {
      items: matching.slice(pagination.offset, pagination.offset + pagination.pageSize).map((row) => Task.restore(row)),
      total: matching.length,
    };
  }

  async findProductiveDates(userId: string, until: LocalDate): Promise<LocalDate[]> {
    const unique = new Set(
      this.rows
        .filter((row) => row.userId === userId && row.completed && !row.date.isAfter(until))
        .map((row) => row.date.toString()),
    );
    return [...unique].sort().map((value) => LocalDate.parse(value));
  }

  // Ayuda para los tests: número total de tareas guardadas
  count(): number {
    return this.rows.length;
  }
}
