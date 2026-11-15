// Puerto de salida de los tokens CSRF previos a la sesión; solo se guarda su huella (RF-22, RNF-06)
export interface CsrfTokenRepository {
  save(tokenHash: string, expiresAt: Date): Promise<void>;
  // Existe y no ha caducado; reutilizable hasta entonces
  isValid(tokenHash: string, now: Date): Promise<boolean>;
  deleteExpired(now: Date): Promise<void>;
}
