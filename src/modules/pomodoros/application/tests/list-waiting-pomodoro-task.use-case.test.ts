import {
  createPomodoroFixture,
  MINUTE,
  pomodoroContext as context,
} from '../../../../../tests/support/pomodoro-use-case.fixture.js';
import { Pagination } from '../../../../shared/domain/pagination.value-object.js';
import { ListWaitingPomodoroTasksUseCase } from '../list-waiting-pomodoro-task.use-case.js';

describe('ListWaitingPomodoroTasksUseCase', () => {
  let fixture: ReturnType<typeof createPomodoroFixture>;
  let useCase: ListWaitingPomodoroTasksUseCase;

  beforeEach(() => {
    fixture = createPomodoroFixture();
    useCase = new ListWaitingPomodoroTasksUseCase(fixture.repository, fixture.settle);
  });

  it('devuelve las pendientes que no están en una sesión activa, por fecha y creación (RF-24)', async () => {
    await fixture.start.execute(context, {
      durationMinutes: 1,
      newTasks: [
        { title: 'Mañana', description: null, date: context.today.addDays(1) },
        { title: 'Hoy A', description: null, date: context.today },
        { title: 'Hoy B', description: null, date: context.today },
      ],
      waitingTaskIds: [],
    });
    fixture.clock.advance(MINUTE);
    const page = await useCase.execute(context, new Pagination(1, 50));
    expect(page.items.map((task) => task.title)).toEqual(['Hoy A', 'Hoy B', 'Mañana']);
    expect(page).toMatchObject({ page: 1, pageSize: 50, totalItems: 3, totalPages: 1 });
  });

  it('asienta antes la sesión vencida: sus pendientes aparecen sin esperar al barrido (RF-15, RF-23)', async () => {
    await fixture.startWith(['A'], 1);
    fixture.clock.advance(MINUTE);
    expect((await useCase.execute(context, new Pagination(1, 50))).totalItems).toBe(1);
  });

  it('no incluye las de la sesión activa ni las completadas (RF-24, RF-35)', async () => {
    const first = await fixture.startWith(['Pendiente', 'Hecha'], 1);
    await fixture.updateTask.execute(context, first.tasks[1]?.id ?? '', { completed: true });
    fixture.clock.advance(MINUTE);
    await fixture.startWith(['En curso']);
    const page = await useCase.execute(context, new Pagination(1, 50));
    expect(page.items.map((task) => task.title)).toEqual(['Pendiente']);
  });

  it('siguen en espera aunque pasen días (RF-23)', async () => {
    await fixture.startWith(['A'], 1);
    fixture.clock.advance(30 * 24 * 60 * MINUTE);
    expect((await useCase.execute(context, new Pagination(1, 50))).totalItems).toBe(1);
  });

  it('pagina y no incluye las de otros usuarios (RF-01, RF-24)', async () => {
    await fixture.startWith(['A', 'B', 'C'], 1);
    fixture.clock.advance(MINUTE);
    const second = await useCase.execute(context, new Pagination(2, 2));
    expect(second.items.map((task) => task.title)).toEqual(['C']);
    expect(second.totalPages).toBe(2);
    expect((await useCase.execute({ ...context, userId: 'user-2' }, new Pagination(1, 50))).totalItems).toBe(0);
  });
});
