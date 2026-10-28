import type { RequestHandler } from 'express';

import { sendSuccess } from '../../../shared/infrastructure/http/response-envelope.helper.js';
import { getSessionContext } from '../../../shared/infrastructure/http/session-context.helper.js';
import type { GetProfileUseCase } from '../application/get-profile.use-case.js';
import { toUserResponse } from './user.mapper.js';

// Traduce HTTP ↔ casos de uso de /me; el usuario sale siempre de la sesión (RF-17, RF-21)
export class MeController {
  constructor(private readonly getProfile: GetProfileUseCase) {}

  show: RequestHandler = async (_req, res) => {
    const user = await this.getProfile.execute(getSessionContext(res).userId);
    sendSuccess(res, 200, 'Operación realizada con éxito', toUserResponse(user));
  };
}
