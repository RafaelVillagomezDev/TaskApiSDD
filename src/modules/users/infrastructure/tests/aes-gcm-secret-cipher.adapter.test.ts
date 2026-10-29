import { randomBytes } from 'node:crypto';

import { AesGcmSecretCipher } from '../aes-gcm-secret-cipher.adapter.js';

const secret = 'token-csrf-de-la-sesion-CCCC';

// Invierte un bit del primer byte: cambiar el último carácter base64url puede tocar solo bits de relleno
const flip = (value: string) => {
  const bytes = Buffer.from(value, 'base64url');
  bytes[0] = (bytes[0] ?? 0) ^ 1;
  return bytes.toString('base64url');
};

describe('AesGcmSecretCipher (RNF-04; plan de la 003, D-2)', () => {
  const cipher = new AesGcmSecretCipher(randomBytes(32));

  it('cifra y descifra el texto', () => {
    expect(cipher.open(cipher.seal(secret))).toBe(secret);
  });

  it('formato v1.<iv>.<cifrado>.<etiqueta> sin el texto a la vista', () => {
    const sealed = cipher.seal(secret);
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/);
    expect(sealed).not.toContain(secret);
  });

  it('usa un IV aleatorio: cifrar dos veces lo mismo da textos distintos', () => {
    expect(cipher.seal(secret)).not.toBe(cipher.seal(secret));
  });

  it('rechaza un texto con el cifrado o la etiqueta alterados', () => {
    const [version, iv, data, tag] = cipher.seal(secret).split('.');
    expect(() => cipher.open([version, iv, flip(data ?? ''), tag].join('.'))).toThrow();
    expect(() => cipher.open([version, iv, data, flip(tag ?? '')].join('.'))).toThrow();
  });

  it('rechaza un texto cifrado con otra clave', () => {
    const other = new AesGcmSecretCipher(randomBytes(32));
    expect(() => other.open(cipher.seal(secret))).toThrow();
  });

  it('rechaza formatos desconocidos', () => {
    expect(() => cipher.open('v2.a.b.c')).toThrow();
    expect(() => cipher.open('no-es-un-texto-cifrado')).toThrow();
  });

  it('exige una clave AES-256 de 32 bytes', () => {
    expect(() => new AesGcmSecretCipher(randomBytes(16))).toThrow();
  });
});
