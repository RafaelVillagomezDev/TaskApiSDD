// Catálogo de los códigos de error de la spec con su HTTP, mensaje en español (RNF-03)
// y orden de precedencia (RF-46): si una petición tiene varios fallos, gana el de menor orden.
// INTERNAL_ERROR queda fuera del orden.
export const ERROR_CODES = {
  ROUTE_NOT_FOUND: { status: 404, precedence: 1, message: 'La ruta solicitada no existe.' },
  MISSING_USER: { status: 401, precedence: 2, message: 'Falta la cabecera X-User-Id o está vacía.' },
  INVALID_CLIENT_TIME: {
    status: 400,
    precedence: 3,
    message:
      'La cabecera X-Client-Time falta, no tiene el formato AAAA-MM-DDTHH:MM:SS±HH:MM o se desvía más de 5 minutos de la hora del servidor.',
  },
  INVALID_TIMEZONE: {
    status: 400,
    precedence: 4,
    message:
      'La cabecera X-Timezone falta, no es una zona horaria IANA válida o no coincide con el desfase de X-Client-Time.',
  },
  VALIDATION_ERROR: { status: 400, precedence: 5, message: 'La petición no es válida.' },
  TASK_NOT_FOUND: { status: 404, precedence: 6, message: 'La tarea no existe o ya fue eliminada.' },
  DAY_CLOSED: { status: 409, precedence: 7, message: 'El día de la tarea ya ha terminado y no admite cambios.' },
  DAY_NOT_STARTED: {
    status: 409,
    precedence: 7,
    message: 'No se puede completar una tarea de un día que aún no ha empezado.',
  },
  INTERNAL_ERROR: { status: 500, precedence: null, message: 'Error interno del servidor.' },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
