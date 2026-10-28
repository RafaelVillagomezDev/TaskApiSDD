import type { RequestHandler } from 'express';

import { AppError } from '../../../shared/domain/app.error.js';
import type { ErrorCode } from '../../../shared/domain/error-code.constant.js';
import {
  ACCESS_TOKEN_COOKIE,
  clearSessionCookies,
  readCookie,
  REFRESH_TOKEN_COOKIE,
  setSessionCookies,
} from '../../../shared/infrastructure/http/cookie.helper.js';
import { parseOrThrow } from '../../../shared/infrastructure/http/request-validation.helper.js';
import { sendSuccess } from '../../../shared/infrastructure/http/response-envelope.helper.js';
import type { IssueCsrfTokenUseCase } from '../application/issue-csrf-token.use-case.js';
import type { LoginUseCase } from '../application/login.use-case.js';
import type { LogoutUseCase } from '../application/logout.use-case.js';
import type { RefreshSessionUseCase } from '../application/refresh-session.use-case.js';
import type { RegisterUserUseCase } from '../application/register-user.use-case.js';
import { requireCsrfHeader } from './session.middleware.js';
import { toUserResponse } from './user.mapper.js';
import { loginBodySchema, registerBodySchema } from './user.schema.js';

// Errores de la renovación con los que la sesión ya no existe: se borran sus cookies (contrato, POST /auth/refresh)
const CLOSED_SESSION_ERRORS: ReadonlySet<ErrorCode> = new Set(['INVALID_REFRESH_TOKEN', 'SESSION_EXPIRED']);

// Traduce HTTP ↔ casos de uso de /auth
export class AuthController {
  constructor(
    private readonly issueCsrfToken: IssueCsrfTokenUseCase,
    private readonly registerUser: RegisterUserUseCase,
    private readonly loginUser: LoginUseCase,
    private readonly logoutUser: LogoutUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
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

  // Los tokens de sesión van solo en cookies; en el cuerpo, la cuenta y el token CSRF (RF-07, RF-24, RNF-05)
  login: RequestHandler = async (req, res) => {
    const input = parseOrThrow(loginBodySchema, req.body);
    const result = await this.loginUser.execute(input);
    setSessionCookies(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessExpiresAt: result.session.accessExpiresAt,
      refreshExpiresAt: result.session.refreshExpiresAt,
      // Instante del login: con él las cookies duran exactamente 15 minutos y 7 días
      now: result.session.createdAt,
    });
    sendSuccess(res, 200, 'Sesión iniciada con éxito', {
      user: toUserResponse(result.user),
      csrfToken: result.csrfToken,
    });
  };

  // Se identifica con el token de acceso o, si caducó, con el refresh token, que solo viaja a /auth (RF-15)
  logout: RequestHandler = async (req, res) => {
    const csrfToken = requireCsrfHeader(req);
    await this.logoutUser.execute({
      accessToken: readCookie(req, ACCESS_TOKEN_COOKIE),
      refreshToken: readCookie(req, REFRESH_TOKEN_COOKIE),
      csrfToken,
    });
    clearSessionCookies(res);
    sendSuccess(res, 200, 'Sesión cerrada con éxito', null);
  };

  // Cookies nuevas y data null; el token CSRF de la sesión no cambia (RF-11, RF-24). Si la sesión ya no
  // existe, se borran las cookies antes de responder el error (RF-12 a RF-14)
  refresh: RequestHandler = async (req, res) => {
    const csrfToken = requireCsrfHeader(req);
    try {
      const result = await this.refreshSession.execute({ refreshToken: readCookie(req, REFRESH_TOKEN_COOKIE), csrfToken });
      setSessionCookies(res, result);
    } catch (error) {
      if (error instanceof AppError && CLOSED_SESSION_ERRORS.has(error.code)) {
        clearSessionCookies(res);
      }
      throw error;
    }
    sendSuccess(res, 200, 'Sesión renovada con éxito', null);
  };
}
