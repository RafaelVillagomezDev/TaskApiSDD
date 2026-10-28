import type { RequestHandler } from 'express';

import { parseOrThrow } from '../../../shared/infrastructure/http/request-validation.helper.js';
import { sendSuccess } from '../../../shared/infrastructure/http/response-envelope.helper.js';
import type { IssueCsrfTokenUseCase } from '../application/issue-csrf-token.use-case.js';
import type { RegisterUserUseCase } from '../application/register-user.use-case.js';
import { toUserResponse } from './user.mapper.js';
import { registerBodySchema } from './user.schema.js';

// Traduce HTTP ↔ casos de uso de /auth
export class AuthController {
  constructor(
    private readonly issueCsrfToken: IssueCsrfTokenUseCase,
    private readonly registerUser: RegisterUserUseCase,
  ) {}

  csrf: RequestHandler = async (_req, res) => {
    const csrfToken = await this.issueCsrfToken.execute();
    sendSuccess(res, 200, 'Operación realizada con éxito', { csrfToken });
  };

  // Responde solo con la cuenta: no abre sesión (RF-06)
  register: RequestHandler = async (req, res) => {
    const input = parseOrThrow(registerBodySchema, req.body);
    const user = await this.registerUser.execute(input);
    sendSuccess(res, 201, 'Cuenta creada con éxito', toUserResponse(user));
  };
}
