import { registerBodySchema } from '../user.schema.js';

const LOCAL_PART = 'a'.repeat(64);
// 254 caracteres en total, con etiquetas de dominio de 63 como máximo
const EMAIL_254 = `${LOCAL_PART}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`;
const EMAIL_255 = `${LOCAL_PART}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(58)}.com`;
const valid = { email: 'ana@example.com', password: 'correct horse battery', name: 'Ana' };

describe('registerBodySchema', () => {
  it('recorta y pasa a minúsculas el email (RF-03)', () => {
    expect(registerBodySchema.parse({ ...valid, email: '  Ana@Example.COM ' }).email).toBe('ana@example.com');
  });

  it('acepta un email de 254 caracteres y rechaza uno de 255 (RF-02)', () => {
    expect(EMAIL_254).toHaveLength(254);
    expect(registerBodySchema.safeParse({ ...valid, email: EMAIL_254 }).success).toBe(true);
    expect(registerBodySchema.safeParse({ ...valid, email: EMAIL_255 }).success).toBe(false);
  });

  it.each(['no-es-un-email', 'ana@', '@example.com', '', undefined])('rechaza el email %p (RF-02)', (email) => {
    expect(registerBodySchema.safeParse({ ...valid, email }).success).toBe(false);
  });

  it('acepta contraseñas de 12 y 128 caracteres y rechaza las de 11 y 129 (RF-04)', () => {
    const withPassword = (password: string) => registerBodySchema.safeParse({ ...valid, password }).success;
    expect(withPassword('a'.repeat(12))).toBe(true);
    expect(withPassword('a'.repeat(128))).toBe(true);
    expect(withPassword('a'.repeat(11))).toBe(false);
    expect(withPassword('a'.repeat(129))).toBe(false);
  });

  it('no recorta la contraseña ni exige composición: espacios y no ASCII tal cual (RF-04)', () => {
    const password = ' contraseña con ñ 🙂 ';
    expect(registerBodySchema.parse({ ...valid, password }).password).toBe(password);
    expect(registerBodySchema.parse({ ...valid, password: 'todoenminuscula' }).password).toBe('todoenminuscula');
  });

  it('rechaza una contraseña ausente o que no es texto', () => {
    expect(registerBodySchema.safeParse({ ...valid, password: undefined }).success).toBe(false);
    expect(registerBodySchema.safeParse({ ...valid, password: 123456789012 }).success).toBe(false);
  });

  it.each([
    ['  Ana García  ', 'Ana García'],
    ['   ', null],
    [null, null],
    [undefined, null],
  ])('nombre %p → %p (RF-05)', (name, expected) => {
    expect(registerBodySchema.parse({ ...valid, name }).name).toBe(expected);
  });

  it('acepta un nombre de 100 caracteres y rechaza uno de 101 (RF-05)', () => {
    expect(registerBodySchema.safeParse({ ...valid, name: 'n'.repeat(100) }).success).toBe(true);
    expect(registerBodySchema.safeParse({ ...valid, name: 'n'.repeat(101) }).success).toBe(false);
  });
});
