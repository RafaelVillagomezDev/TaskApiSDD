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

describe('ListTasksUseCase: todas las tareas, por estado y por rango (HU-04)', () => {
  let tasks: InMemoryTaskRepository;
  let useCase: ListTasksUseCase;
  const all = new Pagination(1, 50);
  const titles = (page: { items: { title: string }[] }) => page.items.map((task) => task.title);

  // Escenario de HU-04: 3 completadas y 2 pendientes en días distintos
  beforeEach(async () => {
    tasks = new InMemoryTaskRepository();
    useCase = new ListTasksUseCase(tasks);
    const seed = async (title: string, date: string, completed: boolean) => {
      const task = await tasks.create({ userId: 'user-1', title, description: null, date: day(date) });
      if (completed) {
        task.complete(day(date));
        await tasks.update(task);
      }
    };
    await seed('Hecha 20', '2026-10-20', true);
    await seed('Pendiente 21', '2026-10-21', false);
    await seed('Hecha 22', '2026-10-22', true);
    await seed('Pendiente 23', '2026-10-23', false);
    await seed('Hecha 24', '2026-10-24', true);
    await tasks.create({ userId: 'user-2', title: 'Ajena 22', description: null, date: day('2026-10-22') });
  });

  it('sin filtros devuelve todas las tareas del usuario con su estado (RF-09)', async () => {
    const page = await useCase.execute(context, { status: 'all', pagination: all });
    expect(page.items.map((task) => [task.title, task.completed])).toEqual([
      ['Hecha 20', true],
      ['Pendiente 21', false],
      ['Hecha 22', true],
      ['Pendiente 23', false],
      ['Hecha 24', true],
    ]);
    expect(page.totalItems).toBe(5);
  });

  it('filtra solo las pendientes o solo las completadas (RF-10)', async () => {
    expect(titles(await useCase.execute(context, { status: 'pending', pagination: all }))).toEqual([
      'Pendiente 21',
      'Pendiente 23',
    ]);
    expect(titles(await useCase.execute(context, { status: 'completed', pagination: all }))).toEqual([
      'Hecha 20',
      'Hecha 22',
      'Hecha 24',
    ]);
  });

  it('acota por rango con ambos días incluidos (RF-40)', async () => {
    const page = await useCase.execute(context, {
      from: day('2026-10-21'),
      to: day('2026-10-23'),
      status: 'all',
      pagination: all,
    });
    expect(titles(page)).toEqual(['Pendiente 21', 'Hecha 22', 'Pendiente 23']);
    expect(page.totalItems).toBe(3);
  });

  it('acepta un rango abierto por un extremo (RF-40)', async () => {
    expect(titles(await useCase.execute(context, { from: day('2026-10-23'), status: 'all', pagination: all }))).toEqual([
      'Pendiente 23',
      'Hecha 24',
    ]);
    expect(titles(await useCase.execute(context, { to: day('2026-10-21'), status: 'all', pagination: all }))).toEqual([
      'Hecha 20',
      'Pendiente 21',
    ]);
  });

  it('combina rango y estado (RF-10, RF-40)', async () => {
    const page = await useCase.execute(context, {
      from: day('2026-10-21'),
      to: day('2026-10-24'),
      status: 'completed',
      pagination: all,
    });
    expect(titles(page)).toEqual(['Hecha 22', 'Hecha 24']);
  });

  it('una página fuera de rango devuelve items vacío con los totales reales (RF-39)', async () => {
    const page = await useCase.execute(context, { status: 'all', pagination: new Pagination(4, 2) });
    expect(page).toEqual({ items: [], page: 4, pageSize: 2, totalItems: 5, totalPages: 3 });
  });

  it('un usuario sin tareas recibe totalItems 0 y totalPages 0', async () => {
    const page = await useCase.execute({ ...context, userId: 'nuevo' }, { status: 'all', pagination: all });
    expect(page).toEqual({ items: [], page: 1, pageSize: 50, totalItems: 0, totalPages: 0 });
  });
});
