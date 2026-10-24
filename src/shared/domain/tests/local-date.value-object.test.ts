import { LocalDate } from '../local-date.value-object.js';

describe('LocalDate', () => {
  describe('parse', () => {
    it('acepta un día válido en formato AAAA-MM-DD', () => {
      expect(LocalDate.parse('2026-10-24').toString()).toBe('2026-10-24');
    });

    it.each(['2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', '2027-02-29'])(
      'rechaza el día inexistente %s',
      (value) => {
        expect(LocalDate.tryParse(value)).toBeNull();
        expect(() => LocalDate.parse(value)).toThrow();
      },
    );

    it.each(['2026-1-05', '26-10-24', '2026/10/24', '2026-10-24T10:00:00', '', 'hoy'])(
      'rechaza el formato %s',
      (value) => {
        expect(LocalDate.tryParse(value)).toBeNull();
      },
    );

    it('acepta el 29 de febrero de un año bisiesto', () => {
      expect(LocalDate.tryParse('2028-02-29')?.toString()).toBe('2028-02-29');
    });
  });

  describe('addDays', () => {
    it('suma días dentro del mes', () => {
      expect(LocalDate.parse('2026-10-24').addDays(1).toString()).toBe('2026-10-25');
    });

    it('cruza el cambio de mes y de año', () => {
      expect(LocalDate.parse('2026-12-31').addDays(1).toString()).toBe('2027-01-01');
      expect(LocalDate.parse('2027-01-01').addDays(-1).toString()).toBe('2026-12-31');
    });

    it('pasa por el 29 de febrero en años bisiestos', () => {
      expect(LocalDate.parse('2028-02-28').addDays(1).toString()).toBe('2028-02-29');
      expect(LocalDate.parse('2027-02-28').addDays(1).toString()).toBe('2027-03-01');
    });
  });

  describe('comparación', () => {
    const day = LocalDate.parse('2026-10-24');

    it('compara días anteriores, iguales y posteriores', () => {
      expect(day.isBefore(LocalDate.parse('2026-10-25'))).toBe(true);
      expect(day.isAfter(LocalDate.parse('2026-10-23'))).toBe(true);
      expect(day.equals(LocalDate.parse('2026-10-24'))).toBe(true);
      expect(day.compare(LocalDate.parse('2026-10-24'))).toBe(0);
    });

    it('calcula la diferencia en días', () => {
      expect(LocalDate.parse('2027-01-02').daysSince(LocalDate.parse('2026-12-30'))).toBe(3);
    });
  });

  describe('calendario', () => {
    it('devuelve el día de la semana ISO (1 = lunes, 7 = domingo)', () => {
      expect(LocalDate.parse('2026-10-19').dayOfWeek()).toBe(1);
      expect(LocalDate.parse('2026-10-23').dayOfWeek()).toBe(5);
      expect(LocalDate.parse('2026-10-25').dayOfWeek()).toBe(7);
    });

    it('devuelve el lunes de la semana', () => {
      expect(LocalDate.parse('2026-10-25').startOfWeek().toString()).toBe('2026-10-19');
      expect(LocalDate.parse('2026-10-19').startOfWeek().toString()).toBe('2026-10-19');
    });

    it('devuelve el primer y el último día del mes', () => {
      expect(LocalDate.parse('2026-10-24').startOfMonth().toString()).toBe('2026-10-01');
      expect(LocalDate.parse('2026-10-24').endOfMonth().toString()).toBe('2026-10-31');
      expect(LocalDate.parse('2027-02-10').endOfMonth().toString()).toBe('2027-02-28');
      expect(LocalDate.parse('2028-02-10').endOfMonth().toString()).toBe('2028-02-29');
    });
  });

  describe('conversión a Date en UTC', () => {
    it('ida y vuelta sin desplazamiento de día', () => {
      const day = LocalDate.parse('2026-10-24');
      expect(day.toUtcDate().toISOString()).toBe('2026-10-24T00:00:00.000Z');
      expect(LocalDate.fromUtcDate(day.toUtcDate()).equals(day)).toBe(true);
    });
  });
});
