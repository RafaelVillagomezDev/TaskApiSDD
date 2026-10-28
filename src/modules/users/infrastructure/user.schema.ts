import { z } from 'zod';

import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../domain/user.entity.js';

// Email recortado y en minúsculas, con formato válido y hasta 254 caracteres (RF-02, RF-03)
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH)
  .pipe(z.email({ error: 'Debe ser un email válido' }));

// Contraseña de 12 a 128 caracteres, sin recortar ni reglas de composición (RF-04)
const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

// Un nombre vacío (ya recortado) o ausente se guarda como null (RF-05)
function emptyToNull(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value;
}

// Nombre visible opcional: hasta 100 caracteres tras recortar (RF-05)
const nameSchema = z.string().trim().max(NAME_MAX_LENGTH).nullish().transform(emptyToNull);

export const registerBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
});

// Mismos límites que en el registro: un login fuera de ellos no llega a comprobar la contraseña (RF-02, RF-04)
export const loginBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

// PATCH /me: solo el nombre, obligatorio y que admite null; cualquier otro campo, incluido el email,
// es VALIDATION_ERROR (RF-05, RF-26)
export const updateProfileBodySchema = z.strictObject({
  name: z.string().trim().max(NAME_MAX_LENGTH).nullable().transform(emptyToNull),
});
