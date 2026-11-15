import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { Alert, type AlertProps } from '../alert.entity.js';

const props = (): AlertProps => ({
  id: 'alert-1',
  userId: 'user-1',
  type: 'daily',
  periodStart: LocalDate.parse('2026-10-24'),
  periodEnd: LocalDate.parse('2026-10-24'),
  tasks: [{ id: 'task-1', title: 'Llamar al banco', date: LocalDate.parse('2026-10-24') }],
  createdAt: new Date('2026-10-24T20:00:00Z'),
});

describe('Alert', () => {
  it('expone el tipo, el periodo y la copia { id, title, date } de cada tarea (RF-30)', () => {
    const alert = Alert.restore(props());
    expect(alert).toMatchObject({ id: 'alert-1', userId: 'user-1', type: 'daily' });
    expect(alert.periodStart.toString()).toBe('2026-10-24');
    expect(alert.tasks.map((task) => ({ ...task, date: task.date.toString() }))).toEqual([
      { id: 'task-1', title: 'Llamar al banco', date: '2026-10-24' },
    ]);
  });

  it('no cambia si se modifican los datos con los que se creó (RF-30)', () => {
    const source = props();
    const alert = Alert.restore(source);
    (source.tasks[0] as { title: string }).title = 'Otro título';
    source.tasks.push({ id: 'task-2', title: 'Nueva', date: LocalDate.parse('2026-10-24') });
    source.createdAt.setUTCFullYear(2000);
    expect(alert.tasks).toHaveLength(1);
    expect(alert.tasks[0]?.title).toBe('Llamar al banco');
    expect(alert.createdAt.toISOString()).toBe('2026-10-24T20:00:00.000Z');
  });

  it('la copia de tareas no se puede modificar desde fuera (RF-30)', () => {
    const alert = Alert.restore(props());
    expect(Object.isFrozen(alert.tasks)).toBe(true);
    expect(Object.isFrozen(alert.tasks[0])).toBe(true);
    alert.createdAt.setUTCFullYear(2000);
    expect(alert.createdAt.getUTCFullYear()).toBe(2026);
  });
});
