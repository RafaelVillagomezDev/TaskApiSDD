import type { LocalDate } from '../domain/local-date.value-object.js';

// Contexto de una petición aceptada que reciben los casos de uso
export interface RequestContext {
  userId: string;
  // Día actual del usuario según X-Client-Time (RF-23)
  today: LocalDate;
  timeZone: string;
}
