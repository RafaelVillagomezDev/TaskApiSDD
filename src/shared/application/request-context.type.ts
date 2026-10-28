import type { LocalDate } from '../domain/local-date.value-object.js';

// Usuario y sesión de una petición con sesión válida (RF-17 de la 002); lo reciben las rutas sin día, como /me
export interface SessionContext {
  userId: string;
  sessionId: string;
}

// Contexto de una petición aceptada que reciben los casos de uso que dependen del día: el usuario y la sesión
// salen siempre de la sesión (RF-17 y RF-32 de la 002)
export interface RequestContext extends SessionContext {
  // Día actual del usuario según X-Client-Time (RF-23 de la 001)
  today: LocalDate;
  timeZone: string;
}
