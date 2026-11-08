import { startPomodoroBodySchema } from '../pomodoro.schema.js';

const UUID_A = '8f1c2e4a-0000-4000-8000-0000000000a1';
const UUID_B = '8f1c2e4a-0000-4000-8000-0000000000b2';
const newTask = (title = 'Repasar', date = '2026-11-08') => ({ title, date });

describe('startPomodoroBodySchema', () => {
  it('sin cuerpo útil: 25 minutos y sin tareas (RF-09, RF-10, RF-49)', () => {
    expect(startPomodoroBodySchema.parse({})).toEqual({ durationMinutes: 25, newTasks: [], waitingTaskIds: [] });
  });

  it.each([1, 25, 120])('acepta una duración de %i minutos (RF-09)', (durationMinutes) => {
    expect(startPomodoroBodySchema.parse({ durationMinutes }).durationMinutes).toBe(durationMinutes);
  });

  it.each([0, 121, 25.5, -5, '25', null])('rechaza la duración %p (RF-55)', (durationMinutes) => {
    const result = startPomodoroBodySchema.safeParse({ durationMinutes });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['durationMinutes']);
  });

  it('recorta título y descripción, descripción vacía → null y fecha a LocalDate (RF-06, RF-53)', () => {
    const { newTasks } = startPomodoroBodySchema.parse({
      newTasks: [{ title: '  Repasar ', description: '   ', date: '2026-11-08' }],
    });
    expect(newTasks[0]?.title).toBe('Repasar');
    expect(newTasks[0]?.description).toBeNull();
    expect(newTasks[0]?.date.toString()).toBe('2026-11-08');
  });

  it.each([
    ['título vacío', { title: '   ', date: '2026-11-08' }],
    ['título de 201 caracteres', { title: 'a'.repeat(201), date: '2026-11-08' }],
    ['descripción de 1001 caracteres', { title: 'Tarea', description: 'a'.repeat(1001), date: '2026-11-08' }],
    ['día inexistente', { title: 'Tarea', date: '2026-02-30' }],
    ['sin fecha', { title: 'Tarea' }],
    ['campo desconocido', { title: 'Tarea', date: '2026-11-08', completed: true }],
  ])('rechaza una tarea nueva con %s (RF-06)', (_case, task) => {
    expect(startPomodoroBodySchema.safeParse({ newTasks: [task] }).success).toBe(false);
  });

  it('acepta 20 tareas entre nuevas y en espera, y rechaza 21 (RF-10, RF-56)', () => {
    const nineteen = Array.from({ length: 19 }, (_, index) => newTask(`Tarea ${index}`));
    expect(startPomodoroBodySchema.safeParse({ newTasks: nineteen, waitingTaskIds: [UUID_A] }).success).toBe(true);
    const result = startPomodoroBodySchema.safeParse({ newTasks: nineteen, waitingTaskIds: [UUID_A, UUID_B] });
    expect(result.success).toBe(false);
  });

  it('rechaza una tarea en espera repetida (RF-56)', () => {
    const result = startPomodoroBodySchema.safeParse({ waitingTaskIds: [UUID_A, UUID_A] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['waitingTaskIds']);
  });

  it('rechaza campos desconocidos y listas que no son listas', () => {
    expect(startPomodoroBodySchema.safeParse({ status: 'running' }).success).toBe(false);
    expect(startPomodoroBodySchema.safeParse({ newTasks: newTask() }).success).toBe(false);
    expect(startPomodoroBodySchema.safeParse({ waitingTaskIds: [5] }).success).toBe(false);
  });
});
