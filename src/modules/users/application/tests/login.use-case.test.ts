import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { FakePasswordHasher } from '../../../../../tests/support/fake-password-hasher.adapter.js';
import { InMemoryLoginAttemptRepository } from '../../../../../tests/support/in-memory-login-attempt.repository.js';
import { InMemorySessionRepository } from '../../../../../tests/support/in-memory-session.repository.js';
import { InMemoryUserRepository } from '../../../../../tests/support/in-memory-user.repository.js';
import {
  FAKE_TURNSTILE_HOSTNAME,
  FakeTurnstileVerifier,
  turnstileTokenFor,
} from '../../../../../tests/support/fake-turnstile-verifier.adapter.js';
import { InMemoryTurnstileTokenRepository } from '../../../../../tests/support/in-memory-turnstile-token.repository.js';
import { MAX_FAILED_ATTEMPTS } from '../../domain/login-throttle.value-object.js';
import { AesGcmSecretCipher } from '../../infrastructure/aes-gcm-secret-cipher.adapter.js';
import { CryptoTokenService } from '../../infrastructure/crypto-token.adapter.js';
import { LoginUseCase } from '../login.use-case.js';
import { VerifyTurnstileUseCase } from '../verify-turnstile.use-case.js';

const EMAIL = 'ana@example.com';
const PASSWORD = 'correct horse battery';
const WRONG = 'contraseña equivocada';

describe('LoginUseCase', () => {
  let clock: FakeClock;
  let users: InMemoryUserRepository;
  let sessions: InMemorySessionRepository;
  let loginAttempts: InMemoryLoginAttemptRepository;
  let hasher: FakePasswordHasher;
  let verifier: FakeTurnstileVerifier;
  let useCase: LoginUseCase;
  const tokens = new CryptoTokenService();
  // Un token aleatorio son 32 bytes: sirve como clave AES-256 sin depender de ningún secreto
  const cipher = new AesGcmSecretCipher(Buffer.from(tokens.randomToken(), 'base64url'));

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
    verifier = new FakeTurnstileVerifier();
    const verifyTurnstile = new VerifyTurnstileUseCase(verifier, new InMemoryTurnstileTokenRepository(), tokens, clock, {
      allowedHostnames: [FAKE_TURNSTILE_HOSTNAME],
      checkReplayAndAction: true,
    });
    useCase = new LoginUseCase(users, sessions, loginAttempts, hasher, tokens, cipher, clock, verifyTurnstile);
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

  it('guarda además una copia cifrada del token CSRF que se abre con el mismo token (RF-02 y RNF-04 de la 003)', async () => {
    const result = await useCase.execute({ email: EMAIL, password: PASSWORD });
    const record = await sessions.findById(result.session.id);
    expect(record?.csrfTokenSealed).not.toContain(result.csrfToken);
    expect(cipher.open(record?.csrfTokenSealed ?? '')).toBe(result.csrfToken);
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

  describe('con token de Turnstile (spec 005)', () => {
    const loginWith = (password: string, email = EMAIL, turnstileToken = turnstileTokenFor('login')) =>
      useCase.execute({ email, password, turnstileToken });

    it('un token válido para el login y credenciales correctas abren sesión (RF-03)', async () => {
      await expect(loginWith(PASSWORD)).resolves.toMatchObject({ user: { email: EMAIL } });
      expect(verifier.requests).toHaveLength(1);
    });

    it('un token rechazado → TURNSTILE_FAILED sin comprobar la contraseña, sin registrar fallo ni abrir sesión (RF-10, RF-12)', async () => {
      verifier.rejectNext();
      await expect(loginWith(WRONG)).rejects.toMatchObject({ code: 'TURNSTILE_FAILED' });
      expect(loginAttempts.has(EMAIL)).toBe(false);
      expect(hasher.dummyVerifications).toBe(0);
      expect(sessions.count()).toBe(0);
    });

    it('responde lo mismo con un email existente y con uno inexistente (RF-11, RF-13)', async () => {
      verifier.rejectNext();
      verifier.rejectNext();
      const existing = loginWith(PASSWORD).catch((error: unknown) => error);
      const missing = loginWith(PASSWORD, 'nadie@example.com').catch((error: unknown) => error);
      const [a, b] = (await Promise.all([existing, missing])) as Array<{ code: string; message: string }>;
      expect({ code: a?.code, message: a?.message }).toEqual({ code: b?.code, message: b?.message });
      expect(a?.code).toBe('TURNSTILE_FAILED');
      expect(hasher.dummyVerifications).toBe(0);
    });

    it('un token para otra acción → TURNSTILE_FAILED (RF-06)', async () => {
      await expect(loginWith(PASSWORD, EMAIL, turnstileTokenFor('register'))).rejects.toMatchObject({
        code: 'TURNSTILE_FAILED',
      });
      expect(sessions.count()).toBe(0);
    });

    it('10 rechazos contra un email no lo bloquean: luego el dueño entra (RF-12, CE-02)', async () => {
      for (let attempt = 0; attempt < 10; attempt++) {
        verifier.rejectNext();
        await expect(loginWith(WRONG)).rejects.toMatchObject({ code: 'TURNSTILE_FAILED' });
      }
      await expect(loginWith(PASSWORD)).resolves.toBeDefined();
    });

    it('Cloudflare inaccesible → TURNSTILE_UNAVAILABLE, que tampoco cuenta (RF-09, RF-12)', async () => {
      verifier.respondWith({ kind: 'unreachable' }, { kind: 'unreachable' });
      await expect(loginWith(WRONG)).rejects.toMatchObject({ code: 'TURNSTILE_UNAVAILABLE' });
      expect(loginAttempts.has(EMAIL)).toBe(false);
    });

    it('token válido y email bloqueado → TOO_MANY_ATTEMPTS (RF-09 de la 002)', async () => {
      await failTimes(MAX_FAILED_ATTEMPTS);
      await expect(loginWith(PASSWORD)).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
    });

    it('token válido y contraseña incorrecta → INVALID_CREDENTIALS, que sí cuenta para el bloqueo', async () => {
      await expect(loginWith(WRONG)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(loginAttempts.has(EMAIL)).toBe(true);
    });

    it('token rechazado y email bloqueado → TURNSTILE_FAILED, no TOO_MANY_ATTEMPTS (RF-13, RF-14)', async () => {
      await failTimes(MAX_FAILED_ATTEMPTS);
      verifier.rejectNext();
      await expect(loginWith(PASSWORD)).rejects.toMatchObject({ code: 'TURNSTILE_FAILED' });
    });

    it('sin token no consulta a Cloudflare: lo decide el modo en el schema (RF-15)', async () => {
      await useCase.execute({ email: EMAIL, password: PASSWORD });
      expect(verifier.requests).toHaveLength(0);
    });
  });
});
