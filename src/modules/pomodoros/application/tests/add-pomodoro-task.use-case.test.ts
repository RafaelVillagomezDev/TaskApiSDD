import {
  createPomodoroFixture,
  day,
  expectAppError,
  MINUTE,
  newTask,
  pomodoroContext as context,
} from '../../../../../tests/support/pomodoro-use-case.fixture.js';
import { AddPomodoroTaskUseCase } from '../add-pomodoro-task.use-case.js';

describe('AddPomodoroTaskUseCase', () => {
  let fixture: ReturnType<typeof createPomodoroFixture>;
  let useCase: AddPomodoroTaskUseCase;

  beforeEach(() => {
    fixture = createPomodoroFixture();
    useCase = new AddPomodoroTaskUseCase(fixture.repository, fixture.settle, fixture.clock);
  });

  // Tareas en espera: una sesión de 1 minuto con ellas que vence
  async function waiting(...titles: string[]): Promise<string[]> {
    const { tasks } = await fixture.startWith(titles, 1);
    fixture.clock.advance(MINUTE);
    await fixture.settle.forUser(context.userId);
    return tasks.map((task) => task.id);
  }

  it('añade tareas nuevas y en espera al final, en el orden de RF-64 (RF-25)', async () => {
    const [waitingId] = await waiting('En espera');
    const { pomodoro } = await fixture.startWith(['Primera']);
    const detail = await useCase.execute(context, pomodoro.id, {
      newTasks: [newTask('Nueva 1'), newTask('Nueva 2')],
      waitingTaskIds: [waitingId ?? ''],
    });
    expect(detail.tasks.map((task) => task.title)).toEqual(['Primera', 'Nueva 1', 'Nueva 2', 'En espera']);
  });

  it('una tarea en espera con fecha pasada entra con la fecha de hoy (RF-21)', async () => {
    const [waitingId] = await waiting('De ayer');
    const tomorrow = { ...context, today: day('2026-11-09') };
    fixture.clock.set('2026-11-09T09:00:00Z');
    const { pomodoro } = await fixture.startWith([], 25, [], tomorrow);
    const detail = await useCase.execute(tomorrow, pomodoro.id, { newTasks: [], waitingTaskIds: [waitingId ?? ''] });
    expect(detail.tasks[0]?.date).toEqual(day('2026-11-09'));
  });

  it('en una sesión pausada también se añaden (RF-25)', async () => {
    const { pomodoro } = await fixture.startWith([]);
    await fixture.changeStatus.execute(context, pomodoro.id, 'paused');
    const detail = await useCase.execute(context, pomodoro.id, { newTasks: [newTask('Nueva')], waitingTaskIds: [] });
    expect(detail.tasks).toHaveLength(1);
  });

  it('con 19 tareas, añadir 2 → POMODORO_TASK_LIMIT sin añadir ninguna (RF-59)', async () => {
    const titles = Array.from({ length: 19 }, (_, index) => `Tarea ${index}`);
    const { pomodoro } = await fixture.startWith(titles);
    await expectAppError(
      useCase.execute(context, pomodoro.id, { newTasks: [newTask('A'), newTask('B')], waitingTaskIds: [] }),
      'POMODORO_TASK_LIMIT',
    );
    expect(await fixture.repository.findTasksOf(pomodoro.id)).toHaveLength(19);
    const detail = await useCase.execute(context, pomodoro.id, { newTasks: [newTask('La 20')], waitingTaskIds: [] });
    expect(detail.tasks).toHaveLength(20);
  });

  it('a una sesión terminada → INVALID_POMODORO_STATE, también si pasaría de 20 (RF-27, RF-63)', async () => {
    const titles = Array.from({ length: 18 }, (_, index) => `Tarea ${index}`);
    const { pomodoro } = await fixture.startWith(titles);
    await fixture.changeStatus.execute(context, pomodoro.id, 'finished');
    const five = ['A', 'B', 'C', 'D', 'E'].map((title) => newTask(title));
    await expectAppError(useCase.execute(context, pomodoro.id, { newTasks: five, waitingTaskIds: [] }), 'INVALID_POMODORO_STATE');
  });

  it('una tarea nueva para ayer → DAY_CLOSED sin añadir nada (RF-05)', async () => {
    const { pomodoro } = await fixture.startWith([]);
    await expectAppError(
      useCase.execute(context, pomodoro.id, { newTasks: [newTask('Hoy'), newTask('Ayer', '2026-11-07')], waitingTaskIds: [] }),
      'DAY_CLOSED',
    );
    expect(await fixture.repository.findTasksOf(pomodoro.id)).toHaveLength(0);
  });

  it('precedencia: límite de tareas antes que DAY_CLOSED (RF-63)', async () => {
    const { pomodoro } = await fixture.startWith(Array.from({ length: 20 }, (_, index) => `Tarea ${index}`));
    await expectAppError(
      useCase.execute(context, pomodoro.id, { newTasks: [newTask('Ayer', '2026-11-07')], waitingTaskIds: [] }),
      'POMODORO_TASK_LIMIT',
    );
  });

  it('una tarea en espera inexistente o que no está en espera → POMODORO_TASK_NOT_FOUND (RF-11)', async () => {
    const { pomodoro, tasks } = await fixture.startWith(['En la sesión']);
    await expectAppError(
      useCase.execute(context, pomodoro.id, { newTasks: [], waitingTaskIds: ['8f1c2e4a-0000-4000-8000-0000000000ff'] }),
      'POMODORO_TASK_NOT_FOUND',
    );
    await expectAppError(
      useCase.execute(context, pomodoro.id, { newTasks: [], waitingTaskIds: [tasks[0]?.id ?? ''] }),
      'POMODORO_TASK_NOT_FOUND',
    );
  });

  it('una sesión inexistente o de otro usuario → POMODORO_NOT_FOUND (RF-20)', async () => {
    const { pomodoro } = await fixture.startWith([]);
    const input = { newTasks: [newTask('Nueva')], waitingTaskIds: [] };
    await expectAppError(useCase.execute({ ...context, userId: 'user-2' }, pomodoro.id, input), 'POMODORO_NOT_FOUND');
    await expectAppError(useCase.execute(context, 'sesion-1', input), 'POMODORO_NOT_FOUND');
  });
});
