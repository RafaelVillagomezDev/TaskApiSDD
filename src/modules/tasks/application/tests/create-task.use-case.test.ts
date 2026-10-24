import { InMemoryTaskRepository } from '../../../../../tests/support/in-memory-task.repository.js';
import type { RequestContext } from '../../../../shared/application/request-context.type.js';
import { AppError } from '../../../../shared/domain/app.error.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { CreateTaskUseCase } from '../create-task.use-case.js';

const context: RequestContext = {
  userId: 'user-1',
  today: LocalDate.parse('2026-10-24'),
  timeZone: 'Europe/Madrid',
};

describe('CreateTaskUseCase', () => {
  let tasks: InMemoryTaskRepository;
  let useCase: CreateTaskUseCase;

  beforeEach(() => {
    tasks = new InMemoryTaskRepository();
    useCase = new CreateTaskUseCase(tasks);
  });

  it('crea la tarea pendiente, asociada al usuario y al día (RF-03)', async () => {
    const task = await useCase.execute(context, {
      title: 'Comprar pan',
      description: null,
      date: LocalDate.parse('2026-10-24'),
    });
    expect(task.userId).toBe('user-1');
    expect(task.title).toBe('Comprar pan');
    expect(task.date.toString()).toBe('2026-10-24');
    expect(task.completed).toBe(false);
    expect(task.id).toEqual(expect.any(String));
  });

  it('acepta días futuros sin límite (RF-03)', async () => {
    const task = await useCase.execute(context, {
      title: 'Viaje',
      description: null,
      date: LocalDate.parse('2027-03-01'),
    });
    expect(task.date.toString()).toBe('2027-03-01');
  });

  it('rechaza una fecha anterior al día actual con DAY_CLOSED (RF-07)', async () => {
    const promise = useCase.execute(context, {
      title: 'Tarde',
      description: null,
      date: LocalDate.parse('2026-10-23'),
    });
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({ code: 'DAY_CLOSED' });
    expect(tasks.count()).toBe(0);
  });
});
