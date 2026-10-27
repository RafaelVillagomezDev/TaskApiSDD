import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { AlertWindow } from '../alert-window.value-object.js';

const day = (value: string) => LocalDate.parse(value);
// Hora local: día y HH:MM
const at = (date: string, time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return { date: day(date), minutesOfDay: hours! * 60 + minutes! };
};
const describeWindow = (window: AlertWindow) => ({
  type: window.type,
  periodStart: window.periodStart.toString(),
  periodEnd: window.periodEnd.toString(),
  triggerDay: window.triggerDay.toString(),
  windowEnd: window.windowEnd.toString(),
});
const dueTypes = (date: string, time: string) => AlertWindow.dueAt(at(date, time)).map((window) => window.type);

describe('AlertWindow', () => {
  describe('periodos y días de disparo', () => {
    it('diario: el propio día (RF-24)', () => {
      expect(describeWindow(AlertWindow.of('daily', day('2026-10-24')))).toEqual({
        type: 'daily',
        periodStart: '2026-10-24',
        periodEnd: '2026-10-24',
        triggerDay: '2026-10-24',
        windowEnd: '2026-10-24',
      });
    });

    it.each(['2026-10-19', '2026-10-23', '2026-10-25'])('semanal: de lunes a domingo con disparo el viernes, desde %s (RF-25)', (date) => {
      expect(describeWindow(AlertWindow.of('weekly', day(date)))).toEqual({
        type: 'weekly',
        periodStart: '2026-10-19',
        periodEnd: '2026-10-25',
        triggerDay: '2026-10-23',
        windowEnd: '2026-10-25',
      });
    });

    it('mensual: disparo el primero de los 3 últimos días, 2026-10-29 (RF-26)', () => {
      expect(describeWindow(AlertWindow.of('monthly', day('2026-10-05')))).toEqual({
        type: 'monthly',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        triggerDay: '2026-10-29',
        windowEnd: '2026-10-31',
      });
    });

    it('mensual: en febrero de 2027 se dispara el 26 (RF-26)', () => {
      expect(describeWindow(AlertWindow.of('monthly', day('2027-02-10')))).toMatchObject({
        periodStart: '2027-02-01',
        periodEnd: '2027-02-28',
        triggerDay: '2027-02-26',
      });
    });
  });

  describe('vencimiento', () => {
    it('un miércoles: nada antes de las 22:00 y solo el diario desde las 22:00 (RF-24)', () => {
      expect(dueTypes('2026-10-21', '21:59')).toEqual([]);
      expect(dueTypes('2026-10-21', '22:00')).toEqual(['daily']);
      expect(dueTypes('2026-10-21', '23:59')).toEqual(['daily']);
    });

    it('el viernes 2026-10-23: diario y semanal a las 22:00 (RF-25)', () => {
      expect(dueTypes('2026-10-23', '21:59')).toEqual([]);
      expect(dueTypes('2026-10-23', '22:00')).toEqual(['daily', 'weekly']);
    });

    it('el 2026-10-29: diario y mensual a las 22:00 (RF-26)', () => {
      expect(dueTypes('2026-10-29', '22:00')).toEqual(['daily', 'monthly']);
    });

    it('el 2027-02-26 (viernes): los tres avisos a las 22:00 (RF-24 a RF-26)', () => {
      expect(dueTypes('2027-02-26', '21:59')).toEqual([]);
      expect(dueTypes('2027-02-26', '22:00')).toEqual(['daily', 'weekly', 'monthly']);
    });

    it('recuperación: el semanal sigue vencido el sábado y el domingo antes de las 22:00 (RF-47)', () => {
      expect(dueTypes('2026-10-24', '00:00')).toEqual(['weekly']);
      expect(dueTypes('2026-10-25', '08:00')).toEqual(['weekly']);
    });

    it('recuperación: el mensual sigue vencido hasta el fin de mes (RF-47)', () => {
      expect(dueTypes('2026-10-30', '08:00')).toEqual(['monthly']);
      // El 31 es sábado: sigue abierta también la ventana semanal
      expect(dueTypes('2026-10-31', '08:00')).toEqual(['weekly', 'monthly']);
      // El 1 de noviembre es domingo: solo sigue abierta la semanal; el lunes 2 ya no queda ninguna
      expect(dueTypes('2026-11-01', '08:00')).toEqual(['weekly']);
      expect(dueTypes('2026-11-02', '08:00')).toEqual([]);
    });

    it('un lunes por la mañana ya no hay ninguna ventana abierta', () => {
      expect(dueTypes('2026-10-26', '08:00')).toEqual([]);
    });
  });

  describe('rango de tareas', () => {
    const range = (window: AlertWindow, today: string) => {
      const { from, to } = window.taskRange(day(today));
      return [from.toString(), to.toString()];
    };

    it('en el momento de disparo: del día de disparo al fin de la ventana (RF-24 a RF-26)', () => {
      expect(range(AlertWindow.of('daily', day('2026-10-24')), '2026-10-24')).toEqual(['2026-10-24', '2026-10-24']);
      expect(range(AlertWindow.of('weekly', day('2026-10-23')), '2026-10-23')).toEqual(['2026-10-23', '2026-10-25']);
      expect(range(AlertWindow.of('monthly', day('2026-10-29')), '2026-10-29')).toEqual(['2026-10-29', '2026-10-31']);
    });

    it('en una recuperación tardía excluye los días ya cerrados (RF-47)', () => {
      expect(range(AlertWindow.of('weekly', day('2026-10-24')), '2026-10-24')).toEqual(['2026-10-24', '2026-10-25']);
      expect(range(AlertWindow.of('monthly', day('2026-10-31')), '2026-10-31')).toEqual(['2026-10-31', '2026-10-31']);
    });
  });
});
