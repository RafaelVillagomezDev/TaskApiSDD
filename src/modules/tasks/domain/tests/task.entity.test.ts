import { AppError } from '../../../../shared/domain/app.error.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { Task } from '../task.entity.js';

const TODAY = LocalDate.parse('2026-10-24');

function taskOn(date: string, completed = false): Task {
  const createdAt = new Date('2026-10-01T10:00:00Z');
  return Task.restore({
    id: '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b',
    userId: 'user-1',
    title: 'Tarea',
    description: null,
    date: LocalDate.parse(date),
    completed,
    createdAt,
    updatedAt: createdAt,
  });
}

const codeOf = (action: () => void): string | undefined => {
  try {
    action();
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.code : String(error);
  }
};

describe('Task: reglas de día', () => {
  describe('complete', () => {
    it('completa una tarea de hoy (RF-11)', () => {
      const task = taskOn('2026-10-24');
      task.complete(TODAY);
      expect(task.completed).toBe(true);
    });

    it('es idempotente sobre una tarea ya completada', () => {
      const task = taskOn('2026-10-24', true);
      task.complete(TODAY);
      expect(task.completed).toBe(true);
    });

    it('rechaza una tarea de un día pasado con DAY_CLOSED (RF-14)', () => {
      expect(codeOf(() => taskOn('2026-10-23').complete(TODAY))).toBe('DAY_CLOSED');
    });

    it('rechaza una tarea de un día futuro con DAY_NOT_STARTED (RF-45)', () => {
      expect(codeOf(() => taskOn('2026-10-25').complete(TODAY))).toBe('DAY_NOT_STARTED');
    });
  });

  describe('uncomplete', () => {
    it('vuelve a poner pendiente una tarea de hoy (RF-12)', () => {
      const task = taskOn('2026-10-24', true);
      task.uncomplete(TODAY);
      expect(task.completed).toBe(false);
    });

    it('es idempotente sobre una tarea pendiente, también si es futura', () => {
      const task = taskOn('2026-10-25');
      task.uncomplete(TODAY);
      expect(task.completed).toBe(false);
    });

    it('rechaza desmarcar una tarea de un día pasado con DAY_CLOSED (RF-14)', () => {
      expect(codeOf(() => taskOn('2026-10-23', true).uncomplete(TODAY))).toBe('DAY_CLOSED');
    });
  });

  describe('assertModifiable', () => {
    it('permite hoy y días futuros', () => {
      expect(codeOf(() => taskOn('2026-10-24').assertModifiable(TODAY))).toBeUndefined();
      expect(codeOf(() => taskOn('2026-12-31').assertModifiable(TODAY))).toBeUndefined();
    });

    it('rechaza días pasados con DAY_CLOSED (RF-14)', () => {
      expect(codeOf(() => taskOn('2026-10-23').assertModifiable(TODAY))).toBe('DAY_CLOSED');
    });
  });

  describe('isValidId (D-10)', () => {
    it('acepta un UUID y rechaza cualquier otro formato', () => {
      expect(Task.isValidId('6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b')).toBe(true);
      expect(Task.isValidId('abc')).toBe(false);
      expect(Task.isValidId('6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6')).toBe(false);
    });
  });
});
