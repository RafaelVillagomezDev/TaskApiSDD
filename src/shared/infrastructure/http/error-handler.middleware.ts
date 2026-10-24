import type { ErrorRequestHandler } from 'express';

import { AppError } from '../../domain/app.error.js';

// Único constructor del sobre de error (principio VII). Cualquier error que no sea AppError
// se responde como INTERNAL_ERROR sin exponer detalles internos.
// Las respuestas a HEAD salen sin cuerpo: Express lo omite (excepción del principio VII).
export const errorHandlerMiddleware: ErrorRequestHandler = (error, _req, res, _next) => {
  if (!(error instanceof AppError)) {
    console.error(error);
  }
  const appError = error instanceof AppError ? error : new AppError('INTERNAL_ERROR');

  res.status(appError.status).json({
    success: false,
    status: appError.status,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
    },
  });
};
