import { InMemoryTaskRepository } from '../../../../../tests/support/in-memory-task.repository.js';
import type { RequestContext } from '../../../../shared/application/request-context.type.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { Pagination } from '../../../../shared/domain/pagination.value-object.js';
import { ListTasksUseCase } from '../list-task.use-case.js';

const context: RequestContext = {
  userId: 'user-1',
  today: LocalDate.parse('2026-10-24'),
  timeZone: 'Europe/Madrid',
};
const day = (value: string) => LocalDate.parse(value);

describe('ListTasksUseCase', () => {
  let tasks: InMemoryTaskRepository;
  let useCase: ListTasksUseCase;

  beforeEach(async () => {
    tasks = new InMemoryTaskRepository();
    useCase = new ListTasksUseCase(tasks);
    await tasks.create({ userId: 'user-1', title: 'B del 24', description: null, date: day('2026-10-24') });
    await tasks.create({ userId: 'user-1', title: 'A del 25', description: null, date: day('2026-10-25') });
    await tasks.create({ userId: 'user-1', title: 'C del 24', description: null, date: day('2026-10-24') });
    await tasks.create({ userId: 'user-2', title: 'Ajena del 24', description: null, date: day('2026-10-24') });
  });

  it('devuelve solo las tareas del usuario para ese día (RF-08)', async () => {
    const page = await useCase.execute(context, {
      date: day('2026-10-24'),
      status: 'all',
      pagination: new Pagination(1, 50),
    });
    expect(page.items.map((task) => task.title)).toEqual(['B del 24', 'C del 24']);
    expect(page.totalItems).toBe(2);
  });

  it('ordena por fecha y, dentro de cada fecha, por orden de creación (RF-41)', async () => {
    const page = await useCase.execute(context, { status: 'all', pagination: new Pagination(1, 50) });
    expect(page.items.map((task) => task.title)).toEqual(['B del 24', 'C del 24', 'A del 25']);
  });

  it('pagina el resultado con los totales (RF-39)', async () => {
    const page = await useCase.execute(context, { status: 'all', pagination: new Pagination(2, 2) });
    expect(page).toMatchObject({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
    expect(page.items.map((task) => task.title)).toEqual(['A del 25']);
  });
});
