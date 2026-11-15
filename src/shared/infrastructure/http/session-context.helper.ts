import type { Response } from 'express';

import type { SessionContext } from '../../application/request-context.type.js';

const SESSION_CONTEXT_KEY = 'sessionContext';

// Lo deja el middleware de sesión del módulo users y lo leen el contexto de petición y los controladores,
// sin que ningún módulo importe a otro (plan de la 002, sección 3; principio V)
export function setSessionContext(res: Response, context: SessionContext): void {
  res.locals[SESSION_CONTEXT_KEY] = context;
}

export function getSessionContext(res: Response): SessionContext {
  const context = res.locals[SESSION_CONTEXT_KEY] as SessionContext | undefined;
  if (!context) {
    throw new Error('SessionContext no disponible: falta el middleware de sesión en la ruta');
  }
  return context;
}

