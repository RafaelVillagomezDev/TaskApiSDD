import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { PomodoroTask, type PomodoroTaskProps } from '../pomodoro-task.entity.js';

const NOW = new Date('2026-11-08T09:10:00Z');
const today = LocalDate.parse('2026-11-08');
const day = (value: string) => LocalDate.parse(value);

function task(overrides: Partial<PomodoroTaskProps> = {}): PomodoroTask {
  return PomodoroTask.restore({
    id: '8f1c2e4a-0000-4000-8000-0000000000aa',
    userId: 'user-1',
    pomodoroId: 'pomodoro-1',
    title: 'Repasar el tema 3',
    description: null,
    date: today,
    completed: false,
    completedAt: null,
    position: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

describe('PomodoroTask', () => {
  it('isValidId solo acepta UUID (D-10 de la 001)', () => {
    expect(PomodoroTask.isValidId('8f1c2e4a-0000-4000-8000-0000000000aa')).toBe(true);
    expect(PomodoroTask.isValidId('tarea-1')).toBe(false);
  });

  describe('completar y desmarcar (RF-13, RF-57)', () => {
    it('completar guarda el instante en que se completó', () => {
      const pomodoroTask = task();
      pomodoroTask.complete(NOW);
      expect(pomodoroTask.completed).toBe(true);
      expect(pomodoroTask.completedAt).toEqual(NOW);
    });

    it('completar no mira la fecha: una tarea de la semana que viene se completa hoy (RF-57)', () => {
      const pomodoroTask = task({ date: day('2026-11-15') });
      pomodoroTask.complete(NOW);
      expect(pomodoroTask.completed).toBe(true);
    });

    it('completar de nuevo una tarea completada conserva el instante original', () => {
      const pomodoroTask = task();
      pomodoroTask.complete(NOW);
      pomodoroTask.complete(new Date('2026-11-08T09:20:00Z'));
      expect(pomodoroTask.completedAt).toEqual(NOW);
    });

    it('desmarcar vuelve a pendiente y borra el instante', () => {
      const pomodoroTask = task();
      pomodoroTask.complete(NOW);
      pomodoroTask.uncomplete();
      expect(pomodoroTask.completed).toBe(false);
      expect(pomodoroTask.completedAt).toBeNull();
    });
  });

  it('editar cambia solo el título y la descripción indicados (RF-48)', () => {
    const pomodoroTask = task({ description: 'Apuntes' });
    pomodoroTask.edit({ title: 'Repasar los temas 3 y 4' });
    expect(pomodoroTask.title).toBe('Repasar los temas 3 y 4');
    expect(pomodoroTask.description).toBe('Apuntes');
    pomodoroTask.edit({ description: null });
    expect(pomodoroTask.description).toBeNull();
    expect(pomodoroTask.date).toEqual(today);
  });

  describe('en espera y paso a otra sesión (RF-21, RF-23)', () => {
    it('una tarea pendiente sin sesión está en espera; una con sesión o completada, no', () => {
      expect(task({ pomodoroId: null, position: null }).isWaiting()).toBe(true);
      expect(task().isWaiting()).toBe(false);
      expect(task({ pomodoroId: null, position: null, completed: true, completedAt: NOW }).isWaiting()).toBe(false);
    });

    it('moveToWaiting la saca de la sesión', () => {
      const pomodoroTask = task();
      pomodoroTask.moveToWaiting();
      expect(pomodoroTask.pomodoroId).toBeNull();
      expect(pomodoroTask.position).toBeNull();
      expect(pomodoroTask.isWaiting()).toBe(true);
    });

    it('moveTo con fecha pasada toma la fecha de hoy (RF-21)', () => {
      const pomodoroTask = task({ pomodoroId: null, position: null, date: day('2026-10-08') });
      pomodoroTask.moveTo('pomodoro-2', 4, today);
      expect(pomodoroTask.pomodoroId).toBe('pomodoro-2');
      expect(pomodoroTask.position).toBe(4);
      expect(pomodoroTask.date).toEqual(today);
    });

    it('moveTo con fecha de hoy o futura la conserva (RF-21)', () => {
      const future = task({ pomodoroId: null, position: null, date: day('2026-12-01') });
      future.moveTo('pomodoro-2', 1, today);
      expect(future.date).toEqual(day('2026-12-01'));
      const sameDay = task({ pomodoroId: null, position: null });
      sameDay.moveTo('pomodoro-2', 2, today);
      expect(sameDay.date).toEqual(today);
    });
  });

  it('toSnapshot copia id, título, descripción, fecha y estado (RF-16)', () => {
    const pomodoroTask = task({ description: 'Apuntes' });
    pomodoroTask.complete(NOW);
    expect(pomodoroTask.toSnapshot()).toEqual({
      id: '8f1c2e4a-0000-4000-8000-0000000000aa',
      title: 'Repasar el tema 3',
      description: 'Apuntes',
      date: today,
      completed: true,
      completedAt: NOW,
    });
  });

  it('toProps devuelve una copia', () => {
    const pomodoroTask = task();
    const props = pomodoroTask.toProps();
    props.title = 'Otra';
    expect(pomodoroTask.title).toBe('Repasar el tema 3');
  });
});
