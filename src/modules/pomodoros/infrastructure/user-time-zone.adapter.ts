import type { GetUserTimeZoneUseCase } from '../../alerts/alert.facade.js';
import type { UserTimeZoneSource } from '../domain/user-time-zone.port.js';

// Obtiene la zona recordada a través de la fachada pública de alerts, su dueño (principio V; plan, D-7)
export class UserTimeZoneAdapter implements UserTimeZoneSource {
  constructor(private readonly getUserTimeZone: GetUserTimeZoneUseCase) {}

  find(userId: string): Promise<string | null> {
    return this.getUserTimeZone.execute(userId);
  }
}
