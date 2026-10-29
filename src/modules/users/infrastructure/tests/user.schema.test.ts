import {
  changePasswordBodySchema,
  deleteAccountBodySchema,
  loginBodySchema,
  registerBodySchema,
  updateProfileBodySchema,
} from '../user.schema.js';

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

describe('loginBodySchema', () => {
  const credentials = { email: 'ana@example.com', password: 'correct horse battery' };

  it('recorta y pasa a minúsculas el email, como en el registro (RF-02, RF-03)', () => {
    expect(loginBodySchema.parse({ ...credentials, email: '  Ana@Example.COM ' })).toEqual(credentials);
  });

  it.each(['no-es-un-email', EMAIL_255, undefined])('rechaza el email %p (RF-02)', (email) => {
    expect(loginBodySchema.safeParse({ ...credentials, email }).success).toBe(false);
  });

  it('aplica los límites de la contraseña sin recortarla (RF-04)', () => {
    const withPassword = (password: unknown) => loginBodySchema.safeParse({ ...credentials, password });
    expect(withPassword(' contraseña con ñ 🙂 ').data?.password).toBe(' contraseña con ñ 🙂 ');
    expect(withPassword('a'.repeat(11)).success).toBe(false);
    expect(withPassword('a'.repeat(129)).success).toBe(false);
    expect(withPassword(undefined).success).toBe(false);
  });

  it('ignora el nombre y cualquier otro campo desconocido', () => {
    expect(loginBodySchema.parse({ ...credentials, name: 'Ana' })).toEqual(credentials);
  });
});

describe('updateProfileBodySchema', () => {
  it.each([
    ['  Ana  ', 'Ana'],
    ['   ', null],
    ['', null],
    [null, null],
  ])('nombre %p → %p (RF-05)', (name, expected) => {
    expect(updateProfileBodySchema.parse({ name })).toEqual({ name: expected });
  });

  it('acepta un nombre de 100 caracteres y rechaza uno de 101 (RF-05)', () => {
    expect(updateProfileBodySchema.safeParse({ name: 'n'.repeat(100) }).success).toBe(true);
    expect(updateProfileBodySchema.safeParse({ name: 'n'.repeat(101) }).success).toBe(false);
  });

  it('name es obligatorio: un cuerpo vacío o sin él se rechaza', () => {
    expect(updateProfileBodySchema.safeParse({}).success).toBe(false);
    expect(updateProfileBodySchema.safeParse({ name: 42 }).success).toBe(false);
  });

  it.each([
    ['el email', { name: 'Ana', email: 'otro@example.com' }],
    ['solo el email', { email: 'otro@example.com' }],
    ['la contraseña', { name: 'Ana', password: 'correct horse battery' }],
    ['un campo desconocido', { name: 'Ana', role: 'admin' }],
  ])('con %s se rechaza: solo se puede cambiar el nombre (RF-26)', (_case, body) => {
    expect(updateProfileBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('changePasswordBodySchema', () => {
  const body = { currentPassword: 'correct horse battery', newPassword: 'otra frase bastante larga' };

  it('acepta la contraseña actual y una nueva válida, sin recortarlas (RF-04)', () => {
    const spaced = { currentPassword: ' actual con espacios ', newPassword: ' nueva con ñ y 🙂 ' };
    expect(changePasswordBodySchema.parse(spaced)).toEqual(spaced);
  });

  it('la nueva tiene de 12 a 128 caracteres (RF-04)', () => {
    const withNew = (newPassword: string) => changePasswordBodySchema.safeParse({ ...body, newPassword }).success;
    expect(withNew('a'.repeat(12))).toBe(true);
    expect(withNew('a'.repeat(128))).toBe(true);
    expect(withNew('a'.repeat(11))).toBe(false);
    expect(withNew('a'.repeat(129))).toBe(false);
  });

  it('la nueva puede coincidir con la actual (RF-27)', () => {
    expect(changePasswordBodySchema.safeParse({ ...body, newPassword: body.currentPassword }).success).toBe(true);
  });

  it.each([
    ['sin currentPassword', { newPassword: body.newPassword }],
    ['sin newPassword', { currentPassword: body.currentPassword }],
    ['con currentPassword vacía', { ...body, currentPassword: '' }],
    ['con currentPassword de más de 128 caracteres', { ...body, currentPassword: 'a'.repeat(129) }],
    ['con un número', { ...body, currentPassword: 123456789012 }],
  ])('%s → se rechaza', (_case, input) => {
    expect(changePasswordBodySchema.safeParse(input).success).toBe(false);
  });
});

describe('deleteAccountBodySchema', () => {
  it('acepta la contraseña tal cual, sin recortarla (RF-28)', () => {
    expect(deleteAccountBodySchema.parse({ password: ' con espacios y ñ ' })).toEqual({ password: ' con espacios y ñ ' });
  });

  it.each([
    ['sin password', {}],
    ['con password vacía', { password: '' }],
    ['con password de más de 128 caracteres', { password: 'a'.repeat(129) }],
    ['con un número', { password: 123456789012 }],
  ])('%s → se rechaza', (_case, input) => {
    expect(deleteAccountBodySchema.safeParse(input).success).toBe(false);
  });
});
