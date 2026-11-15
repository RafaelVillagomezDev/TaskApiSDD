import type { RequestContext } from '../../../shared/application/request-context.type.js';
import { Streak } from '../../../shared/domain/streak.value-object.js';
import type { PomodoroRepository } from '../domain/pomodoro.repository.js';
import type { SettleDuePomodoroUseCase } from './settle-due-pomodoro.use-case.js';

// Racha actual y mejor racha del pomodoro: días con al menos una sesión terminada por tiempo, con las mismas
// reglas que la racha de la 001 (RF-38 a RF-41; plan, D-6). No toca la racha de la 001 (RF-42)
export class GetPomodoroStreakUseCase {
  constructor(
    private readonly pomodoros: PomodoroRepository,
    private readonly settle: SettleDuePomodoroUseCase,
  ) {}

  async execute(context: RequestContext): Promise<Streak> {
    // Una sesión vencida ya terminó por tiempo y cuenta para su día (RF-15)
    await this.settle.forUser(context.userId);
    const dates = await this.pomodoros.findProductiveDates(context.userId, context.today);
    return Streak.calculate(dates, context.today);
  }
}
