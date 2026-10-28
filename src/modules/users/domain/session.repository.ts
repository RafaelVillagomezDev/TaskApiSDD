import type { Session, SessionSchedule } from './session.entity.js';

// Huellas SHA-256 de los tokens de una generación (RNF-06)
export interface SessionTokenHashes {
  accessTokenHash: string;
  refreshTokenHash: string;
}

export interface NewSession extends SessionTokenHashes {
  userId: string;
  csrfTokenHash: string;
  schedule: SessionSchedule;
  now: Date;
}

// Sesión con lo que se guarda de ella además de sus caducidades
export interface SessionRecord {
  session: Session;
  csrfTokenHash: string;
  // Copia cifrada de los tokens de la última rotación (margen de gracia, D-1)
  graceTokens: string | null;
}

// Sesión encontrada a través de uno de sus refresh tokens, vigente o ya rotado (RF-13)
export interface RefreshTokenRecord extends SessionRecord {
  tokenHash: string;
  tokenGeneration: number;
  // null: es el refresh token vigente
  tokenRotatedAt: Date | null;
}

// Escrituras de una renovación, dentro de la misma transacción que la lectura (D-4)
export interface RefreshUnitOfWork {
  // Guarda la sesión ya rotada, marca como rotado el token usado e inserta el nuevo
  rotate(record: RefreshTokenRecord, next: SessionTokenHashes & { graceTokens: string }, now: Date): Promise<void>;
  // Cierra la sesión con todos sus refresh tokens
  close(sessionId: string): Promise<void>;
}

// Puerto de salida de sesiones
export interface SessionRepository {
  create(input: NewSession): Promise<Session>;
  findByAccessTokenHash(accessTokenHash: string): Promise<SessionRecord | null>;
  findByRefreshTokenHash(refreshTokenHash: string): Promise<RefreshTokenRecord | null>;
  // Ejecuta `work` con la sesión del refresh token bloqueada hasta que termina (RF-11 a RF-14, D-4)
  withRefreshTokenLocked<T>(
    refreshTokenHash: string,
    work: (record: RefreshTokenRecord | null, unit: RefreshUnitOfWork) => Promise<T>,
  ): Promise<T>;
  delete(sessionId: string): Promise<void>;
  // Cierra todas las sesiones de la cuenta salvo una (RF-27)
  deleteAllExcept(userId: string, keepSessionId: string): Promise<void>;
  // Limpieza (D-12): sesiones caducadas y copias cifradas rotadas antes de `graceCutoff`
  deleteExpired(now: Date): Promise<void>;
  clearGraceTokens(graceCutoff: Date): Promise<void>;
}
