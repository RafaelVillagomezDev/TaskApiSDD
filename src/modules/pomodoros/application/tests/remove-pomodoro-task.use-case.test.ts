import {
  createPomodoroFixture,
  expectAppError,
  pomodoroContext as context,
} from '../../../../../tests/support/pomodoro-use-case.fixture.js';
import { Pagination } from '../../../../shared/domain/pagination.value-object.js';
import { AddPomodoroTaskUseCase } from '../add-pomodoro-task.use-case.js';
import { RemovePomodoroTaskUseCase } from '../remove-pomodoro-task.use-case.js';

describe('RemovePomodoroTaskUseCase', () => {
  let fixture: ReturnType<typeof createPomodoroFixture>;
  let useCase: RemovePomodoroTaskUseCase;

  beforeEach(() => {
    fixture = createPomodoroFixture();
    useCase = new RemovePomodoroTaskUseCase(fixture.repository, fixture.settle, fixture.clock);
  });

  it('quitar una tarea pendiente la deja en espera, sin borrarla (RF-26)', async () => {
    const { pomodoro, tasks } = await fixture.startWith(['A', 'B']);
    const detail = await useCase.execute(context, pomodoro.id, tasks[0]?.id ?? '');
    expect(detail.tasks.map((task) => task.title)).toEqual(['B']);
    const waiting = await fixture.repository.findWaitingPage(context.userId, new Pagination(1, 50));
    expect(waiting.items.map((task) => task.title)).toEqual(['A']);
  });

  it('quitar la última tarea deja la sesión activa y vacía (RF-26)', async () => {
    const { pomodoro, tasks } = await fixture.startWith(['Única']);
    const detail = await useCase.execute(context, pomodoro.id, tasks[0]?.id ?? '');
    expect(detail.pomodoro.status).toBe('running');
    expect(detail.tasks).toEqual([]);
  });

  it('quitar una tarea y volver a añadirla la pone al final (RF-64)', async () => {
    const add = new AddPomodoroTaskUseCase(fixture.repository, fixture.settle, fixture.clock);
    const { pomodoro, tasks } = await fixture.startWith(['A', 'B', 'C']);
    await useCase.execute(context, pomodoro.id, tasks[0]?.id ?? '');
    const detail = await add.execute(context, pomodoro.id, { newTasks: [], waitingTaskIds: [tasks[0]?.id ?? ''] });
    expect(detail.tasks.map((task) => task.title)).toEqual(['B', 'C', 'A']);
  });

  it('en una sesión pausada también se quita (RF-26)', async () => {
    const { pomodoro, tasks } = await fixture.startWith(['A']);
    await fixture.changeStatus.execute(context, pomodoro.id, 'paused');
    expect((await useCase.execute(context, pomodoro.id, tasks[0]?.id ?? '')).tasks).toEqual([]);
  });

  it('una tarea completada → POMODORO_TASK_COMPLETED; tras desmarcarla se puede quitar (RF-37)', async () => {
    const { pomodoro, tasks } = await fixture.startWith(['Hecha']);
    const taskId = tasks[0]?.id ?? '';
    await fixture.updateTask.execute(context, taskId, { completed: true });
    await expectAppError(useCase.execute(context, pomodoro.id, taskId), 'POMODORO_TASK_COMPLETED');
    await fixture.updateTask.execute(context, taskId, { completed: false });
    expect((await useCase.execute(context, pomodoro.id, taskId)).tasks).toEqual([]);
  });

  it('una tarea que no está en esa sesión → POMODORO_TASK_NOT_FOUND (RF-28)', async () => {
    const first = await fixture.startWith(['De otra sesión']);
    const otherTaskId = first.tasks[0]?.id ?? '';
    // Ya quitada: está en espera, no en la sesión
    await useCase.execute(context, first.pomodoro.id, otherTaskId);
    await expectAppError(useCase.execute(context, first.pomodoro.id, otherTaskId), 'POMODORO_TASK_NOT_FOUND');
    await expectAppError(useCase.execute(context, first.pomodoro.id, 'tarea-1'), 'POMODORO_TASK_NOT_FOUND');
  });

  it('una tarea completada de una sesión terminada → INVALID_POMODORO_STATE (RF-27)', async () => {
    const { pomodoro, tasks } = await fixture.startWith(['Hecha']);
    await fixture.updateTask.execute(context, tasks[0]?.id ?? '', { completed: true });
    await fixture.changeStatus.execute(context, pomodoro.id, 'finished');
    await expectAppError(useCase.execute(context, pomodoro.id, tasks[0]?.id ?? ''), 'INVALID_POMODORO_STATE');
  });

  it('precedencia: en una sesión terminada, una tarea que ya no está en ella → POMODORO_TASK_NOT_FOUND (RF-63)', async () => {
    const { pomodoro, tasks } = await fixture.startWith(['Pendiente']);
    await fixture.changeStatus.execute(context, pomodoro.id, 'finished');
    await expectAppError(useCase.execute(context, pomodoro.id, tasks[0]?.id ?? ''), 'POMODORO_TASK_NOT_FOUND');
  });

  it('una sesión de otro usuario → POMODORO_NOT_FOUND (RF-20)', async () => {
    const { pomodoro, tasks } = await fixture.startWith(['A']);
    await expectAppError(
      useCase.execute({ ...context, userId: 'user-2' }, pomodoro.id, tasks[0]?.id ?? ''),
      'POMODORO_NOT_FOUND',
    );
  });
});
