import { z } from 'zod';

import { LocalDate } from '../../domain/local-date.value-object.js';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from '../../domain/task-text.constant.js';

// Reglas de entrada del texto y del día de una tarea, compartidas por las tareas de la 001 y las del
// pomodoro para que no diverjan (RF-06 y RF-53 de la 004, D-8 del plan de la 004)

// Día de calendario AAAA-MM-DD convertido en LocalDate (RF-06 de la 001)
export const daySchema = z
  .string()
  .refine((value) => LocalDate.tryParse(value) !== null, {
    message: 'Debe ser un día válido con el formato AAAA-MM-DD',
  })
  .transform((value) => LocalDate.parse(value));

// Título: 1–200 caracteres tras recortar espacios (RF-04 y RF-38 de la 001)
export const titleSchema = z.string().trim().min(1).max(TITLE_MAX_LENGTH);

// Una descripción vacía (ya recortada) o ausente se guarda como null (RF-38 de la 001)
function emptyToNull(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value;
}

// Descripción al crear: hasta 1000 caracteres tras recortar; vacía o ausente se guarda como null (RF-05 y RF-38 de la 001)
export const descriptionSchema = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX_LENGTH)
  .nullish()
  .transform(emptyToNull);

// Descripción al editar: ausente no cambia; null, vacía o solo espacios la borra (RF-13 y RF-38 de la 001)
export const editedDescriptionSchema = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX_LENGTH)
  .nullable()
  .transform(emptyToNull)
  .optional();
