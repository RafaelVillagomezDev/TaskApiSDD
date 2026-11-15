import type { Clock } from '../../domain/clock.port.js';

// Reloj real del sistema (el contenedor usa TZ=UTC)
export class SystemClockAdapter implements Clock {
  now(): Date {
    return new Date();
  }
}
