import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { FakePasswordHasher } from '../../../../../tests/support/fake-password-hasher.adapter.js';
import { InMemoryLoginAttemptRepository } from '../../../../../tests/support/in-memory-login-attempt.repository.js';
import { InMemorySessionRepository } from '../../../../../tests/support/in-memory-session.repository.js';
import { InMemoryUserRepository } from '../../../../../tests/support/in-memory-user.repository.js';
import { MAX_FAILED_ATTEMPTS } from '../../domain/login-throttle.value-object.js';
import { CryptoTokenService } from '../../infrastructure/crypto-token.adapter.js';
import { LoginUseCase } from '../login.use-case.js';

const EMAIL = 'ana@example.com';
const PASSWORD = 'correct horse battery';
const WRONG = 'contraseña equivocada';

describe('LoginUseCase', () => {
  let clock: FakeClock;
  let users: InMemoryUserRepository;
  let sessions: InMemorySessionRepository;
  let loginAttempts: InMemoryLoginAttemptRepository;
  let hasher: FakePasswordHasher;
  let useCase: LoginUseCase;
  const tokens = new CryptoTokenService();

  const failTimes = async (times: number, email = EMAIL) => {
    for (let attempt = 0; attempt < times; attempt++) {
      await expect(useCase.execute({ email, password: WRONG })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }
  };

  beforeEach(async () => {
    clock = new FakeClock('2026-10-28T10:00:00Z');
    users = new InMemoryUserRepository();
    sessions = new InMemorySessionRepository();
    loginAttempts = new InMemoryLoginAttemptRepository();
    hasher = new FakePasswordHasher();
    useCase = new LoginUseCase(users, sessions, loginAttempts, hasher, tokens, clock);
    await users.create({ email: EMAIL, name: 'Ana', passwordHash: await hasher.hash(PASSWORD) });
  });

  it('abre una sesión de 15 min / 7 días / 30 días y devuelve la cuenta y tres tokens distintos (RF-07, RF-24)', async () => {
    const result = await useCase.execute({ email: EMAIL, password: PASSWORD });
    expect(result.user.email).toBe(EMAIL);
    expect(result.session).toMatchObject({
      userId: result.user.id,
      generation: 0,
      accessExpiresAt: new Date('2026-10-28T10:15:00Z'),
      refreshExpiresAt: new Date('2026-11-04T10:00:00Z'),
      expiresAt: new Date('2026-11-27T10:00:00Z'),
    });
    expect(new Set([result.accessToken, result.refreshToken, result.csrfToken]).size).toBe(3);
  });

  it('guarda solo las huellas de los tokens (RNF-06)', async () => {
    const result = await useCase.execute({ email: EMAIL, password: PASSWORD });
    const byAccess = await sessions.findByAccessTokenHash(tokens.fingerprint(result.accessToken));
    expect(byAccess?.session.id).toBe(result.session.id);
    expect(byAccess?.csrfTokenHash).toBe(tokens.fingerprint(result.csrfToken));
    expect((await sessions.findByRefreshTokenHash(tokens.fingerprint(result.refreshToken)))?.session.id).toBe(
      result.session.id,
    );
    expect(await sessions.findByAccessTokenHash(result.accessToken)).toBeNull();
  });

  it('contraseña errónea → INVALID_CREDENTIALS sin abrir sesión (RF-08)', async () => {
    await failTimes(1);
    expect(sessions.count()).toBe(0);
    expect(hasher.dummyVerifications).toBe(0);
  });

  it('email inexistente → el mismo INVALID_CREDENTIALS, verificando contra el hash ficticio (RF-08, D-3)', async () => {
    await expect(useCase.execute({ email: 'nadie@example.com', password: PASSWORD })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'El email o la contraseña no son correctos.',
    });
    expect(hasher.dummyVerifications).toBe(1);
    expect(loginAttempts.has('nadie@example.com')).toBe(true);
  });

  it('el quinto fallo aún responde INVALID_CREDENTIALS y el sexto TOO_MANY_ATTEMPTS aunque sea correcto (RF-09)', async () => {
    await failTimes(MAX_FAILED_ATTEMPTS);
    await expect(useCase.execute({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: 'TOO_MANY_ATTEMPTS',
    });
    expect(sessions.count()).toBe(0);
  });

  it('el bloqueo dura 15 minutos desde el quinto fallo (RF-09)', async () => {
    await failTimes(MAX_FAILED_ATTEMPTS);
    clock.advance(15 * 60_000 - 1);
    await expect(useCase.execute({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: 'TOO_MANY_ATTEMPTS',
    });
    clock.advance(1);
    await expect(useCase.execute({ email: EMAIL, password: PASSWORD })).resolves.toBeDefined();
  });

  it('bloqueado, no comprueba la contraseña ni cuenta otro fallo (RF-09, RF-34)', async () => {
    await failTimes(MAX_FAILED_ATTEMPTS);
    const throttle = await loginAttempts.find(EMAIL);
    await expect(useCase.execute({ email: EMAIL, password: WRONG })).rejects.toMatchObject({
      code: 'TOO_MANY_ATTEMPTS',
    });
    expect(await loginAttempts.find(EMAIL)).toEqual(throttle);
  });

  it('el bloqueo también se aplica a un email que no existe (RF-09)', async () => {
    await failTimes(MAX_FAILED_ATTEMPTS, 'nadie@example.com');
    await expect(useCase.execute({ email: 'nadie@example.com', password: PASSWORD })).rejects.toMatchObject({
      code: 'TOO_MANY_ATTEMPTS',
    });
  });

  it('un login correcto pone el contador a cero: 4 fallos, éxito y 4 fallos no bloquean (RF-10)', async () => {
    await failTimes(MAX_FAILED_ATTEMPTS - 1);
    await useCase.execute({ email: EMAIL, password: PASSWORD });
    expect(loginAttempts.has(EMAIL)).toBe(false);
    await failTimes(MAX_FAILED_ATTEMPTS - 1);
    await expect(useCase.execute({ email: EMAIL, password: PASSWORD })).resolves.toBeDefined();
  });

  it('permite varias sesiones a la vez, independientes (RF-16)', async () => {
    const first = await useCase.execute({ email: EMAIL, password: PASSWORD });
    const second = await useCase.execute({ email: EMAIL, password: PASSWORD });
    expect(second.session.id).not.toBe(first.session.id);
    expect(second.csrfToken).not.toBe(first.csrfToken);
    expect(sessions.sessionIdsOf(first.user.id)).toHaveLength(2);
  });
});
