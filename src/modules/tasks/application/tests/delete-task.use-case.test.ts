import { InMemoryTaskRepository } from '../../../../../tests/support/in-memory-task.repository.js';
import type { RequestContext } from '../../../../shared/application/request-context.type.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { DeleteTaskUseCase } from '../delete-task.use-case.js';

const context: RequestContext = { userId: 'user-1', sessionId: 'session-1', today: LocalDate.parse('2026-10-24'), timeZone: 'Europe/Madrid' };
const day = (value: string) => LocalDate.parse(value);

describe('DeleteTaskUseCase', () => {
  let tasks: InMemoryTaskRepository;
  let useCase: DeleteTaskUseCase;

  const seed = (date: string, userId = 'user-1') =>
    tasks.create({ userId, title: 'Tarea', description: null, date: day(date) });

  beforeEach(() => {
    tasks = new InMemoryTaskRepository();
    useCase = new DeleteTaskUseCase(tasks);
  });

  it.each(['2026-10-24', '2026-10-30'])('borra una tarea del día %s y deja de encontrarse (RF-15)', async (date) => {
    const task = await seed(date);
    await useCase.execute(context, task.id);
    expect(await tasks.findById('user-1', task.id)).toBeNull();
    expect(tasks.count()).toBe(0);
  });

  it('borra también una tarea completada de hoy (RF-15)', async () => {
    const task = await seed('2026-10-24');
    task.complete(context.today);
    await tasks.update(task);
    await useCase.execute(context, task.id);
    expect(tasks.count()).toBe(0);
  });

  it('rechaza borrar una tarea de ayer con DAY_CLOSED y la conserva (RF-14)', async () => {
    const task = await seed('2026-10-23');
    await expect(useCase.execute(context, task.id)).rejects.toMatchObject({ code: 'DAY_CLOSED' });
    expect(await tasks.findById('user-1', task.id)).not.toBeNull();
  });

  it.each([
    ['de otro usuario', async () => (await seed('2026-10-24', 'user-2')).id],
    ['inexistente', async () => '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b'],
    ['con id no UUID', async () => 'abc'],
  ])('una tarea %s → TASK_NOT_FOUND (RF-16)', async (_case, idOf) => {
    await expect(useCase.execute(context, await idOf())).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
  });

  it('borrar la tarea de otro usuario no la elimina (RF-16)', async () => {
    const foreign = await seed('2026-10-24', 'user-2');
    await expect(useCase.execute(context, foreign.id)).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
    expect(await tasks.findById('user-2', foreign.id)).not.toBeNull();
  });

  it('borrar dos veces → la segunda responde TASK_NOT_FOUND (RF-15, RF-16)', async () => {
    const task = await seed('2026-10-24');
    await useCase.execute(context, task.id);
    await expect(useCase.execute(context, task.id)).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
  });
});
