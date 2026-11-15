import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { InMemorySessionRepository } from '../../../../../tests/support/in-memory-session.repository.js';
import { Session } from '../../domain/session.entity.js';
import { CryptoTokenService } from '../../infrastructure/crypto-token.adapter.js';
import { LogoutUseCase } from '../logout.use-case.js';
import { VerifySessionCsrfUseCase } from '../verify-session-csrf.use-case.js';

const USER_ID = '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b';

describe('LogoutUseCase', () => {
  let clock: FakeClock;
  let sessions: InMemorySessionRepository;
  let useCase: LogoutUseCase;
  const tokens = new CryptoTokenService();

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
    useCase = new LogoutUseCase(sessions, tokens, new VerifySessionCsrfUseCase(tokens));
  });

  it('cierra la sesión del token de acceso con sus refresh tokens y no toca las demás (RF-15, RF-16)', async () => {
    const mine = await openSession();
    const other = await openSession();
    await useCase.execute({ accessToken: mine.accessToken, refreshToken: mine.refreshToken, csrfToken: mine.csrfToken });
    expect(sessions.sessionIdsOf(USER_ID)).toEqual([other.session.id]);
    expect(await sessions.findByRefreshTokenHash(tokens.fingerprint(mine.refreshToken))).toBeNull();
  });

  it('con el token de acceso caducado también la cierra (RF-15)', async () => {
    const mine = await openSession();
    clock.advance(16 * 60_000);
    await useCase.execute({ accessToken: mine.accessToken, csrfToken: mine.csrfToken });
    expect(sessions.count()).toBe(0);
  });

  it('sin cookie de acceso válida la resuelve por el refresh token (RF-15)', async () => {
    const mine = await openSession();
    await useCase.execute({ refreshToken: mine.refreshToken, csrfToken: mine.csrfToken });
    expect(sessions.count()).toBe(0);
    const again = await openSession();
    await useCase.execute({ accessToken: 'inventado', refreshToken: again.refreshToken, csrfToken: again.csrfToken });
    expect(sessions.count()).toBe(0);
  });

  it('sin ninguna cookie → MISSING_TOKEN (RF-18)', async () => {
    await expect(useCase.execute({ csrfToken: 'cualquiera' })).rejects.toMatchObject({ code: 'MISSING_TOKEN' });
  });

  it('con cookies que no resuelven ninguna sesión → INVALID_TOKEN (RF-19, decisión 19)', async () => {
    const mine = await openSession();
    await useCase.execute({ accessToken: mine.accessToken, csrfToken: mine.csrfToken });
    await expect(
      useCase.execute({ accessToken: mine.accessToken, refreshToken: mine.refreshToken, csrfToken: mine.csrfToken }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  it('con el token CSRF de otra sesión → INVALID_CSRF_TOKEN y la sesión sigue abierta (RF-23)', async () => {
    const mine = await openSession();
    const other = await openSession();
    await expect(useCase.execute({ accessToken: mine.accessToken, csrfToken: other.csrfToken })).rejects.toMatchObject({
      code: 'INVALID_CSRF_TOKEN',
    });
    expect(sessions.count()).toBe(2);
  });
});
