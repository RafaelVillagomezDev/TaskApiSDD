import type { RequestHandler } from 'express';

import type { Clock } from '../../../shared/domain/clock.port.js';
import { AppError } from '../../../shared/domain/app.error.js';
import type { CsrfTokenRepository } from '../domain/csrf-token.repository.js';
import type { TokenService } from '../domain/token.port.js';

export interface PresessionCsrfDependencies {
  tokens: TokenService;
  csrfTokens: CsrfTokenRepository;
  clock: Clock;
}

// Registro y login exigen el token de GET /auth/csrf en X-CSRF-Token, vigente (RF-22, RF-23). Se encadena
// antes del parser JSON: el CSRF va antes que la validación en la precedencia (RF-34)
export function createPresessionCsrfMiddleware(deps: PresessionCsrfDependencies): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = req.header('x-csrf-token');
      if (!token || !(await deps.csrfTokens.isValid(deps.tokens.fingerprint(token), deps.clock.now()))) {
        next(new AppError('INVALID_CSRF_TOKEN'));
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
