import { randomBytes } from 'node:crypto';

import { AesGcmGraceCipher } from '../aes-gcm-grace-cipher.adapter.js';
import { AesGcmSecretCipher } from '../aes-gcm-secret-cipher.adapter.js';

const tokens = { accessToken: 'token-de-acceso-AAAA', refreshToken: 'token-de-refresco-BBBB' };
// `tokens` sellados por la versión de la 002, antes de extraer el cifrado común, con la clave de 32 bytes a 7
const LEGACY_SEALED =
  'v1.e-T-boH4OaS9mIot.TkQ76koe6x3u7SMur_boQTHvs2ZIzVFFOJ3JMyjF0g95xyFnqimfq9LpDw6zHXsrwsQlsBeF_S47ktqxEwltDfifSixctyLdGDMNbLSA.bqO_DVoRj8bD96CM4v7qCA';

// Los casos del cifrado (alteraciones, otra clave, formato, longitud de la clave) se prueban en AesGcmSecretCipher
describe('AesGcmGraceCipher (RNF-06, D-1)', () => {
  const secretCipher = new AesGcmSecretCipher(randomBytes(32));
  const cipher = new AesGcmGraceCipher(secretCipher);

  it('cifra y descifra los tokens de la última rotación', () => {
    expect(cipher.open(cipher.seal(tokens))).toEqual(tokens);
  });

  it('formato v1.<iv>.<cifrado>.<etiqueta> sin los tokens a la vista', () => {
    const sealed = cipher.seal(tokens);
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/);
    expect(sealed).not.toContain(tokens.accessToken);
    expect(sealed).not.toContain(tokens.refreshToken);
  });

  it('rechaza un texto cifrado con otra clave', () => {
    const other = new AesGcmGraceCipher(new AesGcmSecretCipher(randomBytes(32)));
    expect(() => other.open(cipher.seal(tokens))).toThrow();
  });

  it('rechaza un contenido descifrado que no son los dos tokens', () => {
    expect(() => cipher.open(secretCipher.seal(JSON.stringify({ accessToken: 'solo-uno' })))).toThrow();
  });

  it('abre una copia sellada antes de extraer el cifrado común (plan de la 003, R-5)', () => {
    const legacy = new AesGcmGraceCipher(new AesGcmSecretCipher(Buffer.alloc(32, 7)));
    expect(legacy.open(LEGACY_SEALED)).toEqual(tokens);
  });
});
