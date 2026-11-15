import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import type { LocalDateTime } from '../../../shared/domain/time-zone.port.js';
import { ALERT_TYPES, type AlertType } from './alert.entity.js';

// Momento de disparo: 22:00 hora local, 2 horas antes del fin del día (RF-24 a RF-26)
export const TRIGGER_MINUTES = 22 * 60;

export interface DayRange {
  from: LocalDate;
  to: LocalDate;
}

// Ventana de un aviso para el día local de un usuario (plan, 5.4). Lógica pura
export class AlertWindow {
  private constructor(
    readonly type: AlertType,
    readonly periodStart: LocalDate,
    readonly periodEnd: LocalDate,
    // Día en que se dispara a las 22:00
    readonly triggerDay: LocalDate,
    // Último día en que aún se puede registrar si se perdió el disparo (RF-47)
    readonly windowEnd: LocalDate,
  ) {}

  // Ventana del día, la semana (lunes a domingo) o el mes al que pertenece `day`
  static of(type: AlertType, day: LocalDate): AlertWindow {
    switch (type) {
      case 'daily':
        return new AlertWindow(type, day, day, day, day);
      case 'weekly': {
        const monday = day.startOfWeek();
        const sunday = monday.addDays(6);
        return new AlertWindow(type, monday, sunday, monday.addDays(4), sunday);
      }
      case 'monthly': {
        const last = day.endOfMonth();
        return new AlertWindow(type, day.startOfMonth(), last, last.addDays(-2), last);
      }
    }
  }

  // Ventanas que a esa hora local ya han llegado a su disparo y siguen abiertas
  static dueAt(local: LocalDateTime): AlertWindow[] {
    return ALERT_TYPES.map((type) => AlertWindow.of(type, local.date)).filter((window) => window.isDueAt(local));
  }

  // Vencido el día de disparo desde las 22:00, o cualquier día posterior hasta el fin de la ventana (RF-47)
  isDueAt({ date, minutesOfDay }: LocalDateTime): boolean {
    if (date.equals(this.triggerDay)) {
      return minutesOfDay >= TRIGGER_MINUTES;
    }
    return date.isAfter(this.triggerDay) && !date.isAfter(this.windowEnd);
  }

  // Días cuyas tareas entran en el aviso: [max(disparo, hoy), fin de ventana]; sin días ya cerrados (RF-47)
  taskRange(today: LocalDate): DayRange {
    return { from: today.isAfter(this.triggerDay) ? today : this.triggerDay, to: this.windowEnd };
  }
}
