import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';

// Días distintos con al menos una tarea completada, hasta `until` incluido, en orden ascendente
export interface ProductiveDateSource {
  findUntil(userId: string, until: LocalDate): Promise<LocalDate[]>;
}
