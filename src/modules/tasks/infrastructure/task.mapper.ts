import type { Task as TaskRow } from '@prisma/client';

import { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import { Task } from '../domain/task.entity.js';

// Recurso Task del contrato de la API (spec, Contrato de la API)
export interface TaskResponse {
  id: string;
  title: string;
  description: string | null;
  date: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

// Fila de Prisma → entidad; la columna DATE llega como Date a medianoche UTC (R-4)
export function toTaskDomain(row: TaskRow): Task {
  return Task.restore({
    id: row.id,
    userId: row.userId,
    title: row.title,
    description: row.description,
    date: LocalDate.fromUtcDate(row.date),
    completed: row.completed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toTaskResponse(task: Task): TaskResponse {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    date: task.date.toString(),
    completed: task.completed,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
