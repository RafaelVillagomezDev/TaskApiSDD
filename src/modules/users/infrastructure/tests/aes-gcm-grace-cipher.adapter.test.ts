import { randomBytes } from 'node:crypto';

import { AesGcmGraceCipher } from '../aes-gcm-grace-cipher.adapter.js';

const tokens = { accessToken: 'token-de-acceso-AAAA', refreshToken: 'token-de-refresco-BBBB' };

describe('AesGcmGraceCipher (RNF-06, D-1)', () => {
  const key = randomBytes(32);
  const cipher = new AesGcmGraceCipher(key);

  it('cifra y descifra los tokens de la última rotación', () => {
    expect(cipher.open(cipher.seal(tokens))).toEqual(tokens);
  });

  it('formato v1.<iv>.<cifrado>.<etiqueta> sin los tokens a la vista', () => {
    const sealed = cipher.seal(tokens);
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/);
    expect(sealed).not.toContain(tokens.accessToken);
    expect(sealed).not.toContain(tokens.refreshToken);
  });

  it('usa un IV aleatorio: cifrar dos veces lo mismo da textos distintos', () => {
    expect(cipher.seal(tokens)).not.toBe(cipher.seal(tokens));
  });

  it('rechaza un texto con el cifrado o la etiqueta alterados', () => {
    const [version, iv, data, tag] = cipher.seal(tokens).split('.');
    // Invierte un bit del primer byte: cambiar el último carácter base64url puede tocar solo bits de relleno
    const flip = (value: string) => {
      const bytes = Buffer.from(value, 'base64url');
      bytes[0] = (bytes[0] ?? 0) ^ 1;
      return bytes.toString('base64url');
    };
    expect(() => cipher.open([version, iv, flip(data), tag].join('.'))).toThrow();
    expect(() => cipher.open([version, iv, data, flip(tag)].join('.'))).toThrow();
  });

  it('rechaza un texto cifrado con otra clave', () => {
    const other = new AesGcmGraceCipher(randomBytes(32));
    expect(() => other.open(cipher.seal(tokens))).toThrow();
  });

  it('rechaza formatos desconocidos', () => {
    expect(() => cipher.open('v2.a.b.c')).toThrow();
    expect(() => cipher.open('no-es-un-token')).toThrow();
  });

  it('exige una clave AES-256 de 32 bytes', () => {
    expect(() => new AesGcmGraceCipher(randomBytes(16))).toThrow();
  });
});
