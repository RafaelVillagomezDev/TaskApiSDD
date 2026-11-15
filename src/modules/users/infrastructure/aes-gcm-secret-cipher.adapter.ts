import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { SecretCipher } from '../domain/secret-cipher.port.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const FORMAT_VERSION = 'v1';

// AES-256-GCM con SESSION_ENCRYPTION_KEY (plan de la 002, D-1; plan de la 003, D-2).
// Formato: v1.<iv>.<texto cifrado>.<etiqueta>, en base64url; la etiqueta de GCM detecta cualquier alteración
export class AesGcmSecretCipher implements SecretCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== KEY_BYTES) {
      throw new Error(`La clave de cifrado de sesiones debe tener ${KEY_BYTES} bytes`);
    }
  }

  seal(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_BYTES });
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [FORMAT_VERSION, iv, data, cipher.getAuthTag()]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  open(sealed: string): string {
    const [version, iv, data, tag] = sealed.split('.');
    if (version !== FORMAT_VERSION || !iv || !data || !tag) {
      throw new Error('Texto cifrado con un formato desconocido');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64url'), {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }
}
