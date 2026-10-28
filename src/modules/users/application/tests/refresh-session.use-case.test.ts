import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { InMemorySessionRepository } from '../../../../../tests/support/in-memory-session.repository.js';
import { Session } from '../../domain/session.entity.js';
import { AesGcmGraceCipher } from '../../infrastructure/aes-gcm-grace-cipher.adapter.js';
import { CryptoTokenService } from '../../infrastructure/crypto-token.adapter.js';
import { RefreshSessionUseCase } from '../refresh-session.use-case.js';
import { VerifySessionCsrfUseCase } from '../verify-session-csrf.use-case.js';

const USER_ID = '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b';
const SECOND = 1000;
const DAY = 24 * 3_600_000;

describe('RefreshSessionUseCase', () => {
  let clock: FakeClock;
  let sessions: InMemorySessionRepository;
  let useCase: RefreshSessionUseCase;
  const tokens = new CryptoTokenService();
  // Un token aleatorio son 32 bytes: sirve como clave AES-256 sin depender de ningún secreto
  const randomKey = () => Buffer.from(tokens.randomToken(), 'base64url');
  const cipher = new AesGcmGraceCipher(randomKey());

  // Sesión abierta ahora (login del día 1) con tokens conocidos
  const openSession = async () => {
    const accessToken = tokens.randomToken();
    const refreshToken = tokens.randomToken();
    const csrfToken = tokens.randomToken();
    const session = await sessions.create({
      userId: USER_ID,
      accessTokenHash: tokens.fingerprint(accessToken),
      refreshTokenHash: tokens.fingerprint(refreshToken),
      csrfTokenHash: tokens.fingerprint(csrfToken),
      schedule: Session.schedule(clock.now()),
      now: clock.now(),
    });
    return { session, accessToken, refreshToken, csrfToken };
  };
  const refresh = (refreshToken: string | undefined, csrfToken: string) =>
    useCase.execute({ refreshToken, csrfToken });

  beforeEach(() => {
    clock = new FakeClock('2026-10-28T10:00:00Z');
    sessions = new InMemorySessionRepository();
    useCase = new RefreshSessionUseCase(sessions, tokens, cipher, new VerifySessionCsrfUseCase(tokens), clock);
  });

  it('rota los dos tokens con 15 min y 7 días desde ahora; el anterior de acceso deja de valer (RF-11, D-14)', async () => {
    const { session, accessToken, refreshToken, csrfToken } = await openSession();
    clock.advance(DAY);
    const result = await refresh(refreshToken, csrfToken);
    expect(result).toMatchObject({
      accessExpiresAt: new Date('2026-10-29T10:15:00Z'),
      refreshExpiresAt: new Date('2026-11-05T10:00:00Z'),
      now: new Date('2026-10-29T10:00:00Z'),
    });
    expect(result.accessToken).not.toBe(accessToken);
    expect(result.refreshToken).not.toBe(refreshToken);
    const current = await sessions.findByAccessTokenHash(tokens.fingerprint(result.accessToken));
    expect(current?.session).toMatchObject({ id: session.id, generation: 1 });
    expect(await sessions.findByAccessTokenHash(tokens.fingerprint(accessToken))).toBeNull();
  });

  it('el token CSRF de la sesión no cambia al renovar (RF-24)', async () => {
    const { refreshToken, csrfToken } = await openSession();
    const result = await refresh(refreshToken, csrfToken);
    const current = await sessions.findByAccessTokenHash(tokens.fingerprint(result.accessToken));
    expect(current?.csrfTokenHash).toBe(tokens.fingerprint(csrfToken));
  });

  it('guarda la copia cifrada de los tokens nuevos, sin ellos en claro (RF-13, RNF-06)', async () => {
    const { refreshToken, csrfToken } = await openSession();
    const result = await refresh(refreshToken, csrfToken);
    const current = await sessions.findByAccessTokenHash(tokens.fingerprint(result.accessToken));
    expect(current?.graceTokens).not.toContain(result.accessToken);
    expect(cipher.open(current?.graceTokens ?? '')).toEqual({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  });

  it('las renovaciones alargan la sesión sin pasar del tope de 30 días: el ejemplo de RF-11', async () => {
    const opened = await openSession();
    const loginAt = clock.now().getTime();
    const onDay = (day: number) => clock.set(new Date(loginAt + (day - 1) * DAY));
    let refreshToken = opened.refreshToken;
    for (const day of [3, 9, 15, 21]) {
      onDay(day);
      refreshToken = (await refresh(refreshToken, opened.csrfToken)).refreshToken;
    }
    // El día 26, los 7 días llegarían al día 33: el refresh caduca con la sesión, el día 31 a la hora del login
    onDay(26);
    const capped = await refresh(refreshToken, opened.csrfToken);
    expect(capped.refreshExpiresAt).toEqual(new Date('2026-11-27T10:00:00Z'));
    onDay(31);
    await expect(refresh(capped.refreshToken, opened.csrfToken)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(sessions.count()).toBe(0);
  });

  it('7 días sin renovar → SESSION_EXPIRED y cierra la sesión (RF-12)', async () => {
    const { refreshToken, csrfToken } = await openSession();
    clock.advance(7 * DAY);
    await expect(refresh(refreshToken, csrfToken)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(sessions.count()).toBe(0);
  });

  it('un token rotado dentro de los 30 s devuelve los mismos tokens nuevos y la sesión sigue (RF-13)', async () => {
    const { refreshToken, csrfToken } = await openSession();
    const first = await refresh(refreshToken, csrfToken);
    clock.advance(10 * SECOND);
    const again = await refresh(refreshToken, csrfToken);
    expect(again).toMatchObject({ accessToken: first.accessToken, refreshToken: first.refreshToken });
    expect(again.accessExpiresAt).toEqual(first.accessExpiresAt);
    expect(sessions.count()).toBe(1);
    clock.advance(20 * SECOND);
    expect((await refresh(refreshToken, csrfToken)).accessToken).toBe(first.accessToken);
  });

  it('un token rotado a los 31 s → INVALID_REFRESH_TOKEN y cierra la sesión (RF-13, CE-04)', async () => {
    const { refreshToken, csrfToken } = await openSession();
    const first = await refresh(refreshToken, csrfToken);
    clock.advance(31 * SECOND);
    await expect(refresh(refreshToken, csrfToken)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    expect(sessions.count()).toBe(0);
    await expect(refresh(first.refreshToken, csrfToken)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('un token de dos generaciones atrás → INVALID_REFRESH_TOKEN y cierra la sesión, aun dentro de 30 s (RF-13)', async () => {
    const { refreshToken, csrfToken } = await openSession();
    const first = await refresh(refreshToken, csrfToken);
    clock.advance(SECOND);
    await refresh(first.refreshToken, csrfToken);
    await expect(refresh(refreshToken, csrfToken)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    expect(sessions.count()).toBe(0);
  });

  it('si la copia cifrada ya no se puede abrir (clave cambiada), se trata como reutilización (R-4)', async () => {
    const { refreshToken, csrfToken } = await openSession();
    await refresh(refreshToken, csrfToken);
    const otherKey = new RefreshSessionUseCase(
      sessions,
      tokens,
      new AesGcmGraceCipher(randomKey()),
      new VerifySessionCsrfUseCase(tokens),
      clock,
    );
    await expect(otherKey.execute({ refreshToken, csrfToken })).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    expect(sessions.count()).toBe(0);
  });

  it.each([
    ['sin refresh token', undefined],
    ['con uno inexistente', 'inventado'],
  ])('%s → INVALID_REFRESH_TOKEN (RF-14)', async (_case, refreshToken) => {
    await openSession();
    await expect(refresh(refreshToken, 'cualquiera')).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    expect(sessions.count()).toBe(1);
  });

  it('con el token CSRF de otra sesión → INVALID_CSRF_TOKEN sin rotar ni cerrar nada (RF-23)', async () => {
    const mine = await openSession();
    const other = await openSession();
    await expect(refresh(mine.refreshToken, other.csrfToken)).rejects.toMatchObject({ code: 'INVALID_CSRF_TOKEN' });
    expect((await refresh(mine.refreshToken, mine.csrfToken)).accessToken).toBeDefined();
  });

  it('cerrar una sesión por reutilización no toca las demás de la cuenta (RF-13)', async () => {
    const mine = await openSession();
    const other = await openSession();
    await refresh(mine.refreshToken, mine.csrfToken);
    clock.advance(31 * SECOND);
    await expect(refresh(mine.refreshToken, mine.csrfToken)).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    expect(sessions.sessionIdsOf(USER_ID)).toEqual([other.session.id]);
  });
});
