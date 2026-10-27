import { randomUUID } from 'node:crypto';

import { Alert, type AlertPeriod, type AlertTask } from '../../src/modules/alerts/domain/alert.entity.js';
import type { AlertPageResult, AlertRepository } from '../../src/modules/alerts/domain/alert.repository.js';
import type { Clock } from '../../src/shared/domain/clock.port.js';
import type { Pagination } from '../../src/shared/domain/pagination.value-object.js';

// Implementación en memoria de AlertRepository, incluido claimPeriod (plan, D-21).
// createdAt sale del reloj indicado, como el instante real de registro
export class InMemoryAlertRepository implements AlertRepository {
  private readonly checkedPeriods = new Set<string>();
  private readonly alerts: Alert[] = [];

  constructor(private readonly clock: Clock) {}

  async claimPeriod(period: AlertPeriod, collect: () => Promise<AlertTask[]>): Promise<Alert | null> {
    const key = `${period.userId}|${period.type}|${period.periodStart.toString()}`;
    if (this.checkedPeriods.has(key)) return null;
    // Si collect falla, el periodo no queda marcado, como al deshacer la transacción
    const tasks = await collect();
    this.checkedPeriods.add(key);
    if (tasks.length === 0) return null;
    const alert = Alert.restore({ ...period, id: randomUUID(), tasks, createdAt: this.clock.now() });
    this.alerts.push(alert);
    return alert;
  }

  async findPage(userId: string, pagination: Pagination): Promise<AlertPageResult> {
    const matching = this.alerts
      .filter((alert) => alert.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
    return {
      items: matching.slice(pagination.offset, pagination.offset + pagination.pageSize),
      total: matching.length,
    };
  }

  // Ayuda para los tests: todos los avisos en orden de registro
  all(): Alert[] {
    return [...this.alerts];
  }
}
