import { z } from 'zod';

import {
  daySchema,
  descriptionSchema,
  taskPatchBodySchema,
  titleSchema,
} from '../../../shared/infrastructure/http/task-text.schema.js';
import {
  DEFAULT_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  MAX_TASKS_PER_POMODORO,
  MIN_DURATION_MINUTES,
} from '../domain/pomodoro.entity.js';

// Tarea nueva: mismas reglas de texto y día que las tareas de la 001 (RF-06, RF-53; plan, D-8)
const newTaskSchema = z.strictObject({
  title: titleSchema,
  description: descriptionSchema,
  date: daySchema,
});

// Ids de tareas en espera, sin repetir (RF-56); su existencia la comprueba el caso de uso (RF-11)
const waitingTaskIdsSchema = z
  .array(z.string())
  .refine((ids) => new Set(ids).size === ids.length, { message: 'No se puede incluir la misma tarea dos veces' });

// POST /pomodoros: todos los campos son opcionales (RF-49); duración entera de 1 a 120, 25 por defecto (RF-09, RF-55);
// como mucho 20 tareas entre las nuevas y las en espera (RF-10, RF-56)
export const startPomodoroBodySchema = z
  .strictObject({
    durationMinutes: z.number().int().min(MIN_DURATION_MINUTES).max(MAX_DURATION_MINUTES).default(DEFAULT_DURATION_MINUTES),
    newTasks: z.array(newTaskSchema).default([]),
    waitingTaskIds: waitingTaskIdsSchema.default([]),
  })
  .refine((body) => body.newTasks.length + body.waitingTaskIds.length <= MAX_TASKS_PER_POMODORO, {
    path: ['newTasks'],
    message: `Una sesión no puede tener más de ${MAX_TASKS_PER_POMODORO} tareas`,
  });

// Id de la ruta: solo se valida como cadena; un formato no UUID responde *_NOT_FOUND (D-10 de la 001)
export const idParamsSchema = z.object({ id: z.string() });

// PATCH /pomodoro-tasks/{id}: las mismas reglas que PATCH /tasks/{id} de la 001: solo título, descripción y
// completed, y al menos uno; la fecha no se edita (RF-13, RF-48, RF-54; plan, D-8)
export const updatePomodoroTaskBodySchema = taskPatchBodySchema;

// PATCH /pomodoros/{id}: pausar (paused), reanudar (running) o terminar (finished); status es obligatorio y es
// el único campo (RF-50)
export const changePomodoroStatusBodySchema = z.strictObject({
  status: z.enum(['paused', 'running', 'finished']),
});

// POST /pomodoros/{id}/tasks: las mismas listas que al empezar, con al menos una tarea entre las dos (RF-51). El
// límite de 20 lo comprueba el caso de uso con las que ya tiene la sesión (RF-59)
export const addPomodoroTasksBodySchema = z
  .strictObject({
    newTasks: z.array(newTaskSchema).default([]),
    waitingTaskIds: waitingTaskIdsSchema.default([]),
  })
  .refine((body) => body.newTasks.length + body.waitingTaskIds.length > 0, {
    path: ['newTasks'],
    message: 'Debe incluir al menos una tarea',
  });

// Ruta de una tarea dentro de una sesión: los dos ids solo se validan como cadenas (D-10 de la 001)
export const sessionTaskParamsSchema = z.object({ id: z.string(), taskId: z.string() });
