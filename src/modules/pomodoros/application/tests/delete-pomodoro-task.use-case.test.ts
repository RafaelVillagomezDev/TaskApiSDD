import {
  createPomodoroFixture,
  expectAppError,
  MINUTE,
  pomodoroContext as context,
} from '../../../../../tests/support/pomodoro-use-case.fixture.js';
import { DeletePomodoroTaskUseCase } from '../delete-pomodoro-task.use-case.js';

describe('DeletePomodoroTaskUseCase', () => {
  let fixture: ReturnType<typeof createPomodoroFixture>;
  let useCase: DeletePomodoroTaskUseCase;

  beforeEach(() => {
    fixture = createPomodoroFixture();
    useCase = new DeletePomodoroTaskUseCase(fixture.repository, fixture.settle);
  });

  it('borra una tarea en espera: deja de aparecer en cualquier consulta (RF-22)', async () => {
    const { tasks } = await fixture.startWith(['A'], 1);
    fixture.clock.advance(MINUTE);
    await useCase.execute(context, tasks[0]?.id ?? '');
    expect(await fixture.repository.findTask(context.userId, tasks[0]?.id ?? '')).toBeNull();
  });

  it('dos veces la misma → la segunda POMODORO_TASK_NOT_FOUND (RF-07, RF-22)', async () => {
    const { tasks } = await fixture.startWith(['A'], 1);
    fixture.clock.advance(MINUTE);
    await useCase.execute(context, tasks[0]?.id ?? '');
    await expectAppError(useCase.execute(context, tasks[0]?.id ?? ''), 'POMODORO_TASK_NOT_FOUND');
  });

  it('una tarea de la sesión activa → POMODORO_TASK_IN_SESSION (RF-29)', async () => {
    const { tasks } = await fixture.startWith(['En curso']);
    await expectAppError(useCase.execute(context, tasks[0]?.id ?? ''), 'POMODORO_TASK_IN_SESSION');
  });

  it('una completada de una sesión terminada → INVALID_POMODORO_STATE; la sesión no cambia (RF-22, RF-34)', async () => {
    const { pomodoro, tasks } = await fixture.startWith(['Hecha']);
    await fixture.updateTask.execute(context, tasks[0]?.id ?? '', { completed: true });
    await fixture.changeStatus.execute(context, pomodoro.id, 'finished');
    await expectAppError(useCase.execute(context, tasks[0]?.id ?? ''), 'INVALID_POMODORO_STATE');
    expect(await fixture.repository.findTask(context.userId, tasks[0]?.id ?? '')).not.toBeNull();
  });

  it('una tarea inexistente, con id no UUID o de otro usuario → POMODORO_TASK_NOT_FOUND (RF-01, RF-07)', async () => {
    const { tasks } = await fixture.startWith(['A'], 1);
    fixture.clock.advance(MINUTE);
    await expectAppError(useCase.execute(context, '8f1c2e4a-0000-4000-8000-0000000000ff'), 'POMODORO_TASK_NOT_FOUND');
    await expectAppError(useCase.execute(context, 'tarea-1'), 'POMODORO_TASK_NOT_FOUND');
    await expectAppError(useCase.execute({ ...context, userId: 'user-2' }, tasks[0]?.id ?? ''), 'POMODORO_TASK_NOT_FOUND');
  });
});
