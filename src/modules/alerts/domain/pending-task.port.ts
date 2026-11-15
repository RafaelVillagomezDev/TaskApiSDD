import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import type { AlertTask } from './alert.entity.js';

// Tareas pendientes de un usuario entre dos días, ambos incluidos, en orden de fecha y creación
export interface PendingTaskSource {
  find(userId: string, from: LocalDate, to: LocalDate): Promise<AlertTask[]>;
}
