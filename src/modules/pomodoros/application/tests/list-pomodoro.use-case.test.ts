import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { InMemoryPomodoroRepository } from '../../../../../tests/support/in-memory-pomodoro.repository.js';
import type { RequestContext } from '../../../../shared/application/request-context.type.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { Pagination } from '../../../../shared/domain/pagination.value-object.js';
import { IntlTimeZoneAdapter } from '../../../../shared/infrastructure/time/intl-time-zone.adapter.js';
import { ListPomodorosUseCase } from '../list-pomodoro.use-case.js';
import { SettleDuePomodoroUseCase } from '../settle-due-pomodoro.use-case.js';
import { StartPomodoroUseCase } from '../start-pomodoro.use-case.js';

const MINUTE = 60_000;
const context: RequestContext = {
  userId: 'user-1',
  sessionId: 'session-1',
  today: LocalDate.parse('2026-11-08'),
  timeZone: 'Europe/Madrid',
};

describe('ListPomodorosUseCase', () => {
  let clock: FakeClock;
  let repository: InMemoryPomodoroRepository;
  let start: StartPomodoroUseCase;
  let useCase: ListPomodorosUseCase;

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
    useCase = new ListPomodorosUseCase(repository, settle, clock);
  });

  // Sesiones de 1 minuto seguidas: cada una vence antes de empezar la siguiente
  async function sessions(count: number, userContext = context): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 0; index < count; index++) {
      const { pomodoro } = await start.execute(userContext, {
        durationMinutes: 1,
        newTasks: [{ title: `Tarea ${index}`, description: null, date: context.today }],
        waitingTaskIds: [],
      });
      ids.push(pomodoro.id);
      clock.advance(MINUTE);
    }
    return ids;
  }

  it('devuelve las sesiones de la más reciente a la más antigua, activas y terminadas (RF-18)', async () => {
    const ids = await sessions(3);
    clock.advance(-MINUTE / 2);
    const page = await useCase.execute(context, new Pagination(1, 50));
    expect(page.items.map((detail) => detail.pomodoro.id)).toEqual([...ids].reverse());
    expect(page.items.map((detail) => detail.pomodoro.status)).toEqual(['running', 'finished', 'finished']);
    expect(page).toMatchObject({ page: 1, pageSize: 50, totalItems: 3, totalPages: 1 });
  });

  it('asienta antes la sesión vencida: ninguna sale en curso si ya pasó su fin (RF-15)', async () => {
    await sessions(2);
    const page = await useCase.execute(context, new Pagination(1, 50));
    expect(page.items.every((detail) => detail.pomodoro.status === 'finished')).toBe(true);
  });

  it('cada sesión lleva sus tareas: la activa, las actuales; las terminadas, su foto (RF-16, RF-58)', async () => {
    await sessions(2);
    clock.advance(-MINUTE / 2);
    const page = await useCase.execute(context, new Pagination(1, 50));
    expect(page.items.map((detail) => detail.tasks.map((task) => task.title))).toEqual([['Tarea 1'], ['Tarea 0']]);
  });

  it('pagina y devuelve items vacío fuera de rango (RF-18; RF-39 de la 001)', async () => {
    await sessions(3);
    const second = await useCase.execute(context, new Pagination(2, 2));
    expect(second.items).toHaveLength(1);
    expect(second).toMatchObject({ totalItems: 3, totalPages: 2 });
    expect((await useCase.execute(context, new Pagination(5, 2))).items).toEqual([]);
  });

  it('no incluye sesiones de otros usuarios (RF-01)', async () => {
    await sessions(1, { ...context, userId: 'user-2' });
    expect((await useCase.execute(context, new Pagination(1, 50))).totalItems).toBe(0);
  });
});
