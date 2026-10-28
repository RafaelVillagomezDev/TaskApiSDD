import {
  ACCESS_TOKEN_TTL_MS,
  REFRESH_GRACE_MS,
  REFRESH_TOKEN_TTL_MS,
  Session,
  SESSION_MAX_AGE_MS,
  type SessionProps,
} from '../session.entity.js';

const at = (iso: string) => new Date(iso);
const LOGIN = at('2026-10-01T10:00:00Z');

const openedAt = (now: Date): Session =>
  Session.restore({
    id: 'session-1',
    userId: 'user-1',
    generation: 0,
    ...Session.schedule(now),
    rotatedAt: null,
    createdAt: now,
  } satisfies SessionProps);

describe('Session', () => {
  it('fija las duraciones de la spec: 15 min, 7 días, 30 días y 30 s (RF-07, RF-11, RF-13)', () => {
    expect(ACCESS_TOKEN_TTL_MS).toBe(15 * 60_000);
    expect(REFRESH_TOKEN_TTL_MS).toBe(7 * 24 * 3_600_000);
    expect(SESSION_MAX_AGE_MS).toBe(30 * 24 * 3_600_000);
    expect(REFRESH_GRACE_MS).toBe(30_000);
  });

  it('al abrirse: acceso hasta +15 min, refresh hasta +7 días y tope a +30 días (RF-07)', () => {
    const times = Session.schedule(LOGIN);
    expect(times.accessExpiresAt.toISOString()).toBe('2026-10-01T10:15:00.000Z');
    expect(times.refreshExpiresAt.toISOString()).toBe('2026-10-08T10:00:00.000Z');
    expect(times.expiresAt.toISOString()).toBe('2026-10-31T10:00:00.000Z');
  });

  it('el token de acceso caduca a los 15 minutos exactos (RF-20)', () => {
    const session = openedAt(LOGIN);
    expect(session.isAccessExpired(at('2026-10-01T10:14:59Z'))).toBe(false);
    expect(session.isAccessExpired(at('2026-10-01T10:15:00Z'))).toBe(true);
  });

  it('ejemplo de RF-11: renovar los días 3, 9, 15… alarga la sesión, pero el día 31 ya no se puede (RF-11, RF-12)', () => {
    const session = openedAt(LOGIN);
    for (const day of ['03', '09', '15', '21', '27']) {
      const now = at(`2026-10-${day}T10:00:00Z`);
      expect(session.isRefreshUsable(now)).toBe(true);
      session.rotate(now);
    }
    // Rotado el 27: el refresh vence el 3 de noviembre, pero el tope del día 31 manda
    expect(session.refreshExpiresAt.toISOString()).toBe('2026-10-31T10:00:00.000Z');
    expect(session.isRefreshUsable(at('2026-10-31T09:59:59Z'))).toBe(true);
    expect(session.isRefreshUsable(at('2026-10-31T10:00:00Z'))).toBe(false);
  });

  it('7 días sin renovar → el refresh ya no se puede usar (RF-12)', () => {
    const session = openedAt(LOGIN);
    session.rotate(at('2026-10-03T10:00:00Z'));
    expect(session.isRefreshUsable(at('2026-10-10T09:59:59Z'))).toBe(true);
    expect(session.isRefreshUsable(at('2026-10-10T10:00:00Z'))).toBe(false);
  });

  it('rotar sube la generación y renueva el acceso 15 min desde ese momento (RF-11)', () => {
    const session = openedAt(LOGIN);
    session.rotate(at('2026-10-01T10:20:00Z'));
    expect(session.generation).toBe(1);
    expect(session.accessExpiresAt.toISOString()).toBe('2026-10-01T10:35:00.000Z');
    expect(session.rotatedAt?.toISOString()).toBe('2026-10-01T10:20:00.000Z');
  });

  it('margen de gracia: dentro de los 30 s tras la rotación sí, a los 31 s no (RF-13)', () => {
    const session = openedAt(LOGIN);
    expect(session.isWithinGrace(at('2026-10-01T10:00:05Z'))).toBe(false);
    session.rotate(at('2026-10-01T10:45:00Z'));
    expect(session.isWithinGrace(at('2026-10-01T10:45:10Z'))).toBe(true);
    expect(session.isWithinGrace(at('2026-10-01T10:45:30Z'))).toBe(true);
    expect(session.isWithinGrace(at('2026-10-01T10:45:31Z'))).toBe(false);
  });
});
