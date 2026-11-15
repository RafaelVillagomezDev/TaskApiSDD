import type { UserTimeZoneRepository } from '../domain/user-time-zone.repository.js';

// Zona recordada de un usuario, o null si aún no tiene ninguna. La usa el módulo pomodoros, a través de la
// fachada de alerts, para el día local en que termina una sesión (RF-40 de la 004, D-7 del plan de la 004)
export class GetUserTimeZoneUseCase {
  constructor(private readonly zones: UserTimeZoneRepository) {}

  execute(userId: string): Promise<string | null> {
    return this.zones.findTimeZone(userId);
  }
}
