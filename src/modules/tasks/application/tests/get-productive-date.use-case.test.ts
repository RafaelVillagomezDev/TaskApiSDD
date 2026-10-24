import { InMemoryTaskRepository } from '../../../../../tests/support/in-memory-task.repository.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { GetProductiveDateUseCase } from '../get-productive-date.use-case.js';

const day = (value: string) => LocalDate.parse(value);

describe('GetProductiveDateUseCase', () => {
  let tasks: InMemoryTaskRepository;
  let useCase: GetProductiveDateUseCase;

  const seed = async (date: string, completed: boolean, userId = 'user-1') => {
    const task = await tasks.create({ userId, title: 'Tarea', description: null, date: day(date) });
    if (completed) {
      task.complete(day(date));
      await tasks.update(task);
    }
  };

  beforeEach(() => {
    tasks = new InMemoryTaskRepository();
    useCase = new GetProductiveDateUseCase(tasks);
  });

  it('devuelve los días con al menos una tarea completada, sin duplicados y en orden (RF-17)', async () => {
    await seed('2026-10-21', true);
    await seed('2026-10-21', true);
    await seed('2026-10-20', true);
    await seed('2026-10-20', false);
    const dates = await useCase.execute('user-1', day('2026-10-24'));
    expect(dates.map(String)).toEqual(['2026-10-20', '2026-10-21']);
  });

  it('excluye los días sin tareas completadas (RF-18)', async () => {
    await seed('2026-10-22', false);
    expect(await useCase.execute('user-1', day('2026-10-24'))).toEqual([]);
  });

  it('solo cuenta hasta el día indicado y solo del usuario (RF-02, RF-22)', async () => {
    await seed('2026-10-25', true);
    await seed('2026-10-23', true, 'user-2');
    await seed('2026-10-24', true);
    const dates = await useCase.execute('user-1', day('2026-10-24'));
    expect(dates.map(String)).toEqual(['2026-10-24']);
  });
});
