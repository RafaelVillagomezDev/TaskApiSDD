import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { InMemoryPomodoroRepository } from '../../../../../tests/support/in-memory-pomodoro.repository.js';
import type { RequestContext } from '../../../../shared/application/request-context.type.js';
import { AppError } from '../../../../shared/domain/app.error.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { Pagination } from '../../../../shared/domain/pagination.value-object.js';
import { IntlTimeZoneAdapter } from '../../../../shared/infrastructure/time/intl-time-zone.adapter.js';
import { SettleDuePomodoroUseCase } from '../settle-due-pomodoro.use-case.js';
import { type StartPomodoroInput, StartPomodoroUseCase } from '../start-pomodoro.use-case.js';

const MINUTE = 60_000;
// 10:00 en Madrid
const NOW = '2026-11-08T09:00:00Z';
const day = (value: string) => LocalDate.parse(value);
const context: RequestContext = {
  userId: 'user-1',
  sessionId: 'session-1',
  today: day('2026-11-08'),
  timeZone: 'Europe/Madrid',
};

const input = (overrides: Partial<StartPomodoroInput> = {}): StartPomodoroInput => ({
  durationMinutes: 25,
  newTasks: [],
  waitingTaskIds: [],
  ...overrides,
});
const newTask = (title: string, date = '2026-11-08') => ({ title, description: null, date: day(date) });

describe('StartPomodoroUseCase', () => {
  let clock: FakeClock;
  let repository: InMemoryPomodoroRepository;
  let useCase: StartPomodoroUseCase;

  beforeEach(() => {
    clock = new FakeClock(NOW);
    repository = new InMemoryPomodoroRepository();
    const settle = new SettleDuePomodoroUseCase(
      repository,
      { find: async () => 'Europe/Madrid' },
      new IntlTimeZoneAdapter(),
      clock,
    );
    useCase = new StartPomodoroUseCase(repository, settle, clock);
  });

  // Deja en espera las tareas indicadas: empieza una sesión con ellas y deja que venza
  async function waitingTasks(...titles: string[]): Promise<string[]> {
    const { pomodoro, tasks } = await useCase.execute(context, input({ durationMinutes: 1, newTasks: titles.map((title) => newTask(title)) }));
    clock.advance(MINUTE);
    expect(pomodoro.status).toBe('running');
    return tasks.map((task) => task.id);
  }

  const expectError = async (promise: Promise<unknown>, code: string) => {
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({ code });
  };

  it('crea la sesión en curso con su fin previsto y el tiempo restante (RF-08)', async () => {
    const { pomodoro, tasks, remainingSeconds } = await useCase.execute(context, input());
    expect(pomodoro).toMatchObject({ status: 'running', durationMinutes: 25, userId: 'user-1' });
    expect(pomodoro.startedAt).toEqual(new Date(NOW));
    expect(pomodoro.endsAt).toEqual(new Date(new Date(NOW).getTime() + 25 * MINUTE));
    expect(remainingSeconds).toBe(1500);
    expect(tasks).toEqual([]);
  });

  it('crea las tareas nuevas pendientes, para hoy y para días futuros (RF-04, RF-52)', async () => {
    const { tasks } = await useCase.execute(
      context,
      input({ newTasks: [newTask('Hoy'), newTask('Dentro de un mes', '2026-12-08')] }),
    );
    expect(tasks.map((task) => [task.title, task.date.toString(), task.completed])).toEqual([
      ['Hoy', '2026-11-08', false],
      ['Dentro de un mes', '2026-12-08', false],
    ]);
  });

  it('pasa las tareas en espera con su id, después de las nuevas (RF-21, RF-64)', async () => {
    const [waitingId] = await waitingTasks('En espera');
    const { tasks } = await useCase.execute(context, input({ newTasks: [newTask('Nueva')], waitingTaskIds: [waitingId ?? ''] }));
    expect(tasks.map((task) => task.title)).toEqual(['Nueva', 'En espera']);
    expect(tasks[1]?.id).toBe(waitingId);
    expect((await repository.findWaitingPage('user-1', new Pagination(1, 50))).total).toBe(0);
  });

  it('una tarea en espera con fecha pasada toma la fecha de hoy (RF-21)', async () => {
    const [waitingId] = await waitingTasks('De ayer');
    const tomorrow: RequestContext = { ...context, today: day('2026-11-09') };
    clock.set('2026-11-09T09:00:00Z');
    const { tasks } = await useCase.execute(tomorrow, input({ waitingTaskIds: [waitingId ?? ''] }));
    expect(tasks[0]?.date.toString()).toBe('2026-11-09');
  });

  it('sin tareas también se puede empezar (RF-10)', async () => {
    expect((await useCase.execute(context, input())).tasks).toHaveLength(0);
  });

  it('con una sesión en curso o pausada → POMODORO_ALREADY_ACTIVE (RF-12)', async () => {
    const { pomodoro } = await useCase.execute(context, input());
    await expectError(useCase.execute(context, input()), 'POMODORO_ALREADY_ACTIVE');
    await repository.transaction(async (unit) => {
      const locked = await unit.lockPomodoro('user-1', pomodoro.id);
      locked?.pause(clock.now());
      if (locked) await unit.savePomodoro(locked);
    });
    await expectError(useCase.execute(context, input()), 'POMODORO_ALREADY_ACTIVE');
  });

  it('asienta antes la sesión vencida y deja empezar otra (RF-15)', async () => {
    const { pomodoro } = await useCase.execute(context, input({ durationMinutes: 1 }));
    clock.advance(2 * MINUTE);
    await expect(useCase.execute(context, input())).resolves.toBeDefined();
    expect((await repository.findById('user-1', pomodoro.id))?.status).toBe('finished');
  });

  it.each([
    ['inexistente', '8f1c2e4a-0000-4000-8000-0000000000ff'],
    ['con formato no UUID', 'tarea-1'],
  ])('una tarea en espera %s → POMODORO_TASK_NOT_FOUND (RF-11)', async (_case, id) => {
    await expectError(useCase.execute(context, input({ waitingTaskIds: [id] })), 'POMODORO_TASK_NOT_FOUND');
  });

  it('una tarea de otro usuario → POMODORO_TASK_NOT_FOUND (RF-01, RF-11)', async () => {
    const [waitingId] = await waitingTasks('Ajena');
    const other: RequestContext = { ...context, userId: 'user-2' };
    await expectError(useCase.execute(other, input({ waitingTaskIds: [waitingId ?? ''] })), 'POMODORO_TASK_NOT_FOUND');
  });

  it('una tarea que no está en espera (en la sesión activa) → POMODORO_TASK_NOT_FOUND (RF-11)', async () => {
    const { tasks } = await useCase.execute(context, input({ newTasks: [newTask('En curso')] }));
    await expectError(useCase.execute(context, input({ waitingTaskIds: [tasks[0]?.id ?? ''] })), 'POMODORO_TASK_NOT_FOUND');
  });

  it('una tarea nueva para ayer → DAY_CLOSED sin crear ni la sesión ni ninguna tarea (RF-05)', async () => {
    await expectError(
      useCase.execute(context, input({ newTasks: [newTask('Hoy'), newTask('Ayer', '2026-11-07')] })),
      'DAY_CLOSED',
    );
    expect((await repository.findPage('user-1', new Pagination(1, 50))).total).toBe(0);
  });

  it('precedencia: tarea no encontrada antes que sesión activa, y sesión activa antes que DAY_CLOSED (RF-63)', async () => {
    await useCase.execute(context, input());
    await expectError(
      useCase.execute(context, input({ waitingTaskIds: ['8f1c2e4a-0000-4000-8000-0000000000ff'] })),
      'POMODORO_TASK_NOT_FOUND',
    );
    await expectError(
      useCase.execute(context, input({ newTasks: [newTask('Ayer', '2026-11-07')] })),
      'POMODORO_ALREADY_ACTIVE',
    );
  });
});
