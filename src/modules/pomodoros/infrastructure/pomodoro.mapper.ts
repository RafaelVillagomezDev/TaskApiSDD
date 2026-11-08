import {
  Prisma,
  type Pomodoro as PomodoroRow,
  type PomodoroTask as PomodoroTaskRow,
} from '@prisma/client';
import { z } from 'zod';

import { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import type { PomodoroDetail } from '../application/pomodoro-detail.helper.js';
import { PomodoroTask } from '../domain/pomodoro-task.entity.js';
import { Pomodoro, type PomodoroTaskSnapshot } from '../domain/pomodoro.entity.js';

// Forma guardada de la foto en tasks_snapshot (plan, sección 4; D-9). Se valida al leerla porque JSONB
// no tiene tipo en la base de datos
const storedSnapshotSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    date: z.string(),
    completed: z.boolean(),
    completedAt: z.string().nullable(),
  }),
);

function toSnapshotDomain(value: Prisma.JsonValue | null): PomodoroTaskSnapshot[] | null {
  if (value === null) return null;
  return storedSnapshotSchema.parse(value).map((task) => ({
    ...task,
    date: LocalDate.parse(task.date),
    completedAt: task.completedAt === null ? null : new Date(task.completedAt),
  }));
}

function toSnapshotJson(snapshot: readonly PomodoroTaskSnapshot[]): Prisma.InputJsonValue {
  return snapshot.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    date: task.date.toString(),
    completed: task.completed,
    completedAt: task.completedAt?.toISOString() ?? null,
  }));
}

// Fila de Prisma → entidad; las columnas DATE llegan como Date a medianoche UTC (R-4 de la 001)
export function toPomodoroDomain(row: PomodoroRow): Pomodoro {
  return Pomodoro.restore({
    id: row.id,
    userId: row.userId,
    durationMinutes: row.durationMinutes,
    status: row.status,
    startedAt: row.startedAt,
    endsAt: row.endsAt,
    remainingMs: row.remainingMs,
    finishedAt: row.finishedAt,
    finishedOn: row.finishedOn ? LocalDate.fromUtcDate(row.finishedOn) : null,
    endReason: row.endReason,
    focusedSeconds: row.focusedSeconds,
    snapshot: toSnapshotDomain(row.tasksSnapshot),
    createdAt: row.createdAt,
  });
}

// Columnas que cambian al pausar, reanudar o terminar. active_user_id se libera al terminar (RF-12, D-3)
export function toPomodoroUpdate(pomodoro: Pomodoro): Prisma.PomodoroUncheckedUpdateInput {
  const snapshot = pomodoro.snapshot;
  return {
    activeUserId: pomodoro.isActive() ? pomodoro.userId : null,
    status: pomodoro.status,
    endsAt: pomodoro.endsAt,
    remainingMs: pomodoro.remainingMs,
    finishedAt: pomodoro.finishedAt,
    finishedOn: pomodoro.finishedOn?.toUtcDate() ?? null,
    endReason: pomodoro.endReason,
    focusedSeconds: pomodoro.focusedSeconds,
    tasksSnapshot: snapshot ? toSnapshotJson(snapshot) : Prisma.DbNull,
  };
}

export function toPomodoroTaskDomain(row: PomodoroTaskRow): PomodoroTask {
  return PomodoroTask.restore({
    id: row.id,
    userId: row.userId,
    pomodoroId: row.pomodoroId,
    title: row.title,
    description: row.description,
    date: LocalDate.fromUtcDate(row.date),
    completed: row.completed,
    completedAt: row.completedAt,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

// Columnas que cambian al mover, editar o completar una tarea
export function toPomodoroTaskUpdate(task: PomodoroTask): Prisma.PomodoroTaskUncheckedUpdateInput {
  return {
    pomodoroId: task.pomodoroId,
    title: task.title,
    description: task.description,
    date: task.date.toUtcDate(),
    completed: task.completed,
    completedAt: task.completedAt,
    position: task.position,
  };
}

// Recurso PomodoroTask del contrato de la API (spec, Contrato de la API)
export interface PomodoroTaskResponse {
  id: string;
  title: string;
  description: string | null;
  date: string;
  completed: boolean;
  completedAt: string | null;
}

// Recurso Pomodoro del contrato de la API (spec, Contrato de la API)
export interface PomodoroResponse {
  id: string;
  durationMinutes: number;
  status: string;
  startedAt: string;
  endsAt: string | null;
  remainingSeconds: number;
  finishedAt: string | null;
  focusedSeconds: number | null;
  endReason: string | null;
  tasks: PomodoroTaskResponse[];
  completedTasks: number;
  totalTasks: number;
  createdAt: string;
}

// Sirve igual para una tarea actual (toSnapshot) que para una de la foto de una sesión terminada (RF-16)
export function toPomodoroTaskResponse(task: PomodoroTaskSnapshot): PomodoroTaskResponse {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    date: task.date.toString(),
    completed: task.completed,
    completedAt: task.completedAt?.toISOString() ?? null,
  };
}

export function toPomodoroResponse({ pomodoro, tasks, remainingSeconds }: PomodoroDetail): PomodoroResponse {
  return {
    id: pomodoro.id,
    durationMinutes: pomodoro.durationMinutes,
    status: pomodoro.status,
    startedAt: pomodoro.startedAt.toISOString(),
    endsAt: pomodoro.endsAt?.toISOString() ?? null,
    remainingSeconds,
    finishedAt: pomodoro.finishedAt?.toISOString() ?? null,
    focusedSeconds: pomodoro.focusedSeconds,
    endReason: pomodoro.endReason,
    tasks: tasks.map(toPomodoroTaskResponse),
    // Resumen del resultado («3 de 5»), calculado sobre las tareas que se devuelven
    completedTasks: tasks.filter((task) => task.completed).length,
    totalTasks: tasks.length,
    createdAt: pomodoro.createdAt.toISOString(),
  };
}
