import type { LoginAttemptRepository } from '../../src/modules/users/domain/login-attempt.repository.js';
import { LoginThrottle } from '../../src/modules/users/domain/login-throttle.value-object.js';

// Implementación en memoria de LoginAttemptRepository (plan de la 001, D-21)
export class InMemoryLoginAttemptRepository implements LoginAttemptRepository {
  private readonly throttles = new Map<string, LoginThrottle>();

  async find(email: string): Promise<LoginThrottle> {
    return this.throttles.get(email) ?? LoginThrottle.empty();
  }

  async save(email: string, throttle: LoginThrottle): Promise<void> {
    this.throttles.set(email, throttle);
  }

  async clear(email: string): Promise<void> {
    this.throttles.delete(email);
  }

  async deleteStale(now: Date): Promise<void> {
    for (const [email, throttle] of this.throttles) {
      if (throttle.isStale(now)) this.throttles.delete(email);
    }
  }

  // Ayuda para los tests: ¿hay registro de ese email?
  has(email: string): boolean {
    return this.throttles.has(email);
  }
}
