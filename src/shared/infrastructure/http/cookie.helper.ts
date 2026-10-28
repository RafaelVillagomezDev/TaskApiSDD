import type { CookieOptions, Request, Response } from 'express';

// Cookies de sesión de la spec 002 (Convenciones; plan de la 002, D-5)
export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
// El refresh token solo viaja a las rutas de sesión
const REFRESH_TOKEN_PATH = '/auth';

// Ningún script del navegador puede leerlas, solo viajan por HTTPS (localhost cuenta como seguro) y
// no se envían en peticiones que vienen de otros sitios (RNF-05)
const BASE_OPTIONS: CookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' };

export interface SessionCookieTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  now: Date;
}

// Lee una cookie de la cabecera Cookie sin dependencias (D-5); undefined si falta o está vacía
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const fragment of header.split(';')) {
    const separator = fragment.indexOf('=');
    if (separator > 0 && fragment.slice(0, separator).trim() === name) {
      const value = fragment.slice(separator + 1).trim();
      return value === '' ? undefined : value;
    }
  }
  return undefined;
}

// Escribe las dos cookies de sesión con su caducidad (RF-07, RF-11)
export function setSessionCookies(res: Response, tokens: SessionCookieTokens): void {
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...BASE_OPTIONS,
    path: '/',
    maxAge: tokens.accessExpiresAt.getTime() - tokens.now.getTime(),
  });
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...BASE_OPTIONS,
    path: REFRESH_TOKEN_PATH,
    maxAge: tokens.refreshExpiresAt.getTime() - tokens.now.getTime(),
  });
}

// Borra las dos cookies; el navegador solo las borra si coinciden ruta y atributos (RF-15, RF-29)
export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...BASE_OPTIONS, path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...BASE_OPTIONS, path: REFRESH_TOKEN_PATH });
}
