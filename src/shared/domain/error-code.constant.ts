// Catálogo de los códigos de error de las specs con su HTTP, mensaje en español (RNF-03 de la 001)
// y orden de precedencia (RF-34 de la 002, que sustituye a RF-46 de la 001): si una petición tiene
// varios fallos, gana el de menor orden. INTERNAL_ERROR queda fuera del orden.
export const ERROR_CODES = {
  ROUTE_NOT_FOUND: { status: 404, precedence: 1, message: 'La ruta solicitada no existe.' },
  INVALID_CSRF_TOKEN: {
    status: 403,
    precedence: 2,
    message: 'Falta la cabecera X-CSRF-Token o su token no es válido para esta petición.',
  },
  MISSING_TOKEN: { status: 401, precedence: 3, message: 'No hay sesión: inicia sesión para continuar.' },
  INVALID_TOKEN: { status: 401, precedence: 3, message: 'La sesión no es válida: inicia sesión de nuevo.' },
  TOKEN_EXPIRED: { status: 401, precedence: 3, message: 'El token de acceso ha caducado: renueva la sesión.' },
  INVALID_REFRESH_TOKEN: {
    status: 401,
    precedence: 3,
    message: 'El token de renovación no es válido: inicia sesión de nuevo.',
  },
  SESSION_EXPIRED: { status: 401, precedence: 3, message: 'La sesión ha caducado: inicia sesión de nuevo.' },
  INVALID_CLIENT_TIME: {
    status: 400,
    precedence: 4,
    message:
      'La cabecera X-Client-Time falta, no tiene el formato AAAA-MM-DDTHH:MM:SS±HH:MM o se desvía más de 5 minutos de la hora del servidor.',
  },
  INVALID_TIMEZONE: {
    status: 400,
    precedence: 5,
    message:
      'La cabecera X-Timezone falta, no es una zona horaria IANA válida o no coincide con el desfase de X-Client-Time.',
  },
  VALIDATION_ERROR: { status: 400, precedence: 6, message: 'La petición no es válida.' },
  // Dentro del orden 7, TOO_MANY_ATTEMPTS va antes que INVALID_CREDENTIALS y WRONG_PASSWORD (RF-34)
  TOO_MANY_ATTEMPTS: {
    status: 429,
    precedence: 7,
    message: 'Demasiados intentos fallidos: espera 15 minutos antes de volver a intentarlo.',
  },
  INVALID_CREDENTIALS: { status: 401, precedence: 7, message: 'El email o la contraseña no son correctos.' },
  WRONG_PASSWORD: { status: 403, precedence: 7, message: 'La contraseña actual no es correcta.' },
  EMAIL_ALREADY_REGISTERED: { status: 409, precedence: 7, message: 'Ya existe una cuenta con ese email.' },
  TASK_NOT_FOUND: { status: 404, precedence: 7, message: 'La tarea no existe o ya fue eliminada.' },
  DAY_CLOSED: { status: 409, precedence: 8, message: 'El día de la tarea ya ha terminado y no admite cambios.' },
  DAY_NOT_STARTED: {
    status: 409,
    precedence: 8,
    message: 'No se puede completar una tarea de un día que aún no ha empezado.',
  },
  INTERNAL_ERROR: { status: 500, precedence: null, message: 'Error interno del servidor.' },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
