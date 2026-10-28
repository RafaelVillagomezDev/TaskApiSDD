import { FAILURE_WINDOW_MS, LOCK_DURATION_MS, LoginThrottle, MAX_FAILED_ATTEMPTS } from '../login-throttle.value-object.js';

const at = (time: string) => new Date(`2026-10-28T${time}Z`);

// Registra los fallos en orden y devuelve el estado final
const failures = (...times: string[]) =>
  times.reduce((throttle, time) => throttle.registerFailure(at(time)), LoginThrottle.empty());

describe('LoginThrottle', () => {
  it('fija las reglas de RF-09: 5 fallos en 15 minutos bloquean 15 minutos', () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(5);
    expect(FAILURE_WINDOW_MS).toBe(15 * 60_000);
    expect(LOCK_DURATION_MS).toBe(15 * 60_000);
  });

  it('sin fallos no está bloqueado', () => {
    expect(LoginThrottle.empty().isLocked(at('10:00:00'))).toBe(false);
  });

  it('ejemplo de RF-09: fallos a las 10:00, 10:02, 10:05, 10:08 y 10:10 → bloqueado hasta las 10:25', () => {
    const fourFailures = failures('10:00:00', '10:02:00', '10:05:00', '10:08:00');
    expect(fourFailures.isLocked(at('10:08:01'))).toBe(false);

    const locked = fourFailures.registerFailure(at('10:10:00'));
    expect(locked.isLocked(at('10:10:00'))).toBe(true);
    expect(locked.isLocked(at('10:24:59'))).toBe(true);
    expect(locked.isLocked(at('10:25:00'))).toBe(false);
    expect(locked.lockedUntil?.toISOString()).toBe('2026-10-28T10:25:00.000Z');
  });

  it('ventana deslizante: los fallos de hace 15 minutos o más no cuentan (D-10)', () => {
    // A las 10:16 el fallo de las 10:00 ya no cuenta: solo hay 4 en la ventana
    const throttle = failures('10:00:00', '10:05:00', '10:10:00', '10:14:00', '10:16:00');
    expect(throttle.isLocked(at('10:16:00'))).toBe(false);
    // El siguiente completa 5 dentro de la ventana (10:05 a 10:17)
    expect(throttle.registerFailure(at('10:17:00')).isLocked(at('10:17:00'))).toBe(true);
  });

  it('tras un bloqueo vencido se empieza de cero', () => {
    const locked = failures('10:00:00', '10:01:00', '10:02:00', '10:03:00', '10:04:00');
    const afterLock = locked.registerFailure(at('10:20:00'));
    expect(afterLock.isLocked(at('10:20:00'))).toBe(false);
    expect(afterLock.failedAt).toHaveLength(1);
  });

  it('no guarda más de 5 fallos', () => {
    expect(failures('10:00:00', '10:01:00', '10:02:00', '10:03:00').failedAt).toHaveLength(4);
  });

  it('sin bloqueo vigente ni fallos dentro de la ventana es prescindible (limpieza, D-12)', () => {
    const throttle = failures('10:00:00', '10:01:00');
    expect(throttle.isStale(at('10:10:00'))).toBe(false);
    expect(throttle.isStale(at('10:16:00'))).toBe(true);
    const locked = failures('10:00:00', '10:01:00', '10:02:00', '10:03:00', '10:04:00');
    expect(locked.isStale(at('10:18:00'))).toBe(false);
    expect(locked.isStale(at('10:19:00'))).toBe(true);
  });
});
