import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { FakePasswordHasher } from '../../../../../tests/support/fake-password-hasher.adapter.js';
import { InMemoryLoginAttemptRepository } from '../../../../../tests/support/in-memory-login-attempt.repository.js';
import { InMemoryUserRepository } from '../../../../../tests/support/in-memory-user.repository.js';
import { MAX_FAILED_ATTEMPTS } from '../../domain/login-throttle.value-object.js';
import { ConfirmPasswordUseCase } from '../confirm-password.use-case.js';

const PASSWORD = 'correct horse battery';
const WRONG = 'contraseña equivocada';

describe('ConfirmPasswordUseCase', () => {
  let clock: FakeClock;
  let users: InMemoryUserRepository;
  let loginAttempts: InMemoryLoginAttemptRepository;
  let useCase: ConfirmPasswordUseCase;
  let userId: string;

  beforeEach(async () => {
    clock = new FakeClock('2026-10-28T10:00:00Z');
    users = new InMemoryUserRepository();
    loginAttempts = new InMemoryLoginAttemptRepository();
    const hasher = new FakePasswordHasher();
    useCase = new ConfirmPasswordUseCase(users, loginAttempts, hasher, clock);
    userId = (await users.create({ email: 'ana@example.com', name: null, passwordHash: await hasher.hash(PASSWORD) })).id;
  });

  it('con la contraseña correcta devuelve la cuenta y no cuenta ningún fallo (RF-28)', async () => {
    await expect(useCase.execute(userId, PASSWORD)).resolves.toMatchObject({ id: userId, email: 'ana@example.com' });
    expect(loginAttempts.has('ana@example.com')).toBe(false);
  });

  it('con la contraseña errónea → WRONG_PASSWORD y cuenta el fallo por el email de la cuenta (RF-09, RF-28)', async () => {
    await expect(useCase.execute(userId, WRONG)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect((await loginAttempts.find('ana@example.com')).failedAt).toHaveLength(1);
  });

  it('el quinto fallo aún responde WRONG_PASSWORD y bloquea: después, TOO_MANY_ATTEMPTS aunque sea correcta (RF-09)', async () => {
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
      await expect(useCase.execute(userId, WRONG)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    }
    await expect(useCase.execute(userId, PASSWORD)).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
  });

  it('suma los fallos del login con el mismo email: 3 logins fallidos y 2 contraseñas erróneas bloquean (RF-09)', async () => {
    let throttle = await loginAttempts.find('ana@example.com');
    for (let attempt = 0; attempt < 3; attempt++) throttle = throttle.registerFailure(clock.now());
    await loginAttempts.save('ana@example.com', throttle);
    await expect(useCase.execute(userId, WRONG)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await expect(useCase.execute(userId, WRONG)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await expect(useCase.execute(userId, PASSWORD)).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
  });

  it('bloqueada, no comprueba la contraseña ni cuenta otro fallo; a los 15 minutos vuelve a funcionar (RF-09)', async () => {
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
      await useCase.execute(userId, WRONG).catch(() => undefined);
    }
    const locked = await loginAttempts.find('ana@example.com');
    await expect(useCase.execute(userId, WRONG)).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
    expect(await loginAttempts.find('ana@example.com')).toEqual(locked);
    clock.advance(15 * 60_000);
    await expect(useCase.execute(userId, PASSWORD)).resolves.toBeDefined();
  });

  it('si la cuenta ya no existe → INVALID_TOKEN, como una sesión cerrada (RF-19)', async () => {
    await expect(useCase.execute('6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b', PASSWORD)).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
    });
  });
});
