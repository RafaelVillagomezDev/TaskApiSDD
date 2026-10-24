import { IntlTimeZoneAdapter } from '../intl-time-zone.adapter.js';

const timeZones = new IntlTimeZoneAdapter();

describe('IntlTimeZoneAdapter', () => {
  describe('isValid (RF-32)', () => {
    it.each(['Europe/Madrid', 'America/New_York', 'America/Argentina/Buenos_Aires', 'UTC', 'Etc/GMT+5'])(
      'acepta el nombre IANA %s',
      (zone) => {
        expect(timeZones.isValid(zone)).toBe(true);
      },
    );

    it.each(['+02:00', '-05:00', 'Mars/Olympus', '', 'Europe/Madrid ', 'europe madrid'])(
      'rechaza %p porque no es un nombre IANA válido',
      (zone) => {
        expect(timeZones.isValid(zone)).toBe(false);
      },
    );
  });

  describe('offsetMinutesAt (RF-33, RF-35)', () => {
    it('Europe/Madrid: +02:00 en verano y +01:00 tras el cambio del 2026-10-25 a las 03:00', () => {
      expect(timeZones.offsetMinutesAt('Europe/Madrid', new Date('2026-10-24T12:00:00Z'))).toBe(120);
      expect(timeZones.offsetMinutesAt('Europe/Madrid', new Date('2026-10-25T00:59:00Z'))).toBe(120);
      expect(timeZones.offsetMinutesAt('Europe/Madrid', new Date('2026-10-25T01:00:00Z'))).toBe(60);
      expect(timeZones.offsetMinutesAt('Europe/Madrid', new Date('2026-10-26T12:00:00Z'))).toBe(60);
    });

    it('America/New_York: -04:00 en verano y -05:00 tras el cambio del 2026-11-01', () => {
      expect(timeZones.offsetMinutesAt('America/New_York', new Date('2026-10-24T12:00:00Z'))).toBe(-240);
      expect(timeZones.offsetMinutesAt('America/New_York', new Date('2026-11-02T12:00:00Z'))).toBe(-300);
    });

    it('UTC tiene desfase 0', () => {
      expect(timeZones.offsetMinutesAt('UTC', new Date('2026-10-24T12:00:00Z'))).toBe(0);
    });
  });

  describe('localDateTimeAt (RF-35)', () => {
    it('devuelve el día local y los minutos del día en Madrid', () => {
      const local = timeZones.localDateTimeAt('Europe/Madrid', new Date('2026-10-24T21:30:00Z'));
      expect(local.date.toString()).toBe('2026-10-24');
      expect(local.minutesOfDay).toBe(23 * 60 + 30);
    });

    it('cambia de día a medianoche local aunque en UTC siga siendo el día anterior', () => {
      const local = timeZones.localDateTimeAt('Europe/Madrid', new Date('2026-10-24T22:10:00Z'));
      expect(local.date.toString()).toBe('2026-10-25');
      expect(local.minutesOfDay).toBe(10);
    });

    it('en Nueva York sigue siendo el día anterior', () => {
      const local = timeZones.localDateTimeAt('America/New_York', new Date('2026-10-25T03:00:00Z'));
      expect(local.date.toString()).toBe('2026-10-24');
      expect(local.minutesOfDay).toBe(23 * 60);
    });

    it('las 22:00 locales existen la noche del cambio de horario', () => {
      const local = timeZones.localDateTimeAt('Europe/Madrid', new Date('2026-10-25T21:00:00Z'));
      expect(local.date.toString()).toBe('2026-10-25');
      expect(local.minutesOfDay).toBe(22 * 60);
    });
  });
});
