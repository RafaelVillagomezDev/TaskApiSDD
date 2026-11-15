import type { GraceTokenCipher, GraceTokens } from '../domain/grace-token-cipher.port.js';
import type { SecretCipher } from '../domain/secret-cipher.port.js';

const isGraceTokens = (value: unknown): value is GraceTokens =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as GraceTokens).accessToken === 'string' &&
  typeof (value as GraceTokens).refreshToken === 'string';

// Copia cifrada de los tokens de la última rotación, que solo vive 30 s (RF-13; plan de la 002, D-1).
// El cifrado lo hace AesGcmSecretCipher (plan de la 003, D-2); aquí solo se serializa y se valida el JSON
export class AesGcmGraceCipher implements GraceTokenCipher {
  constructor(private readonly cipher: SecretCipher) {}

  seal(tokens: GraceTokens): string {
    return this.cipher.seal(JSON.stringify(tokens));
  }

  open(sealed: string): GraceTokens {
    const tokens: unknown = JSON.parse(this.cipher.open(sealed));
    if (!isGraceTokens(tokens)) {
      throw new Error('Copia cifrada de tokens con un contenido inesperado');
    }
    return tokens;
  }
}
