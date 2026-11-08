import { z } from 'zod';

import { paginationQueryShape } from '../../../shared/infrastructure/http/pagination.schema.js';
import {
  daySchema,
  descriptionSchema,
  editedDescriptionSchema,
  titleSchema,
} from '../../../shared/infrastructure/http/task-text.schema.js';

export const createTaskBodySchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  date: daySchema,
});

// Id de la ruta: solo se valida como cadena; un formato no UUID responde TASK_NOT_FOUND (D-10)
export const taskIdParamsSchema = z.object({ id: z.string() });

// PATCH: solo los campos permitidos y al menos uno; un campo ausente no cambia (RF-13, RF-37)
export const updateTaskBodySchema = z
  .strictObject({
    title: titleSchema.optional(),
    // null, vacía o solo espacios borra la descripción (RF-38)
    description: editedDescriptionSchema,
    completed: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Debe incluir al menos un campo' });

// Consulta de tareas: un día (`date`) o un rango inclusivo (`from`/`to`), nunca ambos (RF-08 a RF-10, RF-40, RF-43)
export const listTasksQuerySchema = z
  .object({
    date: daySchema.optional(),
    from: daySchema.optional(),
    to: daySchema.optional(),
    status: z.enum(['all', 'completed', 'pending']).default('all'),
    ...paginationQueryShape,
  })
  .superRefine((query, ctx) => {
    if (query.date && (query.from || query.to)) {
      ctx.addIssue({ code: 'custom', path: ['date'], message: 'No se puede combinar date con from o to' });
    } else if (query.from && query.to && query.from.isAfter(query.to)) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'Debe ser igual o posterior a from' });
    }
  });
