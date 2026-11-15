import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { FakePasswordHasher } from '../../../../../tests/support/fake-password-hasher.adapter.js';
import {
  FAKE_TURNSTILE_HOSTNAME,
  FakeTurnstileVerifier,
  turnstileTokenFor,
} from '../../../../../tests/support/fake-turnstile-verifier.adapter.js';
import { InMemoryTurnstileTokenRepository } from '../../../../../tests/support/in-memory-turnstile-token.repository.js';
import { InMemoryUserRepository } from '../../../../../tests/support/in-memory-user.repository.js';
import { CryptoTokenService } from '../../infrastructure/crypto-token.adapter.js';
import { RegisterUserUseCase } from '../register-user.use-case.js';
import { VerifyTurnstileUseCase } from '../verify-turnstile.use-case.js';

const jest = import.meta.jest;

describe('RegisterUserUseCase', () => {
  let users: InMemoryUserRepository;
  let hasher: FakePasswordHasher;
  let verifier: FakeTurnstileVerifier;
  let useCase: RegisterUserUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    hasher = new FakePasswordHasher();
    verifier = new FakeTurnstileVerifier();
    const verifyTurnstile = new VerifyTurnstileUseCase(
      verifier,
      new InMemoryTurnstileTokenRepository(),
      new CryptoTokenService(),
      new FakeClock('2026-11-15T10:00:00Z'),
      { allowedHostnames: [FAKE_TURNSTILE_HOSTNAME], checkReplayAndAction: true },
    );
    useCase = new RegisterUserUseCase(users, hasher, verifyTurnstile);
  });

  it('crea la cuenta con el email, el nombre y la huella de la contraseña (RF-01, RNF-03)', async () => {
    const user = await useCase.execute({ email: 'ana@example.com', password: 'correct horse battery', name: 'Ana' });
    expect(user).toMatchObject({ email: 'ana@example.com', name: 'Ana' });
    expect(user.passwordHash).toBe(await hasher.hash('correct horse battery'));
    expect((await users.findByEmail('ana@example.com'))?.id).toBe(user.id);
  });

  it('acepta una cuenta sin nombre', async () => {
    expect((await useCase.execute({ email: 'bea@example.com', password: 'correct horse battery', name: null })).name).toBeNull();
  });

  it('un email ya registrado → EMAIL_ALREADY_REGISTERED y no crea otra cuenta (RF-03)', async () => {
    await useCase.execute({ email: 'ana@example.com', password: 'correct horse battery', name: null });
    await expect(
      useCase.execute({ email: 'ana@example.com', password: 'otra contraseña larga', name: 'Otra' }),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
    expect(users.count()).toBe(1);
  });

  describe('con token de Turnstile (spec 005)', () => {
    const registerWith = (email: string, turnstileToken = turnstileTokenFor('register')) =>
      useCase.execute({ email, password: 'correct horse battery', name: null, turnstileToken });

    it('un token válido para el registro crea la cuenta, tras verificarlo con la acción register (RF-04)', async () => {
      await expect(registerWith('ana@example.com')).resolves.toMatchObject({ email: 'ana@example.com' });
      expect(verifier.requests).toHaveLength(1);
      expect(users.count()).toBe(1);
    });

    it('un token rechazado → TURNSTILE_FAILED sin buscar el email ni crear la cuenta (RF-04, RF-10)', async () => {
      const findByEmail = jest.spyOn(users, 'findByEmail');
      verifier.rejectNext();
      await expect(registerWith('ana@example.com')).rejects.toMatchObject({ code: 'TURNSTILE_FAILED' });
      expect(findByEmail).not.toHaveBeenCalled();
      expect(users.count()).toBe(0);
    });

    it('token rechazado y email ya registrado → TURNSTILE_FAILED, no EMAIL_ALREADY_REGISTERED (RF-13, CE-01)', async () => {
      await registerWith('ana@example.com');
      verifier.rejectNext();
      await expect(registerWith('ana@example.com')).rejects.toMatchObject({ code: 'TURNSTILE_FAILED' });
    });

    it('un token para la acción del login → TURNSTILE_FAILED (RF-06)', async () => {
      await expect(registerWith('ana@example.com', turnstileTokenFor('login'))).rejects.toMatchObject({
        code: 'TURNSTILE_FAILED',
      });
      expect(users.count()).toBe(0);
    });

    it('Cloudflare inaccesible → TURNSTILE_UNAVAILABLE sin crear la cuenta (RF-09, RF-10)', async () => {
      verifier.respondWith({ kind: 'unreachable' }, { kind: 'unreachable' });
      await expect(registerWith('ana@example.com')).rejects.toMatchObject({ code: 'TURNSTILE_UNAVAILABLE' });
      expect(users.count()).toBe(0);
    });

    it('token válido y email ya registrado → EMAIL_ALREADY_REGISTERED (RF-03 de la 002)', async () => {
      await registerWith('ana@example.com');
      await expect(registerWith('ana@example.com')).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
    });

    it('sin token no consulta a Cloudflare: lo decide el modo en el schema (RF-15)', async () => {
      await useCase.execute({ email: 'ana@example.com', password: 'correct horse battery', name: null });
      expect(verifier.requests).toHaveLength(0);
    });
  });
});
