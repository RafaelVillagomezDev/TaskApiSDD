import type { RequestContext } from '../../src/shared/application/request-context.type.js';
import { AppError } from '../../src/shared/domain/app.error.js';
import { LocalDate } from '../../src/shared/domain/local-date.value-object.js';
import { IntlTimeZoneAdapter } from '../../src/shared/infrastructure/time/intl-time-zone.adapter.js';
import { ChangePomodoroStatusUseCase } from '../../src/modules/pomodoros/application/change-pomodoro-status.use-case.js';
import { SettleDuePomodoroUseCase } from '../../src/modules/pomodoros/application/settle-due-pomodoro.use-case.js';
import { StartPomodoroUseCase } from '../../src/modules/pomodoros/application/start-pomodoro.use-case.js';
import { UpdatePomodoroTaskUseCase } from '../../src/modules/pomodoros/application/update-pomodoro-task.use-case.js';
import { FakeClock } from './fake-clock.adapter.js';
import { InMemoryPomodoroRepository } from './in-memory-pomodoro.repository.js';

export const MINUTE = 60_000;
export const day = (value: string) => LocalDate.parse(value);

// Usuario de los tests unitarios de casos de uso del pomodoro: hoy es 2026-11-08 en Madrid
export const pomodoroContext: RequestContext = {
  userId: 'user-1',
  sessionId: 'session-1',
  today: day('2026-11-08'),
  timeZone: 'Europe/Madrid',
};

export const newTask = (title: string, date = '2026-11-08') => ({ title, description: null, date: day(date) });

// Repositorio en memoria, reloj falso y los casos de uso que preparan el escenario de cada test
export function createPomodoroFixture(now = '2026-11-08T09:00:00Z') {
  const clock = new FakeClock(now);
  const repository = new InMemoryPomodoroRepository();
  const timeZones = new IntlTimeZoneAdapter();
  const settle = new SettleDuePomodoroUseCase(repository, { find: async () => 'Europe/Madrid' }, timeZones, clock);
  const start = new StartPomodoroUseCase(repository, settle, clock);
  return {
    clock,
    repository,
    settle,
    start,
    updateTask: new UpdatePomodoroTaskUseCase(repository, settle, clock),
    changeStatus: new ChangePomodoroStatusUseCase(repository, settle, timeZones, clock),
    // Sesión con tareas nuevas en ese orden y, si se indican, tareas en espera
    startWith: (titles: string[], durationMinutes = 25, waitingTaskIds: string[] = [], context = pomodoroContext) =>
      start.execute(context, { durationMinutes, newTasks: titles.map((title) => newTask(title)), waitingTaskIds }),
  };
}

// La promesa falla con AppError y ese código
export async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ code });
}
