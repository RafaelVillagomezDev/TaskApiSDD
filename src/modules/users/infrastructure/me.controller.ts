import type { RequestHandler } from 'express';

import { clearSessionCookies } from '../../../shared/infrastructure/http/cookie.helper.js';
import { parseOrThrow } from '../../../shared/infrastructure/http/request-validation.helper.js';
import { sendSuccess } from '../../../shared/infrastructure/http/response-envelope.helper.js';
import { getSessionContext } from '../../../shared/infrastructure/http/session-context.helper.js';
import type { ChangePasswordUseCase } from '../application/change-password.use-case.js';
import type { DeleteAccountUseCase } from '../application/delete-account.use-case.js';
import type { GetProfileUseCase } from '../application/get-profile.use-case.js';
import type { UpdateProfileUseCase } from '../application/update-profile.use-case.js';
import { toUserResponse } from './user.mapper.js';
import { changePasswordBodySchema, deleteAccountBodySchema, updateProfileBodySchema } from './user.schema.js';

// Traduce HTTP ↔ casos de uso de /me; el usuario sale siempre de la sesión (RF-17, RF-21)
export class MeController {
  constructor(
    private readonly getProfile: GetProfileUseCase,
    private readonly updateProfile: UpdateProfileUseCase,
    private readonly changeUserPassword: ChangePasswordUseCase,
    private readonly deleteAccount: DeleteAccountUseCase,
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

  // La sesión desde la que se cambia sigue abierta; las demás se cierran (RF-27)
  changePassword: RequestHandler = async (req, res) => {
    const input = parseOrThrow(changePasswordBodySchema, req.body);
    await this.changeUserPassword.execute({ ...getSessionContext(res), ...input });
    sendSuccess(res, 200, 'Contraseña cambiada con éxito', null);
  };

  // Las sesiones caen con la cuenta; se borran también las cookies del navegador (RF-29)
  remove: RequestHandler = async (req, res) => {
    const { password } = parseOrThrow(deleteAccountBodySchema, req.body);
    await this.deleteAccount.execute(getSessionContext(res).userId, password);
    clearSessionCookies(res);
    sendSuccess(res, 200, 'Cuenta eliminada con éxito', null);
  };
}
