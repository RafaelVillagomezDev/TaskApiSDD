import type { Clock } from '../../src/shared/domain/clock.port.js';

// Reloj controlable desde los tests: fijar y avanzar la hora (plan, D-21)
export class FakeClock implements Clock {
  private current: Date;

  constructor(initial: Date | string = '2026-10-24T10:00:00Z') {
    this.current = new Date(initial);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(instant: Date | string): void {
    this.current = new Date(instant);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
