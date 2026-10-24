import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';

// Racha actual y mejor racha de días productivos consecutivos (RF-17 a RF-21)
export class Streak {
  constructor(
    readonly current: number,
    readonly best: number,
  ) {}

  // `productiveDates`: días distintos con al menos una tarea completada, en orden ascendente y
  // sin días posteriores a `today`. Cálculo O(n) sin guardar nada (plan, D-5)
  static calculate(productiveDates: readonly LocalDate[], today: LocalDate): Streak {
    let best = 0;
    let run = 0;
    let previous: LocalDate | undefined;

    for (const date of productiveDates) {
      run = previous && date.daysSince(previous) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      previous = date;
    }

    // El tramo final cuenta si termina hoy (RF-19) o ayer, porque hoy aún puede completarse (RF-20)
    const lastGap = previous ? today.daysSince(previous) : Number.POSITIVE_INFINITY;
    const current = lastGap === 0 || lastGap === 1 ? run : 0;

    return new Streak(current, best);
  }
}
