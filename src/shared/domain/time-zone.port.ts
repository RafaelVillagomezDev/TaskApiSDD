import type { LocalDate } from './local-date.value-object.js';

// Fecha y minuto del día en una zona horaria concreta
export interface LocalDateTime {
  date: LocalDate;
  minutesOfDay: number;
}

// Puerto de zonas horarias IANA (RF-32, RF-33, RF-35)
export interface TimeZoneService {
  isValid(zone: string): boolean;
  // Desfase respecto a UTC, en minutos, de la zona en ese instante (incluye horario de verano)
  offsetMinutesAt(zone: string, instant: Date): number;
  localDateTimeAt(zone: string, instant: Date): LocalDateTime;
}
