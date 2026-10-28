import { loadAppConfig } from '../app.config.js';

const KEY = 'a'.repeat(64);
const valid = { SESSION_ENCRYPTION_KEY: KEY, CORS_ORIGIN: 'http://localhost:5173' };

describe('loadAppConfig', () => {
  it('convierte la clave hexadecimal en 32 bytes y conserva el origen (D-11, RF-35)', () => {
    const config = loadAppConfig(valid);
    expect(config.sessionEncryptionKey).toHaveLength(32);
    expect(config.sessionEncryptionKey.toString('hex')).toBe(KEY);
    expect(config.corsOrigin).toBe('http://localhost:5173');
  });

  it('acepta el origen de producción', () => {
    expect(loadAppConfig({ ...valid, CORS_ORIGIN: 'https://kompitu.yandrydev.cloud' }).corsOrigin).toBe(
      'https://kompitu.yandrydev.cloud',
    );
  });

  it.each([
    ['falta', undefined],
    ['es corta', 'a'.repeat(63)],
    ['es larga', 'a'.repeat(65)],
    ['no es hexadecimal', 'z'.repeat(64)],
  ])('rechaza la clave si %s, nombrando la variable', (_case, key) => {
    expect(() => loadAppConfig({ ...valid, SESSION_ENCRYPTION_KEY: key })).toThrow(/SESSION_ENCRYPTION_KEY/);
  });

  it.each([
    ['falta', undefined],
    ['no es una URL', 'localhost:5173'],
    ['tiene ruta', 'http://localhost:5173/app'],
    ['acaba en barra', 'http://localhost:5173/'],
    ['es un comodín', '*'],
  ])('rechaza CORS_ORIGIN si %s (RF-35)', (_case, origin) => {
    expect(() => loadAppConfig({ ...valid, CORS_ORIGIN: origin })).toThrow(/CORS_ORIGIN/);
  });

  it('el mensaje de error no incluye el valor de la clave (principio IV)', () => {
    const secret = 'b'.repeat(63);
    expect(() => loadAppConfig({ ...valid, SESSION_ENCRYPTION_KEY: secret })).toThrow(
      expect.not.objectContaining({ message: expect.stringContaining(secret) }),
    );
  });
});
