import type { RequestContext } from '../../../shared/application/request-context.type.js';
import { AppError } from '../../../shared/domain/app.error.js';
import type { Clock } from '../../../shared/domain/clock.port.js';
import type { TimeZoneService } from '../../../shared/domain/time-zone.port.js';
import type { Pomodoro, PomodoroStatus } from '../domain/pomodoro.entity.js';
import type { PomodoroRepository, PomodoroUnitOfWork } from '../domain/pomodoro.repository.js';
import { moveUnfinishedToWaiting } from './close-pomodoro.helper.js';
import { buildPomodoroDetail, type PomodoroDetail } from './pomodoro-detail.helper.js';
import type { SettleDuePomodoroUseCase } from './settle-due-pomodoro.use-case.js';
import { UnlockPomodoroAchievementUseCase } from './unlock-pomodoro-achievement.use-case.js';

// Pausa, reanuda o termina a mano una sesión (RF-30 a RF-32, RF-50). La entidad rechaza con
// INVALID_POMODORO_STATE lo que el estado no permite, también pedir el estado que ya tiene (RF-34, RF-61)
export class ChangePomodoroStatusUseCase {
  constructor(
    private readonly pomodoros: PomodoroRepository,
    private readonly settle: SettleDuePomodoroUseCase,
    private readonly timeZones: TimeZoneService,
    private readonly clock: Clock,
    private readonly unlockAchievements = new UnlockPomodoroAchievementUseCase(),
  ) {}

  async execute(context: RequestContext, pomodoroId: string, status: PomodoroStatus): Promise<PomodoroDetail> {
    // Una sesión vencida ya terminó por tiempo: no se puede pausar ni terminar a mano (RF-15)
    await this.settle.forUser(context.userId);
    const now = this.clock.now();

    return this.pomodoros.transaction(async (unit) => {
      const pomodoro = await unit.lockPomodoro(context.userId, pomodoroId);
      if (!pomodoro) throw new AppError('POMODORO_NOT_FOUND');

      if (status === 'paused') pomodoro.pause(now);
      if (status === 'running') pomodoro.resume(now);
      if (status === 'finished') await this.finish(unit, pomodoro, context, now);
      await unit.savePomodoro(pomodoro);
      // Terminar a mano suma concentración: puede alcanzar FOCUS_10H (RF-44, RF-47)
      if (status === 'finished') await this.unlockAchievements.execute(unit, context.userId, now);

      const tasks = pomodoro.isActive() ? await unit.tasksOf(pomodoro.id) : [];
      return buildPomodoroDetail(pomodoro, tasks, now);
    });
  }

  // El día del fin es el local de la zona de la petición, que el middleware acaba de recordar (RF-40)
  private async finish(unit: PomodoroUnitOfWork, pomodoro: Pomodoro, context: RequestContext, now: Date): Promise<void> {
    const tasks = await unit.tasksOf(pomodoro.id);
    pomodoro.finishManually(now, {
      finishedOn: this.timeZones.localDateTimeAt(context.timeZone, now).date,
      snapshot: tasks.map((task) => task.toSnapshot()),
    });
    await moveUnfinishedToWaiting(unit, tasks);
  }
}
