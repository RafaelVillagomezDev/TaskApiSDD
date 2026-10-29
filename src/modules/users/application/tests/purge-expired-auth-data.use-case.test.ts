import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { InMemoryCsrfTokenRepository } from '../../../../../tests/support/in-memory-csrf-token.repository.js';
import { InMemoryLoginAttemptRepository } from '../../../../../tests/support/in-memory-login-attempt.repository.js';
import { InMemorySessionRepository } from '../../../../../tests/support/in-memory-session.repository.js';
import { LoginThrottle } from '../../domain/login-throttle.value-object.js';
import { Session } from '../../domain/session.entity.js';
import { PurgeExpiredAuthDataUseCase } from '../purge-expired-auth-data.use-case.js';

const USER_ID = '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b';
const MINUTE = 60_000;
const DAY = 24 * 3_600_000;

describe('PurgeExpiredAuthDataUseCase', () => {
  let clock: FakeClock;
  let sessions: InMemorySessionRepository;
  let csrfTokens: InMemoryCsrfTokenRepository;
  let loginAttempts: InMemoryLoginAttemptRepository;
  let useCase: PurgeExpiredAuthDataUseCase;

  // Sesión abierta en `openedAt`, con huellas que identifican a cada una
  const openSession = (name: string, openedAt: Date) =>
    sessions.create({
      userId: USER_ID,
      accessTokenHash: `acceso-${name}`,
      refreshTokenHash: `refresh-${name}`,
      csrfTokenHash: `csrf-${name}`,
      csrfTokenSealed: 'v1.copia-csrf',
      schedule: Session.schedule(openedAt),
      now: openedAt,
    });

  // Rota la sesión del refresh token en `now` dejando una copia cifrada
  const rotate = (name: string, now: Date) =>
    sessions.withRefreshTokenLocked(`refresh-${name}`, async (record, unit) => {
      if (!record) throw new Error(`Sesión ${name} inexistente`);
      record.session.rotate(now);
      await unit.rotate(
        record,
        { accessTokenHash: `acceso-${name}-2`, refreshTokenHash: `refresh-${name}-2`, graceTokens: `copia-${name}` },
        now,
      );
    });

  beforeEach(() => {
    clock = new FakeClock('2026-10-28T10:00:00Z');
    sessions = new InMemorySessionRepository();
    csrfTokens = new InMemoryCsrfTokenRepository();
    loginAttempts = new InMemoryLoginAttemptRepository();
    useCase = new PurgeExpiredAuthDataUseCase(sessions, csrfTokens, loginAttempts, clock);
  });

  it('borra las sesiones de 7 días sin renovar y deja las vigentes con sus refresh tokens (D-12)', async () => {
    await openSession('vieja', new Date(clock.now().getTime() - 7 * DAY));
    await openSession('nueva', clock.now());
    await useCase.execute();
    expect(await sessions.findByAccessTokenHash('acceso-vieja')).toBeNull();
    expect(await sessions.findByRefreshTokenHash('refresh-vieja')).toBeNull();
    expect(await sessions.findByAccessTokenHash('acceso-nueva')).not.toBeNull();
  });

  it('borra solo las copias cifradas de más de 30 s, sin cerrar la sesión (D-12, R-13)', async () => {
    await openSession('antigua', clock.now());
    await openSession('reciente', clock.now());
    await rotate('antigua', new Date(clock.now().getTime() - 31_000));
    await rotate('reciente', new Date(clock.now().getTime() - 30_000));
    await useCase.execute();
    expect((await sessions.findByAccessTokenHash('acceso-antigua-2'))?.graceTokens).toBeNull();
    expect((await sessions.findByAccessTokenHash('acceso-reciente-2'))?.graceTokens).toBe('copia-reciente');
  });

  it('borra los tokens CSRF previos caducados y deja los vigentes (RF-22, D-12)', async () => {
    await csrfTokens.save('caducado', clock.now());
    await csrfTokens.save('vigente', new Date(clock.now().getTime() + MINUTE));
    await useCase.execute();
    expect(csrfTokens.hashes()).toEqual(['vigente']);
  });

  it('borra los bloqueos vencidos sin fallos recientes y deja los vigentes (RF-09, D-12)', async () => {
    await loginAttempts.save('vencido@example.com', LoginThrottle.restore([], new Date(clock.now().getTime() - MINUTE)));
    await loginAttempts.save('bloqueado@example.com', LoginThrottle.restore([], new Date(clock.now().getTime() + MINUTE)));
    await loginAttempts.save('reciente@example.com', LoginThrottle.restore([new Date(clock.now().getTime() - MINUTE)], null));
    await useCase.execute();
    expect(loginAttempts.has('vencido@example.com')).toBe(false);
    expect(loginAttempts.has('bloqueado@example.com')).toBe(true);
    expect(loginAttempts.has('reciente@example.com')).toBe(true);
  });
});
