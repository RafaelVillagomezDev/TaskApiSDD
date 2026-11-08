import type { Clock } from '../../../shared/domain/clock.port.js';
import type { TimeZoneService } from '../../../shared/domain/time-zone.port.js';
import type { PomodoroRepository } from '../domain/pomodoro.repository.js';
import type { UserTimeZoneSource } from '../domain/user-time-zone.port.js';
import { moveUnfinishedToWaiting } from './close-pomodoro.helper.js';

// Sesiones vencidas que asienta el barrido en cada consulta (plan, 5.3)
export const SETTLE_BATCH_SIZE = 100;
// Empezar una sesión pasa siempre por el middleware que recuerda la zona (RF-03), así que un usuario con
// sesiones tiene zona; si aun así faltara, el día del fin se calcula en UTC en lugar de dejar la sesión sin asentar
const FALLBACK_TIME_ZONE = 'UTC';

// Asienta las sesiones en curso cuyo fin previsto ya llegó: terminan por tiempo en ese instante, guardan la
// foto de sus tareas y el día local del fin, y sus tareas pendientes pasan a espera (RF-15, RF-16, RF-23,
// RF-33, RF-35, RF-40). Se llama al principio de cada petición del pomodoro y desde el barrido (plan, D-2)
export class SettleDuePomodoroUseCase {
  constructor(
    private readonly pomodoros: PomodoroRepository,
    private readonly zones: UserTimeZoneSource,
    private readonly timeZones: TimeZoneService,
    private readonly clock: Clock,
    private readonly batchSize = SETTLE_BATCH_SIZE,
  ) {}

  // La sesión vencida del usuario de la petición, si la tiene
  async forUser(userId: string): Promise<void> {
    const now = this.clock.now();
    const pomodoroId = await this.pomodoros.findDueId(userId, now);
    if (pomodoroId) {
      await this.settle(userId, pomodoroId, now);
    }
  }

  // Todas las vencidas, por lotes; devuelve cuántas ha asentado
  async dueBatch(): Promise<number> {
    const now = this.clock.now();
    let settled = 0;
    let batch = await this.pomodoros.findDue(now, this.batchSize);
    while (batch.length > 0) {
      let settledInBatch = 0;
      for (const due of batch) {
        if (await this.settle(due.userId, due.id, now)) settledInBatch++;
      }
      settled += settledInBatch;
      // Un lote incompleto era el último, y uno sin avances se repetiría para siempre
      const more = batch.length === this.batchSize && settledInBatch > 0;
      batch = more ? await this.pomodoros.findDue(now, this.batchSize) : [];
    }
    return settled;
  }

  // Con la sesión bloqueada se comprueba de nuevo que sigue vencida: el barrido y una petición pueden
  // coincidir, y solo el primero la asienta (R-4, D-4)
  private settle(userId: string, pomodoroId: string, now: Date): Promise<boolean> {
    return this.pomodoros.transaction(async (unit) => {
      const pomodoro = await unit.lockPomodoro(userId, pomodoroId);
      const endsAt = pomodoro?.endsAt;
      if (!pomodoro?.isDue(now) || !endsAt) return false;
      const tasks = await unit.tasksOf(pomodoroId);
      const zone = (await this.zones.find(userId)) ?? FALLBACK_TIME_ZONE;
      pomodoro.finishByTime(now, {
        finishedOn: this.timeZones.localDateTimeAt(zone, endsAt).date,
        snapshot: tasks.map((task) => task.toSnapshot()),
      });
      await moveUnfinishedToWaiting(unit, tasks);
      await unit.savePomodoro(pomodoro);
      return true;
    });
  }
}
