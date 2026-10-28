import type { RequestHandler } from 'express';

import { parseOrThrow } from '../../../shared/infrastructure/http/request-validation.helper.js';
import { sendSuccess } from '../../../shared/infrastructure/http/response-envelope.helper.js';
import { getSessionContext } from '../../../shared/infrastructure/http/session-context.helper.js';
import type { GetProfileUseCase } from '../application/get-profile.use-case.js';
import type { UpdateProfileUseCase } from '../application/update-profile.use-case.js';
import { toUserResponse } from './user.mapper.js';
import { updateProfileBodySchema } from './user.schema.js';

// Traduce HTTP ↔ casos de uso de /me; el usuario sale siempre de la sesión (RF-17, RF-21)
export class MeController {
  constructor(
    private readonly getProfile: GetProfileUseCase,
    private readonly updateProfile: UpdateProfileUseCase,
  ) {}

  show: RequestHandler = async (_req, res) => {
    const user = await this.getProfile.execute(getSessionContext(res).userId);
    sendSuccess(res, 200, 'Operación realizada con éxito', toUserResponse(user));
  };

  update: RequestHandler = async (req, res) => {
    const { name } = parseOrThrow(updateProfileBodySchema, req.body);
    const user = await this.updateProfile.execute(getSessionContext(res).userId, name);
    sendSuccess(res, 200, 'Perfil actualizado con éxito', toUserResponse(user));
  };
}
