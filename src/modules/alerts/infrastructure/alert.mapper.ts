import type { Prisma, Alert as AlertRow } from '@prisma/client';

import { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import { Alert, type AlertTask } from '../domain/alert.entity.js';

// Copia de una tarea tal como se guarda en la columna JSONB y se expone en el contrato (RF-30)
export interface AlertTaskJson {
  id: string;
  title: string;
  date: string;
}

// Recurso Alert del contrato de la API (spec, GET /alerts)
export interface AlertResponse {
  id: string;
  type: string;
  periodStart: string;
  periodEnd: string;
  tasks: AlertTaskJson[];
  createdAt: string;
}

export function toAlertTaskJson(task: AlertTask): AlertTaskJson {
  return { id: task.id, title: task.title, date: task.date.toString() };
}

// Fila de Prisma → entidad; las columnas DATE llegan como Date a medianoche UTC (R-4)
export function toAlertDomain(row: AlertRow): Alert {
  const tasks = row.tasks as unknown as AlertTaskJson[];
  return Alert.restore({
    id: row.id,
    userId: row.userId,
    type: row.type,
    periodStart: LocalDate.fromUtcDate(row.periodStart),
    periodEnd: LocalDate.fromUtcDate(row.periodEnd),
    tasks: tasks.map((task) => ({ id: task.id, title: task.title, date: LocalDate.parse(task.date) })),
    createdAt: row.createdAt,
  });
}

export function toAlertTasksJsonb(tasks: AlertTask[]): Prisma.InputJsonValue {
  return tasks.map(toAlertTaskJson) as unknown as Prisma.InputJsonValue;
}

export function toAlertResponse(alert: Alert): AlertResponse {
  return {
    id: alert.id,
    type: alert.type,
    periodStart: alert.periodStart.toString(),
    periodEnd: alert.periodEnd.toString(),
    tasks: alert.tasks.map(toAlertTaskJson),
    createdAt: alert.createdAt.toISOString(),
  };
}
