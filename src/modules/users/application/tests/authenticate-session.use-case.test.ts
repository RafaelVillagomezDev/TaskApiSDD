import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { InMemorySessionRepository } from '../../../../../tests/support/in-memory-session.repository.js';
import { Session } from '../../domain/session.entity.js';
import { CryptoTokenService } from '../../infrastructure/crypto-token.adapter.js';
import { AuthenticateSessionUseCase } from '../authenticate-session.use-case.js';
import { VerifySessionCsrfUseCase } from '../verify-session-csrf.use-case.js';

const USER_ID = '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b';

describe('AuthenticateSessionUseCase', () => {
  let clock: FakeClock;
  let sessions: InMemorySessionRepository;
  let useCase: AuthenticateSessionUseCase;
  const tokens = new CryptoTokenService();

  // Sesión abierta ahora con tokens conocidos
  const openSession = async () => {
    const accessToken = tokens.randomToken();
    const refreshToken = tokens.randomToken();
    const csrfToken = tokens.randomToken();
    const session = await sessions.create({
      userId: USER_ID,
      accessTokenHash: tokens.fingerprint(accessToken),
      refreshTokenHash: tokens.fingerprint(refreshToken),
      csrfTokenHash: tokens.fingerprint(csrfToken),
      csrfTokenSealed: 'v1.copia-csrf',
      schedule: Session.schedule(clock.now()),
      now: clock.now(),
    });
    return { session, accessToken, refreshToken, csrfToken };
  };

  beforeEach(() => {
    clock = new FakeClock('2026-10-28T10:00:00Z');
    sessions = new InMemorySessionRepository();
    useCase = new AuthenticateSessionUseCase(sessions, tokens, new VerifySessionCsrfUseCase(tokens), clock);
  });

  it('un token de acceso vigente → SessionContext con el usuario y la sesión (RF-17)', async () => {
    const { session, accessToken } = await openSession();
    await expect(useCase.execute({ accessToken })).resolves.toEqual({ userId: USER_ID, sessionId: session.id });
  });

  it('sin token → MISSING_TOKEN (RF-18)', async () => {
    await expect(useCase.execute({ accessToken: undefined })).rejects.toMatchObject({ code: 'MISSING_TOKEN' });
  });

  it.each(['inventado', 'a'.repeat(43)])('token desconocido %p → INVALID_TOKEN (RF-19)', async (accessToken) => {
    await openSession();
    await expect(useCase.execute({ accessToken })).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('token de una sesión cerrada → INVALID_TOKEN (RF-19)', async () => {
    const { session, accessToken } = await openSession();
    await sessions.delete(session.id);
    await expect(useCase.execute({ accessToken })).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('token de una generación anterior → INVALID_TOKEN (D-14)', async () => {
    const { accessToken, refreshToken } = await openSession();
    // Una rotación sustituye la huella del token de acceso por la del nuevo
    await sessions.withRefreshTokenLocked(tokens.fingerprint(refreshToken), async (record, unit) => {
      if (!record) throw new Error('El refresh token de prueba no existe');
      record.session.rotate(clock.now());
      await unit.rotate(
        record,
        {
          accessTokenHash: tokens.fingerprint(tokens.randomToken()),
          refreshTokenHash: tokens.fingerprint(tokens.randomToken()),
          graceTokens: 'copia cifrada',
        },
        clock.now(),
      );
    });
    await expect(useCase.execute({ accessToken })).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('token caducado a los 15 minutos exactos → TOKEN_EXPIRED (RF-20)', async () => {
    const { accessToken } = await openSession();
    clock.advance(15 * 60_000 - 1);
    await expect(useCase.execute({ accessToken })).resolves.toBeDefined();
    clock.advance(1);
    await expect(useCase.execute({ accessToken })).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  describe('con X-CSRF-Token (POST, PATCH y DELETE)', () => {
    it('el token CSRF de la sesión → SessionContext (RF-23)', async () => {
      const { session, accessToken, csrfToken } = await openSession();
      await expect(useCase.execute({ accessToken, csrfToken })).resolves.toEqual({
        userId: USER_ID,
        sessionId: session.id,
      });
    });

    it('el token CSRF de otra sesión → INVALID_CSRF_TOKEN (RF-23)', async () => {
      const { accessToken } = await openSession();
      const other = await openSession();
      await expect(useCase.execute({ accessToken, csrfToken: other.csrfToken })).rejects.toMatchObject({
        code: 'INVALID_CSRF_TOKEN',
      });
    });

    it('sin sesión con la que compararlo gana el error de sesión (decisión 19)', async () => {
      await expect(useCase.execute({ accessToken: undefined, csrfToken: 'cualquiera' })).rejects.toMatchObject({
        code: 'MISSING_TOKEN',
      });
      await expect(useCase.execute({ accessToken: 'inventado', csrfToken: 'cualquiera' })).rejects.toMatchObject({
        code: 'INVALID_TOKEN',
      });
    });

    it('el CSRF erróneo gana al token caducado (RF-34)', async () => {
      const { accessToken } = await openSession();
      clock.advance(16 * 60_000);
      await expect(useCase.execute({ accessToken, csrfToken: 'otro' })).rejects.toMatchObject({
        code: 'INVALID_CSRF_TOKEN',
      });
    });
  });
});
