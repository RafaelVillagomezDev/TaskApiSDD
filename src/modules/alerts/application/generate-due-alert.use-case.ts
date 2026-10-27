import type { Clock } from '../../../shared/domain/clock.port.js';
import type { TimeZoneService } from '../../../shared/domain/time-zone.port.js';
import type { AlertRepository } from '../domain/alert.repository.js';
import { AlertWindow } from '../domain/alert-window.value-object.js';
import type { PendingTaskSource } from '../domain/pending-task.port.js';
import type { UserTimeZoneRepository } from '../domain/user-time-zone.repository.js';

export interface AlertPassResult {
  // Usuarios con zona recordada que se han revisado
  users: number;
  // Avisos registrados en esta pasada
  created: number;
}

// Una pasada del planificador: para cada usuario con zona, registra los avisos de los periodos
// vencidos en su hora local (RF-24 a RF-28, RF-35, RF-36, RF-47; plan, 5.5)
export class GenerateDueAlertUseCase {
  constructor(
    private readonly clock: Clock,
    private readonly timeZones: TimeZoneService,
    private readonly zones: UserTimeZoneRepository,
    private readonly alerts: AlertRepository,
    private readonly pendingTasks: PendingTaskSource,
    private readonly batchSize = 500,
  ) {}

  async execute(): Promise<AlertPassResult> {
    const now = this.clock.now();
    const result: AlertPassResult = { users: 0, created: 0 };
    let afterUserId: string | null = null;

    // Sin zona recordada no hay avisos: solo se recorren los usuarios de la tabla de zonas (RF-36)
    for (;;) {
      const batch = await this.zones.listBatch(afterUserId, this.batchSize);
      for (const { userId, timeZone } of batch) {
        result.users++;
        // Hora local con la última zona recordada, incluido el horario de verano (RF-35)
        const local = this.timeZones.localDateTimeAt(timeZone, now);
        for (const window of AlertWindow.dueAt(local)) {
          const { from, to } = window.taskRange(local.date);
          const alert = await this.alerts.claimPeriod(
            { userId, type: window.type, periodStart: window.periodStart, periodEnd: window.periodEnd },
            () => this.pendingTasks.find(userId, from, to),
          );
          if (alert) result.created++;
        }
      }
      if (batch.length < this.batchSize) break;
      afterUserId = batch[batch.length - 1].userId;
    }

    return result;
  }
}
