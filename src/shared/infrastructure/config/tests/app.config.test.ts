import { loadAppConfig } from '../app.config.js';

const KEY = 'a'.repeat(64);
// Claves secretas de prueba que publica Cloudflare (S-02 de la 005); ninguna es una clave real
const TEST_SECRETS = [
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
];
// Texto inventado con forma de clave real, para los casos que no deben tratarse como clave de prueba
const REAL_LIKE_SECRET = '0x4AAAAAAAinventadaParaLosTests';

const valid = {
  SESSION_ENCRYPTION_KEY: KEY,
  CORS_ORIGIN: 'http://localhost:5173',
  TURNSTILE_SECRET: TEST_SECRETS[0],
  TURNSTILE_ALLOWED_HOSTNAMES: 'example.com,localhost',
  TURNSTILE_ENFORCE: 'true',
};
const production = {
  ...valid,
  NODE_ENV: 'production',
  TURNSTILE_SECRET: REAL_LIKE_SECRET,
  TURNSTILE_ALLOWED_HOSTNAMES: 'kompitu.yandrydev.cloud',
};

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
  describe('Turnstile (RF-18, RF-19 y RNF-05 de la 005)', () => {
    it('lee la clave, la lista de hosts normalizada y el modo', () => {
      const config = loadAppConfig({
        ...valid,
        TURNSTILE_SECRET: REAL_LIKE_SECRET,
        TURNSTILE_ALLOWED_HOSTNAMES: ' Example.com , ,LOCALHOST,',
        TURNSTILE_ENFORCE: 'false',
      });
      expect(config.turnstile).toEqual({
        secret: REAL_LIKE_SECRET,
        allowedHostnames: ['example.com', 'localhost'],
        enforce: false,
        usesTestSecret: false,
      });
    });

    it('el modo obligatorio es TURNSTILE_ENFORCE=true', () => {
      expect(loadAppConfig(valid).turnstile.enforce).toBe(true);
    });

    it.each(TEST_SECRETS)('reconoce la clave de prueba %s', (secret) => {
      expect(loadAppConfig({ ...valid, TURNSTILE_SECRET: secret }).turnstile.usesTestSecret).toBe(true);
    });

    it.each([
      ['TURNSTILE_SECRET', 'falta', undefined],
      ['TURNSTILE_SECRET', 'está vacía', ''],
      ['TURNSTILE_ALLOWED_HOSTNAMES', 'falta', undefined],
      ['TURNSTILE_ALLOWED_HOSTNAMES', 'está vacía', ''],
      ['TURNSTILE_ALLOWED_HOSTNAMES', 'solo tiene comas y espacios', ' , ,'],
      ['TURNSTILE_ENFORCE', 'falta', undefined],
      ['TURNSTILE_ENFORCE', 'no es true ni false', 'yes'],
      ['TURNSTILE_ENFORCE', 'está en mayúsculas', 'TRUE'],
    ])('no arranca si %s %s, nombrando la variable', (variable, _case, value) => {
      expect(() => loadAppConfig({ ...valid, [variable]: value })).toThrow(new RegExp(variable));
    });

    it('acepta la configuración de producción con una clave real y el host del frontend', () => {
      expect(loadAppConfig(production).turnstile).toEqual({
        secret: REAL_LIKE_SECRET,
        allowedHostnames: ['kompitu.yandrydev.cloud'],
        enforce: true,
        usesTestSecret: false,
      });
    });

    it.each(['localhost', '127.0.0.1', '::1', '[::1]', 'LocalHost'])(
      'en producción no arranca con el host local %s en la lista',
      (host) => {
        expect(() =>
          loadAppConfig({ ...production, TURNSTILE_ALLOWED_HOSTNAMES: `kompitu.yandrydev.cloud,${host}` }),
        ).toThrow(/TURNSTILE_ALLOWED_HOSTNAMES/);
      },
    );

    it.each(TEST_SECRETS)('en producción no arranca con la clave de prueba %s', (secret) => {
      expect(() => loadAppConfig({ ...production, TURNSTILE_SECRET: secret })).toThrow(/TURNSTILE_SECRET/);
    });

    it('fuera de producción acepta hosts locales y claves de prueba', () => {
      const config = loadAppConfig({ ...valid, NODE_ENV: 'development' }).turnstile;
      expect(config.usesTestSecret).toBe(true);
      expect(config.allowedHostnames).toContain('localhost');
    });

    it('los errores no incluyen el valor de la clave secreta (RNF-02)', () => {
      expect(() => loadAppConfig({ ...production, TURNSTILE_SECRET: TEST_SECRETS[1] })).toThrow(
        expect.not.objectContaining({ message: expect.stringContaining(TEST_SECRETS[1]) }),
      );
    });
  });
});
