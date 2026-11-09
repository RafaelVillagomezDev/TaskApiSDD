import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { InMemoryPomodoroRepository } from '../../../../../tests/support/in-memory-pomodoro.repository.js';
import type { RequestContext } from '../../../../shared/application/request-context.type.js';
import { AppError } from '../../../../shared/domain/app.error.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { IntlTimeZoneAdapter } from '../../../../shared/infrastructure/time/intl-time-zone.adapter.js';
import { SettleDuePomodoroUseCase } from '../settle-due-pomodoro.use-case.js';
import { StartPomodoroUseCase } from '../start-pomodoro.use-case.js';
import { UpdatePomodoroTaskUseCase } from '../update-pomodoro-task.use-case.js';

const MINUTE = 60_000;
const NOW = '2026-11-08T09:00:00Z';
const day = (value: string) => LocalDate.parse(value);
const context: RequestContext = {
  userId: 'user-1',
  sessionId: 'session-1',
  today: day('2026-11-08'),
  timeZone: 'Europe/Madrid',
};

describe('UpdatePomodoroTaskUseCase', () => {
  let clock: FakeClock;
  let repository: InMemoryPomodoroRepository;
  let start: StartPomodoroUseCase;
  let useCase: UpdatePomodoroTaskUseCase;

  beforeEach(() => {
    clock = new FakeClock(NOW);
    repository = new InMemoryPomodoroRepository();
    const settle = new SettleDuePomodoroUseCase(
      repository,
      { find: async () => 'Europe/Madrid' },
      new IntlTimeZoneAdapter(),
      clock,
    );
    start = new StartPomodoroUseCase(repository, settle, clock);
    useCase = new UpdatePomodoroTaskUseCase(repository, settle, clock);
  });

  // Empieza una sesión de `minutes` minutos con una tarea y devuelve los ids de la sesión y de la tarea
  async function sessionWithTask(minutes = 25, date = '2026-11-08') {
    const { pomodoro, tasks } = await start.execute(context, {
      durationMinutes: minutes,
      newTasks: [{ title: 'Repasar', description: null, date: day(date) }],
      waitingTaskIds: [],
    });
    return { pomodoroId: pomodoro.id, taskId: tasks[0]?.id ?? '' };
  }

  const expectError = async (promise: Promise<unknown>, code: string) => {
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({ code });
  };

  describe('completar y desmarcar (RF-13, RF-57)', () => {
    it('completar guarda el instante del servidor', async () => {
      const { taskId } = await sessionWithTask();
      clock.advance(5 * MINUTE);
      const task = await useCase.execute(context, taskId, { completed: true });
      expect(task).toMatchObject({ completed: true, completedAt: clock.now() });
    });

    it('desmarcar vuelve a pendiente y borra el instante', async () => {
      const { taskId } = await sessionWithTask();
      await useCase.execute(context, taskId, { completed: true });
      expect(await useCase.execute(context, taskId, { completed: false })).toMatchObject({
        completed: false,
        completedAt: null,
      });
    });

    it('una tarea con fecha de la semana que viene se completa hoy (RF-57)', async () => {
      const { taskId } = await sessionWithTask(25, '2026-11-15');
      expect((await useCase.execute(context, taskId, { completed: true })).completed).toBe(true);
    });

    it('en una sesión pausada también se completa (RF-13)', async () => {
      const { pomodoroId, taskId } = await sessionWithTask();
      await repository.transaction(async (unit) => {
        const locked = await unit.lockPomodoro('user-1', pomodoroId);
        locked?.pause(clock.now());
        if (locked) await unit.savePomodoro(locked);
      });
      clock.advance(60 * MINUTE);
      expect((await useCase.execute(context, taskId, { completed: true })).completed).toBe(true);
    });

    it('la sesión ve la tarea completada (RF-58)', async () => {
      const { pomodoroId, taskId } = await sessionWithTask();
      await useCase.execute(context, taskId, { completed: true });
      expect((await repository.findTasksOf(pomodoroId))[0]?.completed).toBe(true);
    });
  });

  describe('editar (RF-48)', () => {
    it('cambia el título y la descripción y conserva la fecha', async () => {
      const { taskId } = await sessionWithTask();
      const task = await useCase.execute(context, taskId, { title: 'Repasar los temas 3 y 4', description: 'Apuntes' });
      expect(task).toMatchObject({ title: 'Repasar los temas 3 y 4', description: 'Apuntes', date: day('2026-11-08') });
    });

    it('edita una tarea completada de la sesión activa sin desmarcarla', async () => {
      const { taskId } = await sessionWithTask();
      await useCase.execute(context, taskId, { completed: true });
      expect(await useCase.execute(context, taskId, { title: 'Corregido' })).toMatchObject({
        title: 'Corregido',
        completed: true,
      });
    });

    it('edita una tarea en espera', async () => {
      const { taskId } = await sessionWithTask(1);
      clock.advance(MINUTE);
      expect((await useCase.execute(context, taskId, { title: 'En espera' })).title).toBe('En espera');
    });
  });

  describe('errores', () => {
    it('completar una tarea en espera → POMODORO_TASK_NOT_IN_SESSION, sin editar nada (RF-36)', async () => {
      const { taskId } = await sessionWithTask(1);
      clock.advance(MINUTE);
      await expectError(useCase.execute(context, taskId, { title: 'No cambia', completed: true }), 'POMODORO_TASK_NOT_IN_SESSION');
      expect((await repository.findTask('user-1', taskId))?.title).toBe('Repasar');
    });

    it('desmarcar una tarea en espera → POMODORO_TASK_NOT_IN_SESSION (RF-36)', async () => {
      const { taskId } = await sessionWithTask(1);
      clock.advance(MINUTE);
      await expectError(useCase.execute(context, taskId, { completed: false }), 'POMODORO_TASK_NOT_IN_SESSION');
    });

    it('desmarcar o editar una tarea completada de una sesión terminada → INVALID_POMODORO_STATE (RF-34, RF-35)', async () => {
      const { taskId } = await sessionWithTask(1);
      await useCase.execute(context, taskId, { completed: true });
      clock.advance(MINUTE);
      await expectError(useCase.execute(context, taskId, { completed: false }), 'INVALID_POMODORO_STATE');
      await expectError(useCase.execute(context, taskId, { title: 'Tarde' }), 'INVALID_POMODORO_STATE');
    });

    it.each([
      ['inexistente', '8f1c2e4a-0000-4000-8000-0000000000ff'],
      ['con formato no UUID', 'tarea-1'],
    ])('una tarea %s → POMODORO_TASK_NOT_FOUND (RF-07)', async (_case, id) => {
      await expectError(useCase.execute(context, id, { completed: true }), 'POMODORO_TASK_NOT_FOUND');
    });

    it('una tarea de otro usuario → POMODORO_TASK_NOT_FOUND (RF-01, RF-07)', async () => {
      const { taskId } = await sessionWithTask();
      await expectError(useCase.execute({ ...context, userId: 'user-2' }, taskId, { completed: true }), 'POMODORO_TASK_NOT_FOUND');
    });

    it('precedencia: no encontrada antes que sesión terminada (RF-63)', async () => {
      await expectError(
        useCase.execute(context, '8f1c2e4a-0000-4000-8000-0000000000ff', { completed: false }),
        'POMODORO_TASK_NOT_FOUND',
      );
    });
  });
  it('completar la décima tarea desbloquea TASKS_10 con el instante en que se completó (RF-44, RF-46)', async () => {
    const { tasks } = await start.execute(context, {
      durationMinutes: 25,
      newTasks: Array.from({ length: 10 }, (_, index) => ({ title: `Tarea ${index}`, description: null, date: day('2026-11-08') })),
      waitingTaskIds: [],
    });
    for (const task of tasks) {
      clock.advance(MINUTE);
      await useCase.execute(context, task.id, { completed: true });
    }
    const unlocked = await repository.achievements.listUnlocked('user-1');
    expect(unlocked).toEqual([{ code: 'TASKS_10', unlockedAt: clock.now() }]);
  });

  it('editar o desmarcar no desbloquea logros (RF-44)', async () => {
    const { taskId } = await sessionWithTask();
    await useCase.execute(context, taskId, { title: 'Otro título' });
    await useCase.execute(context, taskId, { completed: false });
    expect(await repository.achievements.listUnlocked('user-1')).toEqual([]);
  });
});
