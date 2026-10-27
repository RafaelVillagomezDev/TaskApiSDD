import type {
  UserTimeZone,
  UserTimeZoneRepository,
} from '../../src/modules/alerts/domain/user-time-zone.repository.js';

// Implementación en memoria de UserTimeZoneRepository (plan, D-21)
export class InMemoryUserTimeZoneRepository implements UserTimeZoneRepository {
  private readonly zones = new Map<string, string>();
  // Ayuda para los tests: escrituras reales, que solo ocurren si la zona cambia
  writes = 0;

  async record(userId: string, timeZone: string): Promise<void> {
    if (this.zones.get(userId) === timeZone) return;
    this.zones.set(userId, timeZone);
    this.writes++;
  }

  async listBatch(afterUserId: string | null, size: number): Promise<UserTimeZone[]> {
    return [...this.zones.entries()]
      .map(([userId, timeZone]) => ({ userId, timeZone }))
      .filter((zone) => afterUserId === null || zone.userId > afterUserId)
      .sort((a, b) => (a.userId < b.userId ? -1 : 1))
      .slice(0, size);
  }

  // Ayuda para los tests: zona recordada de un usuario
  find(userId: string): string | undefined {
    return this.zones.get(userId);
  }
}
