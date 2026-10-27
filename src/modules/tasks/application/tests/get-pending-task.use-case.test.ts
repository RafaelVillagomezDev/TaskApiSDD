import { InMemoryTaskRepository } from '../../../../../tests/support/in-memory-task.repository.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { GetPendingTaskUseCase } from '../get-pending-task.use-case.js';

const day = (value: string) => LocalDate.parse(value);

describe('GetPendingTaskUseCase', () => {
  let tasks: InMemoryTaskRepository;
  let useCase: GetPendingTaskUseCase;

  const seed = async (title: string, date: string, completed = false, userId = 'user-1') => {
    const task = await tasks.create({ userId, title, description: 'No se copia', date: day(date) });
    if (completed) {
      task.complete(day(date));
      await tasks.update(task);
    }
  };

  beforeEach(() => {
    tasks = new InMemoryTaskRepository();
    useCase = new GetPendingTaskUseCase(tasks);
  });

  it('devuelve solo las pendientes del usuario en el rango, ambos días incluidos, en orden (RF-24 a RF-26)', async () => {
    await seed('Antes', '2026-10-22');
    await seed('Viernes', '2026-10-23');
    await seed('Hecha', '2026-10-24', true);
    await seed('Domingo', '2026-10-25');
    await seed('Sábado', '2026-10-24');
    await seed('Ajena', '2026-10-24', false, 'user-2');
    await seed('Después', '2026-10-26');

    const pending = await useCase.execute('user-1', day('2026-10-23'), day('2026-10-25'));

    expect(pending.map((task) => task.title)).toEqual(['Viernes', 'Sábado', 'Domingo']);
  });

  it('devuelve solo { id, title, date } de cada tarea', async () => {
    await seed('Viernes', '2026-10-23');
    const [task] = await useCase.execute('user-1', day('2026-10-23'), day('2026-10-23'));
    expect(Object.keys(task!).sort()).toEqual(['date', 'id', 'title']);
    expect(task!.date.toString()).toBe('2026-10-23');
  });

  it('sin pendientes devuelve una lista vacía (RF-27)', async () => {
    await seed('Hecha', '2026-10-24', true);
    expect(await useCase.execute('user-1', day('2026-10-24'), day('2026-10-24'))).toEqual([]);
  });
});
