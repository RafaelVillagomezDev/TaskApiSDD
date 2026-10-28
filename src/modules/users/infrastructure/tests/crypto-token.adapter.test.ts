import { CryptoTokenService } from '../crypto-token.adapter.js';

describe('CryptoTokenService (RNF-06, D-1)', () => {
  const tokens = new CryptoTokenService();

  it('genera tokens aleatorios de 32 bytes en base64url (43 caracteres), distintos cada vez', () => {
    const generated = new Set(Array.from({ length: 50 }, () => tokens.randomToken()));
    expect(generated.size).toBe(50);
    for (const token of generated) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('la huella es el SHA-256 en hexadecimal: 64 caracteres, siempre la misma para el mismo token', () => {
    expect(tokens.fingerprint('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const token = tokens.randomToken();
    expect(tokens.fingerprint(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens.fingerprint(token)).not.toContain(token);
  });

  it('equals compara huellas: iguales, distintas y de distinta longitud', () => {
    const a = tokens.fingerprint('uno');
    expect(tokens.equals(a, tokens.fingerprint('uno'))).toBe(true);
    expect(tokens.equals(a, tokens.fingerprint('dos'))).toBe(false);
    expect(tokens.equals(a, 'corta')).toBe(false);
  });
});
