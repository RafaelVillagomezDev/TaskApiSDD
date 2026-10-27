import { InMemoryTaskRepository } from '../../../../../tests/support/in-memory-task.repository.js';
import type { RequestContext } from '../../../../shared/application/request-context.type.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { GetTaskUseCase } from '../get-task.use-case.js';

const context: RequestContext = { userId: 'user-1', today: LocalDate.parse('2026-10-24'), timeZone: 'Europe/Madrid' };
const day = (value: string) => LocalDate.parse(value);

describe('GetTaskUseCase', () => {
  let tasks: InMemoryTaskRepository;
  let useCase: GetTaskUseCase;

  const seed = (date: string, userId = 'user-1') =>
    tasks.create({ userId, title: 'Tarea', description: null, date: day(date) });

  beforeEach(() => {
    tasks = new InMemoryTaskRepository();
    useCase = new GetTaskUseCase(tasks);
  });

  it('devuelve una tarea propia con su estado (RF-44)', async () => {
    const created = await seed('2026-10-24');
    const task = await useCase.execute(context, created.id);
    expect(task.id).toBe(created.id);
    expect(task.completed).toBe(false);
  });

  it('devuelve también una tarea de un día pasado (RF-44)', async () => {
    const created = await seed('2026-10-20');
    expect((await useCase.execute(context, created.id)).date.toString()).toBe('2026-10-20');
  });

  it.each([
    ['de otro usuario', async () => (await seed('2026-10-24', 'user-2')).id],
    ['inexistente', async () => '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b'],
    ['con id no UUID', async () => 'abc'],
  ])('una tarea %s → TASK_NOT_FOUND (RF-16)', async (_case, idOf) => {
    await expect(useCase.execute(context, await idOf())).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
  });

  it('un id no UUID no llega a consultar el repositorio (D-10)', async () => {
    const findById = import.meta.jest.spyOn(tasks, 'findById');
    await expect(useCase.execute(context, 'abc')).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
    expect(findById).not.toHaveBeenCalled();
  });
});
