import express, { type RequestHandler } from 'express';

import { AppError } from '../../domain/app.error.js';

const parseJson = express.json({ limit: '100kb' });

// Mensajes en español para los errores del parser (RNF-03)
const PARSER_MESSAGES: Record<string, string> = {
  'entity.parse.failed': 'El cuerpo no es un JSON válido.',
  'entity.too.large': 'El cuerpo supera el tamaño máximo de 100 kB.',
  'charset.unsupported': 'El charset del cuerpo no está soportado.',
  'encoding.unsupported': 'La codificación del cuerpo no está soportada.',
};

// Parser JSON que se encadena en cada ruta con cuerpo, después del contexto (D-8).
// Los errores del cliente al enviar el cuerpo se responden como VALIDATION_ERROR (D-20)
export const jsonBodyMiddleware: RequestHandler = (req, res, next) => {
  parseJson(req, res, (error?: unknown) => {
    if (!error) {
      next();
      return;
    }
    const parserError = error as { type?: string; status?: number };
    if (parserError.status !== undefined && parserError.status >= 400 && parserError.status < 500) {
      const message = PARSER_MESSAGES[parserError.type ?? ''] ?? 'El cuerpo de la petición no es válido.';
      next(new AppError('VALIDATION_ERROR', [{ field: 'body', message }]));
      return;
    }
    next(error);
  });
};
