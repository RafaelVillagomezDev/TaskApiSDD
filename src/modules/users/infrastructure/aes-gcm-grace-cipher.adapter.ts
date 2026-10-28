import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { GraceTokenCipher, GraceTokens } from '../domain/grace-token-cipher.port.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const FORMAT_VERSION = 'v1';

const isGraceTokens = (value: unknown): value is GraceTokens =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as GraceTokens).accessToken === 'string' &&
  typeof (value as GraceTokens).refreshToken === 'string';

// Copia cifrada de los tokens de la última rotación, que solo vive 30 s (RF-13; plan de la 002, D-1).
// Formato: v1.<iv>.<texto cifrado>.<etiqueta>, en base64url; la etiqueta de GCM detecta cualquier alteración
export class AesGcmGraceCipher implements GraceTokenCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== KEY_BYTES) {
      throw new Error(`La clave de cifrado de sesiones debe tener ${KEY_BYTES} bytes`);
    }
  }

  seal(tokens: GraceTokens): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_BYTES });
    const data = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
    return [FORMAT_VERSION, iv, data, cipher.getAuthTag()]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  open(sealed: string): GraceTokens {
    const [version, iv, data, tag] = sealed.split('.');
    if (version !== FORMAT_VERSION || !iv || !data || !tag) {
      throw new Error('Copia cifrada de tokens con un formato desconocido');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64url'), {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    const tokens: unknown = JSON.parse(plain);
    if (!isGraceTokens(tokens)) {
      throw new Error('Copia cifrada de tokens con un contenido inesperado');
    }
    return tokens;
  }
}
