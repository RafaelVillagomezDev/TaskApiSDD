import { z } from 'zod';

import { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import { paginationQueryShape } from '../../../shared/infrastructure/http/pagination.schema.js';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from '../domain/task.entity.js';

// Día de calendario AAAA-MM-DD convertido en LocalDate (RF-06)
export const daySchema = z
  .string()
  .refine((value) => LocalDate.tryParse(value) !== null, {
    message: 'Debe ser un día válido con el formato AAAA-MM-DD',
  })
  .transform((value) => LocalDate.parse(value));

// Título: 1–200 caracteres tras recortar espacios (RF-04, RF-38)
const titleSchema = z.string().trim().min(1).max(TITLE_MAX_LENGTH);

// Descripción: hasta 1000 caracteres tras recortar; vacía o ausente se guarda como null (RF-05, RF-38)
const descriptionSchema = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX_LENGTH)
  .nullish()
  .transform((value) => (value ? value : null));

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
    description: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX_LENGTH)
      .nullable()
      .transform((value) => (value ? value : null))
      .optional(),
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
