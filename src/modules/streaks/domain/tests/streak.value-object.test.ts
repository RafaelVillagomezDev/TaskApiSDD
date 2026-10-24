import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { Streak } from '../streak.value-object.js';

const days = (...values: string[]) => values.map((value) => LocalDate.parse(value));
const today = (value: string) => LocalDate.parse(value);

describe('Streak.calculate', () => {
  it('sin días productivos: racha actual 0 y mejor racha 0', () => {
    expect(Streak.calculate([], today('2026-10-24'))).toEqual(new Streak(0, 0));
  });

  it('RF-19: hoy productivo cuenta los días consecutivos que terminan hoy', () => {
    // Ejemplo de la spec: 21, 22 y 23 productivos; 20 no → racha actual 3
    const streak = Streak.calculate(days('2026-10-21', '2026-10-22', '2026-10-23'), today('2026-10-23'));
    expect(streak.current).toBe(3);
  });

  it('HU-03: productivo cada día del 20 al 23 con hoy el 23 → racha actual 4', () => {
    const streak = Streak.calculate(
      days('2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'),
      today('2026-10-23'),
    );
    expect(streak.current).toBe(4);
  });

  describe('RF-20: hoy todavía no es productivo', () => {
    it('la racha se cuenta hasta ayer', () => {
      // Ejemplo de la spec: hoy 24 sin completar, 23 productivo, 22 no → racha actual 1
      expect(Streak.calculate(days('2026-10-23'), today('2026-10-24')).current).toBe(1);
    });

    it('al completar una tarea de hoy la racha sube a 2', () => {
      expect(Streak.calculate(days('2026-10-23', '2026-10-24'), today('2026-10-24')).current).toBe(2);
    });

    it('si el 24 termina sin completar nada, el 25 la racha actual es 0', () => {
      expect(Streak.calculate(days('2026-10-23'), today('2026-10-25')).current).toBe(0);
    });
  });

  it('RF-21: la mejor racha es el tramo más largo del historial', () => {
    // Ejemplo de la spec: 1–5 de octubre (5 días) y 10–12 de octubre (3 días) → mejor racha 5
    const productive = days(
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
    );
    expect(Streak.calculate(productive, today('2026-10-12'))).toEqual(new Streak(3, 5));
  });

  it('RF-21: la mejor racha incluye la racha actual', () => {
    const productive = days('2026-10-01', '2026-10-02', '2026-10-20', '2026-10-21', '2026-10-22');
    expect(Streak.calculate(productive, today('2026-10-22'))).toEqual(new Streak(3, 3));
  });

  it('RF-18: un día sin tareas completadas rompe la racha', () => {
    const productive = days('2026-10-20', '2026-10-21', '2026-10-23', '2026-10-24');
    expect(Streak.calculate(productive, today('2026-10-24'))).toEqual(new Streak(2, 2));
  });

  it('cruza el cambio de año: 2026-12-31 y 2027-01-01 son consecutivos', () => {
    expect(Streak.calculate(days('2026-12-31', '2027-01-01'), today('2027-01-01'))).toEqual(new Streak(2, 2));
  });

  it('el 29 de febrero es un día más de la secuencia en años bisiestos', () => {
    const productive = days('2028-02-28', '2028-02-29', '2028-03-01');
    expect(Streak.calculate(productive, today('2028-03-01')).current).toBe(3);
  });
});
