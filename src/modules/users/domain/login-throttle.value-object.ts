// Reglas del bloqueo por fuerza bruta (RF-09)
export const MAX_FAILED_ATTEMPTS = 5;
export const FAILURE_WINDOW_MS = 15 * 60_000;
export const LOCK_DURATION_MS = 15 * 60_000;

// Fallos recientes y bloqueo de un email, con ventana deslizante exacta (plan de la 002, D-10). Inmutable
export class LoginThrottle {
  private constructor(
    // Instantes de los últimos fallos dentro de la ventana, como mucho MAX_FAILED_ATTEMPTS
    readonly failedAt: readonly Date[],
    readonly lockedUntil: Date | null,
  ) {}

  static empty(): LoginThrottle {
    return new LoginThrottle([], null);
  }

  static restore(failedAt: readonly Date[], lockedUntil: Date | null): LoginThrottle {
    return new LoginThrottle([...failedAt], lockedUntil);
  }

  isLocked(now: Date): boolean {
    return this.lockedUntil !== null && now.getTime() < this.lockedUntil.getTime();
  }

  // Añade un fallo; con el quinto dentro de la ventana bloquea 15 minutos y empieza de cero (RF-09)
  registerFailure(now: Date): LoginThrottle {
    const recent = [...this.failedAt.filter((failure) => this.isInWindow(failure, now)), now].slice(
      -MAX_FAILED_ATTEMPTS,
    );
    if (recent.length >= MAX_FAILED_ATTEMPTS) {
      return new LoginThrottle([], new Date(now.getTime() + LOCK_DURATION_MS));
    }
    return new LoginThrottle(recent, this.isLocked(now) ? this.lockedUntil : null);
  }

  // Sin bloqueo vigente ni fallos dentro de la ventana: la limpieza puede borrarlo (D-12)
  isStale(now: Date): boolean {
    return !this.isLocked(now) && this.failedAt.every((failure) => !this.isInWindow(failure, now));
  }

  private isInWindow(failure: Date, now: Date): boolean {
    return now.getTime() - failure.getTime() < FAILURE_WINDOW_MS;
  }
}
