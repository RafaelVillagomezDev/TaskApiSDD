import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { FakePasswordHasher } from '../../../../../tests/support/fake-password-hasher.adapter.js';
import { InMemoryLoginAttemptRepository } from '../../../../../tests/support/in-memory-login-attempt.repository.js';
import { InMemorySessionRepository } from '../../../../../tests/support/in-memory-session.repository.js';
import { InMemoryUserRepository } from '../../../../../tests/support/in-memory-user.repository.js';
import { MAX_FAILED_ATTEMPTS } from '../../domain/login-throttle.value-object.js';
import { Session } from '../../domain/session.entity.js';
import { ChangePasswordUseCase } from '../change-password.use-case.js';
import { ConfirmPasswordUseCase } from '../confirm-password.use-case.js';

const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'otra frase bastante larga';

describe('ChangePasswordUseCase', () => {
  let clock: FakeClock;
  let users: InMemoryUserRepository;
  let sessions: InMemorySessionRepository;
  let hasher: FakePasswordHasher;
  let useCase: ChangePasswordUseCase;
  let userId: string;

  const openSession = (owner: string, name: string) =>
    sessions.create({
      userId: owner,
      accessTokenHash: `acceso-${name}`,
      refreshTokenHash: `refresh-${name}`,
      csrfTokenHash: `csrf-${name}`,
      schedule: Session.schedule(clock.now()),
      now: clock.now(),
    });
  const change = (sessionId: string, currentPassword: string, newPassword = NEW_PASSWORD) =>
    useCase.execute({ userId, sessionId, currentPassword, newPassword });

  beforeEach(async () => {
    clock = new FakeClock('2026-10-28T10:00:00Z');
    users = new InMemoryUserRepository();
    sessions = new InMemorySessionRepository();
    hasher = new FakePasswordHasher();
    const loginAttempts = new InMemoryLoginAttemptRepository();
    useCase = new ChangePasswordUseCase(
      new ConfirmPasswordUseCase(users, loginAttempts, hasher, clock),
      users,
      sessions,
      hasher,
    );
    userId = (await users.create({ email: 'ana@example.com', name: null, passwordHash: await hasher.hash(PASSWORD) })).id;
  });

  it('guarda la huella de la nueva, cierra las demás sesiones de la cuenta y mantiene la actual (RF-27)', async () => {
    const current = await openSession(userId, 'portatil');
    await openSession(userId, 'movil');
    const other = await openSession('otra-cuenta', 'bea');
    await change(current.id, PASSWORD);
    expect((await users.findById(userId))?.passwordHash).toBe(await hasher.hash(NEW_PASSWORD));
    expect(sessions.sessionIdsOf(userId)).toEqual([current.id]);
    expect(sessions.sessionIdsOf('otra-cuenta')).toEqual([other.id]);
  });

  it('la nueva puede coincidir con la actual y aun así cierra las demás sesiones (RF-27)', async () => {
    const current = await openSession(userId, 'portatil');
    await openSession(userId, 'movil');
    await change(current.id, PASSWORD, PASSWORD);
    expect(sessions.sessionIdsOf(userId)).toEqual([current.id]);
  });

  it('con la contraseña actual errónea → WRONG_PASSWORD sin cambiar nada (RF-28)', async () => {
    const current = await openSession(userId, 'portatil');
    await openSession(userId, 'movil');
    await expect(change(current.id, 'contraseña equivocada')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect((await users.findById(userId))?.passwordHash).toBe(await hasher.hash(PASSWORD));
    expect(sessions.sessionIdsOf(userId)).toHaveLength(2);
  });

  it('con la cuenta bloqueada → TOO_MANY_ATTEMPTS aunque la actual sea correcta (RF-09)', async () => {
    const current = await openSession(userId, 'portatil');
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
      await change(current.id, 'contraseña equivocada').catch(() => undefined);
    }
    await expect(change(current.id, PASSWORD)).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
    expect((await users.findById(userId))?.passwordHash).toBe(await hasher.hash(PASSWORD));
  });
});
