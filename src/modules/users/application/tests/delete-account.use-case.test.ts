import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { FakePasswordHasher } from '../../../../../tests/support/fake-password-hasher.adapter.js';
import { InMemoryLoginAttemptRepository } from '../../../../../tests/support/in-memory-login-attempt.repository.js';
import { InMemoryUserRepository } from '../../../../../tests/support/in-memory-user.repository.js';
import { MAX_FAILED_ATTEMPTS } from '../../domain/login-throttle.value-object.js';
import { ConfirmPasswordUseCase } from '../confirm-password.use-case.js';
import { DeleteAccountUseCase } from '../delete-account.use-case.js';

const EMAIL = 'ana@example.com';
const PASSWORD = 'correct horse battery';
const WRONG = 'contraseña equivocada';

describe('DeleteAccountUseCase', () => {
  let clock: FakeClock;
  let users: InMemoryUserRepository;
  let loginAttempts: InMemoryLoginAttemptRepository;
  let useCase: DeleteAccountUseCase;
  let userId: string;

  beforeEach(async () => {
    clock = new FakeClock('2026-10-28T10:00:00Z');
    users = new InMemoryUserRepository();
    loginAttempts = new InMemoryLoginAttemptRepository();
    const hasher = new FakePasswordHasher();
    useCase = new DeleteAccountUseCase(new ConfirmPasswordUseCase(users, loginAttempts, hasher, clock), users, loginAttempts);
    userId = (await users.create({ email: EMAIL, name: 'Ana', passwordHash: await hasher.hash(PASSWORD) })).id;
  });

  it('con la contraseña correcta borra la cuenta y su registro de intentos fallidos (RF-29)', async () => {
    await loginAttempts.save(EMAIL, (await loginAttempts.find(EMAIL)).registerFailure(clock.now()));
    await useCase.execute(userId, PASSWORD);
    expect(await users.findById(userId)).toBeNull();
    expect(loginAttempts.has(EMAIL)).toBe(false);
  });

  it('no toca las demás cuentas (RF-21, RF-29)', async () => {
    const bea = await users.create({ email: 'bea@example.com', name: null, passwordHash: 'fake$otra' });
    await useCase.execute(userId, PASSWORD);
    expect(await users.findById(bea.id)).not.toBeNull();
  });

  it('con la contraseña errónea → WRONG_PASSWORD, la cuenta sigue intacta y el fallo cuenta (RF-28)', async () => {
    await expect(useCase.execute(userId, WRONG)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect(await users.findById(userId)).toMatchObject({ email: EMAIL, name: 'Ana' });
    expect((await loginAttempts.find(EMAIL)).failedAt).toHaveLength(1);
  });

  it('con la cuenta bloqueada → TOO_MANY_ATTEMPTS aunque la contraseña sea correcta, y no borra nada (RF-09)', async () => {
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
      await useCase.execute(userId, WRONG).catch(() => undefined);
    }
    await expect(useCase.execute(userId, PASSWORD)).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
    expect(await users.findById(userId)).not.toBeNull();
  });
});
