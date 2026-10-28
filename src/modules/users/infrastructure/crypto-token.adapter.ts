import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { TokenService } from '../domain/token.port.js';

// 32 bytes aleatorios: 43 caracteres en base64url (plan de la 002, D-1)
const TOKEN_BYTES = 32;

export class CryptoTokenService implements TokenService {
  randomToken(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }

  // En la base de datos solo se guarda esta huella (RNF-06)
  fingerprint(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  // Tiempo constante para no revelar por el tiempo cuántos caracteres coinciden
  equals(fingerprintA: string, fingerprintB: string): boolean {
    const a = Buffer.from(fingerprintA, 'utf8');
    const b = Buffer.from(fingerprintB, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
