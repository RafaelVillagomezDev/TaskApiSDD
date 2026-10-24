import { InMemoryTaskRepository } from '../../../../../tests/support/in-memory-task.repository.js';
import type { RequestContext } from '../../../../shared/application/request-context.type.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { UpdateTaskUseCase } from '../update-task.use-case.js';

const context: RequestContext = { userId: 'user-1', today: LocalDate.parse('2026-10-24'), timeZone: 'Europe/Madrid' };
const day = (value: string) => LocalDate.parse(value);

describe('UpdateTaskUseCase: completar y desmarcar', () => {
  let tasks: InMemoryTaskRepository;
  let useCase: UpdateTaskUseCase;

  const seed = (date: string, userId = 'user-1') =>
    tasks.create({ userId, title: 'Tarea', description: null, date: day(date) });

  beforeEach(() => {
    tasks = new InMemoryTaskRepository();
    useCase = new UpdateTaskUseCase(tasks);
  });

  it('completa una tarea de hoy y lo guarda (RF-11)', async () => {
    const task = await seed('2026-10-24');
    const updated = await useCase.execute(context, task.id, { completed: true });
    expect(updated.completed).toBe(true);
    expect((await tasks.findById('user-1', task.id))?.completed).toBe(true);
  });

  it('desmarca una tarea de hoy (RF-12)', async () => {
    const task = await seed('2026-10-24');
    await useCase.execute(context, task.id, { completed: true });
    const updated = await useCase.execute(context, task.id, { completed: false });
    expect(updated.completed).toBe(false);
  });

  it('completar dos veces es idempotente', async () => {
    const task = await seed('2026-10-24');
    await useCase.execute(context, task.id, { completed: true });
    expect((await useCase.execute(context, task.id, { completed: true })).completed).toBe(true);
  });

  it('rechaza completar o desmarcar una tarea de ayer con DAY_CLOSED (RF-14)', async () => {
    const task = await seed('2026-10-23');
    await expect(useCase.execute(context, task.id, { completed: true })).rejects.toMatchObject({ code: 'DAY_CLOSED' });
    await expect(useCase.execute(context, task.id, { completed: false })).rejects.toMatchObject({ code: 'DAY_CLOSED' });
  });

  it('rechaza completar una tarea de mañana con DAY_NOT_STARTED (RF-45)', async () => {
    const task = await seed('2026-10-25');
    await expect(useCase.execute(context, task.id, { completed: true })).rejects.toMatchObject({
      code: 'DAY_NOT_STARTED',
    });
    expect((await tasks.findById('user-1', task.id))?.completed).toBe(false);
  });

  it.each([
    ['de otro usuario', async () => (await seed('2026-10-24', 'user-2')).id],
    ['inexistente', async () => '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b'],
    ['con id no UUID', async () => 'abc'],
  ])('una tarea %s → TASK_NOT_FOUND (RF-16)', async (_case, idOf) => {
    await expect(useCase.execute(context, await idOf(), { completed: true })).rejects.toMatchObject({
      code: 'TASK_NOT_FOUND',
    });
  });
});
