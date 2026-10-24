import { z } from 'zod';

import { AppError } from '../../domain/app.error.js';

// Mensajes de validación de Zod en español (RNF-03)
z.config(z.locales.es());

// Valida una entrada con un schema Zod; si falla, lanza VALIDATION_ERROR con todos los campos
// erróneos en `details` (RF-46 nivel 5)
export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  throw new AppError(
    'VALIDATION_ERROR',
    result.error.issues.map((issue) => ({
      field: issue.path.length > 0 ? issue.path.join('.') : 'body',
      message: issue.message,
    })),
  );
}
