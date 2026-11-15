import { z } from 'zod';

import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../domain/user.entity.js';
import { TURNSTILE_TOKEN_MAX_LENGTH } from '../domain/turnstile-verdict.value-object.js';

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

// Token de Cloudflare Turnstile tal cual llega del widget, de 1 a 2048 caracteres (RF-01 y RF-02 de la 005)
const turnstileTokenSchema = z.string().min(1).max(TURNSTILE_TOKEN_MAX_LENGTH);

export interface AuthBodySchemaOptions {
  // Modo obligatorio (TURNSTILE_ENFORCE=true): sin token → VALIDATION_ERROR (RF-17 de la 005)
  turnstileRequired: boolean;
}

// Schemas del registro y del login según el modo de Turnstile, construidos al arrancar (plan de la 005, D-11).
// Siguen siendo z.object: los campos desconocidos se ignoran, como en la 002 (clarificación de la spec 005)
export function createAuthBodySchemas({ turnstileRequired }: AuthBodySchemaOptions) {
  const turnstileToken = turnstileRequired ? turnstileTokenSchema : turnstileTokenSchema.optional();
  return {
    registerBodySchema: z.object({
      email: emailSchema,
      password: passwordSchema,
      name: nameSchema,
      turnstileToken,
    }),
    // Mismos límites que en el registro: un login fuera de ellos no llega a comprobar la contraseña (RF-02, RF-04)
    loginBodySchema: z.object({
      email: emailSchema,
      password: passwordSchema,
      turnstileToken,
    }),
  };
}

export type AuthBodySchemas = ReturnType<typeof createAuthBodySchemas>;

// PATCH /me: solo el nombre, obligatorio y que admite null; cualquier otro campo, incluido el email,
// es VALIDATION_ERROR (RF-05, RF-26)
export const updateProfileBodySchema = z.strictObject({
  name: z.string().trim().max(NAME_MAX_LENGTH).nullable().transform(emptyToNull),
});

// Contraseña actual que se confirma: solo tiene que llegar, sin recortar, con el tope de 128 para no derivar
// textos enormes (RF-28)
const currentPasswordSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);

// PATCH /me/password: la nueva cumple RF-04 y puede coincidir con la actual (RF-27, RF-28)
export const changePasswordBodySchema = z.object({
  currentPassword: currentPasswordSchema,
  newPassword: passwordSchema,
});

// DELETE /me: la contraseña de la cuenta (RF-28, RF-29)
export const deleteAccountBodySchema = z.object({
  password: currentPasswordSchema,
});
