import type { UserTimeZoneRepository } from '../domain/user-time-zone.repository.js';

// Recuerda la última zona válida del usuario; se llama en cuanto sus cabeceras son válidas (RF-34, D-1)
export class RecordUserTimeZoneUseCase {
  constructor(private readonly zones: UserTimeZoneRepository) {}

  execute(userId: string, timeZone: string): Promise<void> {
    return this.zones.record(userId, timeZone);
  }
}
