import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { InMemoryPomodoroRepository } from '../../../../../tests/support/in-memory-pomodoro.repository.js';
import type { RequestContext } from '../../../../shared/application/request-context.type.js';
import { AppError } from '../../../../shared/domain/app.error.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { IntlTimeZoneAdapter } from '../../../../shared/infrastructure/time/intl-time-zone.adapter.js';
import { GetPomodoroUseCase } from '../get-pomodoro.use-case.js';
import { SettleDuePomodoroUseCase } from '../settle-due-pomodoro.use-case.js';
import { StartPomodoroUseCase } from '../start-pomodoro.use-case.js';
import { UpdatePomodoroTaskUseCase } from '../update-pomodoro-task.use-case.js';

const MINUTE = 60_000;
const day = (value: string) => LocalDate.parse(value);
const context: RequestContext = {
  userId: 'user-1',
  sessionId: 'session-1',
  today: day('2026-11-08'),
  timeZone: 'Europe/Madrid',
};
const newTask = (title: string) => ({ title, description: null, date: day('2026-11-08') });

describe('GetPomodoroUseCase', () => {
  let clock: FakeClock;
  let repository: InMemoryPomodoroRepository;
  let start: StartPomodoroUseCase;
  let updateTask: UpdatePomodoroTaskUseCase;
  let useCase: GetPomodoroUseCase;

  beforeEach(() => {
    clock = new FakeClock('2026-11-08T09:00:00Z');
    repository = new InMemoryPomodoroRepository();
    const settle = new SettleDuePomodoroUseCase(
      repository,
      { find: async () => 'Europe/Madrid' },
      new IntlTimeZoneAdapter(),
      clock,
    );
    start = new StartPomodoroUseCase(repository, settle, clock);
    updateTask = new UpdatePomodoroTaskUseCase(repository, settle, clock);
    useCase = new GetPomodoroUseCase(repository, settle, clock);
  });

  const startWith = (titles: string[], durationMinutes = 25, waitingTaskIds: string[] = []) =>
    start.execute(context, { durationMinutes, newTasks: titles.map(newTask), waitingTaskIds });

  const expectNotFound = async (promise: Promise<unknown>) => {
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({ code: 'POMODORO_NOT_FOUND' });
  };

  it('devuelve la sesión activa con sus tareas actuales y el tiempo restante (RF-17, RF-58)', async () => {
    const { pomodoro, tasks } = await startWith(['A', 'B']);
    await updateTask.execute(context, tasks[1]?.id ?? '', { completed: true });
    clock.advance(10 * MINUTE);
    const detail = await useCase.execute(context, pomodoro.id);
    expect(detail.pomodoro.status).toBe('running');
    expect(detail.remainingSeconds).toBe(900);
    expect(detail.tasks.map((task) => [task.title, task.completed])).toEqual([
      ['A', false],
      ['B', true],
    ]);
  });

  it('una sesión vencida se ve terminada aunque el barrido no haya pasado (RF-15, R-2)', async () => {
    const { pomodoro } = await startWith(['A'], 1);
    clock.advance(5 * MINUTE);
    const detail = await useCase.execute(context, pomodoro.id);
    expect(detail.pomodoro).toMatchObject({ status: 'finished', endReason: 'time' });
    expect(detail.remainingSeconds).toBe(0);
  });

  it('una sesión terminada devuelve su foto aunque sus tareas cambien después (RF-16)', async () => {
    const first = await startWith(['Pendiente', 'Hecha'], 1);
    await updateTask.execute(context, first.tasks[1]?.id ?? '', { completed: true });
    clock.advance(MINUTE);
    // La pendiente pasa a otra sesión, cambia de título y se completa allí
    const pendingId = first.tasks[0]?.id ?? '';
    await startWith([], 25, [pendingId]);
    await updateTask.execute(context, pendingId, { title: 'Renombrada', completed: true });

    const detail = await useCase.execute(context, first.pomodoro.id);
    expect(detail.tasks.map((task) => [task.title, task.completed])).toEqual([
      ['Pendiente', false],
      ['Hecha', true],
    ]);
  });

  it('las tareas salen en el orden en que se añadieron: nuevas y después en espera (RF-64)', async () => {
    const first = await startWith(['En espera'], 1);
    clock.advance(MINUTE);
    const second = await startWith(['Nueva 1', 'Nueva 2'], 25, [first.tasks[0]?.id ?? '']);
    const detail = await useCase.execute(context, second.pomodoro.id);
    expect(detail.tasks.map((task) => task.title)).toEqual(['Nueva 1', 'Nueva 2', 'En espera']);
  });

  it.each([
    ['inexistente', '8f1c2e4a-0000-4000-8000-0000000000ff'],
    ['con formato no UUID', 'sesion-1'],
  ])('una sesión %s → POMODORO_NOT_FOUND (RF-20)', async (_case, id) => {
    await expectNotFound(useCase.execute(context, id));
  });

  it('una sesión de otro usuario → POMODORO_NOT_FOUND (RF-01, RF-20)', async () => {
    const { pomodoro } = await startWith([]);
    await expectNotFound(useCase.execute({ ...context, userId: 'user-2' }, pomodoro.id));
  });
});
