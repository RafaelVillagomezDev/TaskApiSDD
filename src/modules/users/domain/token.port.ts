// Puerto de tokens de sesión y CSRF: aleatorios y guardados solo por su huella (RNF-06, plan de la 002 D-1)
export interface TokenService {
  randomToken(): string;
  // SHA-256 en hexadecimal (64 caracteres)
  fingerprint(token: string): string;
  // Compara dos huellas en tiempo constante
  equals(fingerprintA: string, fingerprintB: string): boolean;
}
