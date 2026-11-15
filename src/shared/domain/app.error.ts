import { ERROR_CODES, type ErrorCode } from './error-code.constant.js';

// Campo erróneo de un VALIDATION_ERROR (spec, Sobre de respuesta)
export interface ValidationDetail {
  field: string;
  message: string;
}

// Error base de la aplicación: el middleware de errores lo convierte en el sobre de error
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    readonly details?: ValidationDetail[],
    message?: string,
  ) {
    super(message ?? ERROR_CODES[code].message);
    this.name = 'AppError';
    this.status = ERROR_CODES[code].status;
  }
}
