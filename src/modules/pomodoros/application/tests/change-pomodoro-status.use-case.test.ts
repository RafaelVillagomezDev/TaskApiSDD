import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { InMemoryPomodoroRepository } from '../../../../../tests/support/in-memory-pomodoro.repository.js';
import type { RequestContext } from '../../../../shared/application/request-context.type.js';
import { AppError } from '../../../../shared/domain/app.error.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { Pagination } from '../../../../shared/domain/pagination.value-object.js';
import { IntlTimeZoneAdapter } from '../../../../shared/infrastructure/time/intl-time-zone.adapter.js';
import { ChangePomodoroStatusUseCase } from '../change-pomodoro-status.use-case.js';
import { SettleDuePomodoroUseCase } from '../settle-due-pomodoro.use-case.js';
import { StartPomodoroUseCase } from '../start-pomodoro.use-case.js';
import { UpdatePomodoroTaskUseCase } from '../update-pomodoro-task.use-case.js';

const MINUTE = 60_000;
// 23:50 en Madrid (UTC+1 en noviembre)
const START = '2026-11-08T22:50:00Z';
const day = (value: string) => LocalDate.parse(value);
const context: RequestContext = {
  userId: 'user-1',
  sessionId: 'session-1',
  today: day('2026-11-08'),
  timeZone: 'Europe/Madrid',
};

describe('ChangePomodoroStatusUseCase', () => {
  let clock: FakeClock;
  let repository: InMemoryPomodoroRepository;
  let start: StartPomodoroUseCase;
  let updateTask: UpdatePomodoroTaskUseCase;
  let useCase: ChangePomodoroStatusUseCase;

  beforeEach(() => {
    clock = new FakeClock(START);
    repository = new InMemoryPomodoroRepository();
    const timeZones = new IntlTimeZoneAdapter();
    const settle = new SettleDuePomodoroUseCase(repository, { find: async () => 'Europe/Madrid' }, timeZones, clock);
    start = new StartPomodoroUseCase(repository, settle, clock);
    updateTask = new UpdatePomodoroTaskUseCase(repository, settle, clock);
    useCase = new ChangePomodoroStatusUseCase(repository, settle, timeZones, clock);
  });

  // Sesión de 25 minutos con las tareas indicadas, que empieza ahora
  async function startSession(titles: string[] = []) {
    return start.execute(context, {
      durationMinutes: 25,
      newTasks: titles.map((title) => ({ title, description: null, date: day('2026-11-08') })),
      waitingTaskIds: [],
    });
  }

  const expectError = async (promise: Promise<unknown>, code: string) => {
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({ code });
  };

  it('pausar deja la sesión pausada con el tiempo que le quedaba y sin fin previsto (RF-30)', async () => {
    const { pomodoro } = await startSession();
    clock.advance(5 * MINUTE);
    const detail = await useCase.execute(context, pomodoro.id, 'paused');
    expect(detail.pomodoro).toMatchObject({ status: 'paused', endsAt: null });
    expect(detail.remainingSeconds).toBe(1200);
  });

  it('reanudar recalcula el fin previsto: instante de reanudar + tiempo restante (RF-31)', async () => {
    const { pomodoro } = await startSession();
    clock.advance(5 * MINUTE);
    await useCase.execute(context, pomodoro.id, 'paused');
    clock.advance(10 * MINUTE);
    const detail = await useCase.execute(context, pomodoro.id, 'running');
    expect(detail.pomodoro.status).toBe('running');
    expect(detail.pomodoro.endsAt).toEqual(new Date(clock.now().getTime() + 20 * MINUTE));
  });

  it('una sesión pausada durante días sigue pausada (RF-60)', async () => {
    const { pomodoro } = await startSession();
    await useCase.execute(context, pomodoro.id, 'paused');
    clock.advance(3 * 24 * 60 * MINUTE);
    const detail = await useCase.execute(context, pomodoro.id, 'running');
    expect(detail.remainingSeconds).toBe(1500);
  });

  it('terminar a mano: concentración real, tareas pendientes a espera y foto (RF-23, RF-32, RF-33, RF-35)', async () => {
    const { pomodoro, tasks } = await startSession(['Pendiente', 'Hecha']);
    await updateTask.execute(context, tasks[1]?.id ?? '', { completed: true });
    clock.advance(10 * MINUTE);
    const detail = await useCase.execute(context, pomodoro.id, 'finished');
    expect(detail.pomodoro).toMatchObject({ status: 'finished', endReason: 'manual', focusedSeconds: 600 });
    expect(detail.pomodoro.finishedAt).toEqual(clock.now());
    expect(detail.tasks.map((task) => [task.title, task.completed])).toEqual([
      ['Pendiente', false],
      ['Hecha', true],
    ]);
    const waiting = await repository.findWaitingPage('user-1', new Pagination(1, 50));
    expect(waiting.items.map((task) => task.title)).toEqual(['Pendiente']);
  });

  it('terminar a mano una sesión pausada cuenta solo el tiempo en curso (RF-32, RF-33)', async () => {
    const { pomodoro } = await startSession();
    clock.advance(5 * MINUTE);
    await useCase.execute(context, pomodoro.id, 'paused');
    clock.advance(30 * MINUTE);
    expect((await useCase.execute(context, pomodoro.id, 'finished')).pomodoro.focusedSeconds).toBe(300);
  });

  it('el día del fin a mano es el local de la zona de la petición (RF-40)', async () => {
    const { pomodoro } = await startSession();
    clock.advance(20 * MINUTE); // 00:10 en Madrid
    const detail = await useCase.execute({ ...context, today: day('2026-11-09') }, pomodoro.id, 'finished');
    expect(detail.pomodoro.finishedOn).toEqual(day('2026-11-09'));
  });

  it.each([
    ['pausar una pausada', ['paused'], 'paused'],
    ['reanudar una en curso', [], 'running'],
    ['terminar una terminada', ['finished'], 'finished'],
    ['pausar una terminada', ['finished'], 'paused'],
    ['reanudar una terminada', ['finished'], 'running'],
  ] as const)('%s → INVALID_POMODORO_STATE (RF-34, RF-61)', async (_case, before, target) => {
    const { pomodoro } = await startSession();
    for (const status of before) await useCase.execute(context, pomodoro.id, status);
    await expectError(useCase.execute(context, pomodoro.id, target), 'INVALID_POMODORO_STATE');
  });

  it('pausar una sesión ya vencida → INVALID_POMODORO_STATE: ya terminó por tiempo (RF-15, RF-34)', async () => {
    const { pomodoro } = await startSession();
    clock.advance(26 * MINUTE);
    await expectError(useCase.execute(context, pomodoro.id, 'paused'), 'INVALID_POMODORO_STATE');
    expect((await repository.findById('user-1', pomodoro.id))?.endReason).toBe('time');
  });

  it.each([
    ['inexistente', '8f1c2e4a-0000-4000-8000-0000000000ff'],
    ['con formato no UUID', 'sesion-1'],
  ])('una sesión %s → POMODORO_NOT_FOUND (RF-20)', async (_case, id) => {
    await expectError(useCase.execute(context, id, 'paused'), 'POMODORO_NOT_FOUND');
  });

  it('una sesión de otro usuario → POMODORO_NOT_FOUND (RF-01, RF-20)', async () => {
    const { pomodoro } = await startSession();
    await expectError(useCase.execute({ ...context, userId: 'user-2' }, pomodoro.id, 'paused'), 'POMODORO_NOT_FOUND');
  });
  it('terminar a mano no cuenta para FIRST_POMODORO pero sí suma concentración (RF-38, RF-44, RF-47)', async () => {
    const { pomodoro } = await startSession();
    clock.advance(10 * MINUTE);
    await useCase.execute(context, pomodoro.id, 'finished');
    expect(await repository.achievements.listUnlocked('user-1')).toEqual([]);
    expect((await repository.achievements.stats('user-1')).focusedSeconds).toBe(600);
  });

  it('terminar a mano al llegar a 600 minutos desbloquea FOCUS_10H con ese instante (RF-44, RF-65)', async () => {
    for (let session = 0; session < 5; session++) {
      const { pomodoro } = await start.execute(context, { durationMinutes: 120, newTasks: [], waitingTaskIds: [] });
      clock.advance(120 * MINUTE - 1000);
      await useCase.execute(context, pomodoro.id, 'finished');
      clock.advance(1000);
    }
    const unlocked = await repository.achievements.listUnlocked('user-1');
    expect(unlocked.map((achievement) => achievement.code)).toEqual([]);
    const { pomodoro } = await start.execute(context, { durationMinutes: 1, newTasks: [], waitingTaskIds: [] });
    clock.advance(30_000);
    await useCase.execute(context, pomodoro.id, 'finished');
    expect((await repository.achievements.listUnlocked('user-1')).map((achievement) => achievement.code)).toEqual(['FOCUS_10H']);
  });
});
