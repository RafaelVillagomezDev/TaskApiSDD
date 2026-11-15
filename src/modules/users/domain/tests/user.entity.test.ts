import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  User,
  type UserProps,
} from '../user.entity.js';

const props = (overrides: Partial<UserProps> = {}): UserProps => ({
  id: '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b',
  email: 'ana@example.com',
  name: 'Ana',
  passwordHash: '$argon2id$v=19$m=19456,p=1,t=2$sal$hash',
  createdAt: new Date('2026-10-28T09:15:00Z'),
  ...overrides,
});

describe('User', () => {
  it('fija los límites de la spec (RF-02, RF-04, RF-05)', () => {
    expect(EMAIL_MAX_LENGTH).toBe(254);
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
    expect(NAME_MAX_LENGTH).toBe(100);
  });

  it('expone sus datos', () => {
    const user = User.restore(props());
    expect(user).toMatchObject({ id: props().id, email: 'ana@example.com', name: 'Ana' });
    expect(user.createdAt.toISOString()).toBe('2026-10-28T09:15:00.000Z');
  });

  it.each([
    ['  Ana García  ', 'Ana García'],
    ['   ', null],
    ['', null],
    [null, null],
  ])('rename(%p) guarda %p: recortado y vacío como null (RF-05)', (name, expected) => {
    const user = User.restore(props());
    user.rename(name);
    expect(user.name).toBe(expected);
  });

  it('cambia la huella de la contraseña (RF-27)', () => {
    const user = User.restore(props());
    user.changePasswordHash('$argon2id$v=19$m=19456,p=1,t=2$otra$huella');
    expect(user.passwordHash).toBe('$argon2id$v=19$m=19456,p=1,t=2$otra$huella');
  });
});
