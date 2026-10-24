import { LocalDate } from '../../domain/local-date.value-object.js';
import type { LocalDateTime, TimeZoneService } from '../../domain/time-zone.port.js';

// Nombre IANA: empieza por letra y se compone de segmentos separados por "/".
// Excluye los identificadores de desfase (p. ej. "+02:00") que Intl también admite (RF-32)
const IANA_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;
const LONG_OFFSET = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/;

// Zonas horarias con la API Intl del runtime, sin librerías de fechas (plan, D-4)
export class IntlTimeZoneAdapter implements TimeZoneService {
  private readonly offsetFormatters = new Map<string, Intl.DateTimeFormat>();
  private readonly partsFormatters = new Map<string, Intl.DateTimeFormat>();

  isValid(zone: string): boolean {
    if (!IANA_NAME.test(zone)) return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }

  offsetMinutesAt(zone: string, instant: Date): number {
    const formatter = this.cached(this.offsetFormatters, zone, () => ({
      timeZone: zone,
      timeZoneName: 'longOffset',
    }));
    const name = formatter.formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value ?? '';
    const match = LONG_OFFSET.exec(name);
    if (!match) throw new Error(`Desfase no reconocido para ${zone}: "${name}"`);
    if (!match[1]) return 0;
    const minutes = Number(match[2]) * 60 + Number(match[3]);
    return match[1] === '-' ? -minutes : minutes;
  }

  localDateTimeAt(zone: string, instant: Date): LocalDateTime {
    const formatter = this.cached(this.partsFormatters, zone, () => ({
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }));
    const parts = Object.fromEntries(
      formatter.formatToParts(instant).map((part) => [part.type, part.value]),
    ) as Record<string, string>;
    return {
      date: LocalDate.parse(`${parts.year}-${parts.month}-${parts.day}`),
      minutesOfDay: Number(parts.hour) * 60 + Number(parts.minute),
    };
  }

  // Crear un Intl.DateTimeFormat es caro: se reutiliza uno por zona
  private cached(
    cache: Map<string, Intl.DateTimeFormat>,
    zone: string,
    options: () => Intl.DateTimeFormatOptions,
  ): Intl.DateTimeFormat {
    let formatter = cache.get(zone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-US', options());
      cache.set(zone, formatter);
    }
    return formatter;
  }
}
