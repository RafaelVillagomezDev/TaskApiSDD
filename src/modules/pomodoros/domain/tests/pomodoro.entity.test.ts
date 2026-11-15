import { AppError } from '../../../../shared/domain/app.error.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import {
  DEFAULT_DURATION_MINUTES,
  MAX_DURATION_MINUTES,
  MAX_TASKS_PER_POMODORO,
  MIN_DURATION_MINUTES,
  Pomodoro,
  type PomodoroProps,
} from '../pomodoro.entity.js';

const MINUTE = 60_000;
const START = new Date('2026-11-08T09:00:00Z');
const at = (minutes: number) => new Date(START.getTime() + minutes * MINUTE);
const finishedOn = LocalDate.parse('2026-11-08');

// Sesión en curso de 25 minutos que empezó a las 09:00 UTC
function running(overrides: Partial<PomodoroProps> = {}): Pomodoro {
  return Pomodoro.restore({
    id: '8f1c2e4a-0000-4000-8000-000000000001',
    userId: 'user-1',
    durationMinutes: 25,
    status: 'running',
    startedAt: START,
    endsAt: at(25),
    remainingMs: null,
    finishedAt: null,
    finishedOn: null,
    endReason: null,
    focusedSeconds: null,
    snapshot: null,
    createdAt: START,
    ...overrides,
  });
}

// La acción falla con AppError('INVALID_POMODORO_STATE') (RF-34)
const expectInvalidState = (action: () => void) => {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(AppError);
  expect((thrown as AppError).code).toBe('INVALID_POMODORO_STATE');
};

describe('Pomodoro', () => {
  it('expone los límites de RF-09 y RF-10 como constantes con nombre', () => {
    expect([MIN_DURATION_MINUTES, MAX_DURATION_MINUTES, DEFAULT_DURATION_MINUTES]).toEqual([1, 120, 25]);
    expect(MAX_TASKS_PER_POMODORO).toBe(20);
  });

  it('plan calcula el fin previsto: inicio + duración (RF-08)', () => {
    expect(Pomodoro.plan('user-1', 25, START)).toEqual({
      userId: 'user-1',
      durationMinutes: 25,
      startedAt: START,
      endsAt: at(25),
    });
  });

  it('isValidId solo acepta UUID (D-10 de la 001)', () => {
    expect(Pomodoro.isValidId('8f1c2e4a-0000-4000-8000-000000000001')).toBe(true);
    expect(Pomodoro.isValidId('no-es-un-uuid')).toBe(false);
  });

  describe('estado y tiempo restante (RF-14, RNF-02)', () => {
    it('una sesión en curso o pausada es activa; una terminada, no', () => {
      const pomodoro = running();
      expect(pomodoro.isActive()).toBe(true);
      pomodoro.pause(at(5));
      expect(pomodoro.isActive()).toBe(true);
      pomodoro.finishManually(at(6), { finishedOn, snapshot: [] });
      expect(pomodoro.isActive()).toBe(false);
    });

    it('isDue: solo una sesión en curso cuyo fin previsto ya llegó (RF-15)', () => {
      const pomodoro = running();
      expect(pomodoro.isDue(at(24))).toBe(false);
      expect(pomodoro.isDue(at(25))).toBe(true);
      pomodoro.pause(at(10));
      expect(pomodoro.isDue(at(500))).toBe(false);
    });

    it('remainingSeconds: redondea hacia arriba en curso, fijo en pausa y 0 al terminar', () => {
      const pomodoro = running();
      expect(pomodoro.remainingSeconds(START)).toBe(1500);
      expect(pomodoro.remainingSeconds(new Date(at(24).getTime() + 500))).toBe(60);
      expect(pomodoro.remainingSeconds(at(30))).toBe(0);
      pomodoro.pause(at(5));
      expect(pomodoro.remainingSeconds(at(5))).toBe(1200);
      expect(pomodoro.remainingSeconds(at(500))).toBe(1200);
      pomodoro.finishManually(at(6), { finishedOn, snapshot: [] });
      expect(pomodoro.remainingSeconds(at(6))).toBe(0);
    });
  });

  describe('pausar y reanudar (RF-30, RF-31, RF-60)', () => {
    it('pausar guarda el tiempo restante y deja la sesión sin fin previsto', () => {
      const pomodoro = running();
      pomodoro.pause(at(5));
      expect(pomodoro.status).toBe('paused');
      expect(pomodoro.endsAt).toBeNull();
      expect(pomodoro.remainingMs).toBe(20 * MINUTE);
    });

    it('reanudar recalcula el fin previsto: instante de reanudar + tiempo restante', () => {
      const pomodoro = running();
      pomodoro.pause(at(5));
      pomodoro.resume(at(15));
      expect(pomodoro.status).toBe('running');
      expect(pomodoro.endsAt).toEqual(at(35));
      expect(pomodoro.remainingMs).toBeNull();
    });

    it('una sesión pausada durante días sigue pausada (RF-60)', () => {
      const pomodoro = running();
      pomodoro.pause(at(5));
      expect(pomodoro.isDue(at(3 * 24 * 60))).toBe(false);
      expect(pomodoro.status).toBe('paused');
    });

    it('pausar una sesión que no está en curso → INVALID_POMODORO_STATE (RF-34, RF-61)', () => {
      const pomodoro = running();
      pomodoro.pause(at(5));
      expectInvalidState(() => pomodoro.pause(at(6)));
    });

    it('pausar una sesión en curso ya vencida → INVALID_POMODORO_STATE', () => {
      expectInvalidState(() => running().pause(at(25)));
    });

    it('reanudar una sesión que no está pausada → INVALID_POMODORO_STATE (RF-34, RF-61)', () => {
      expectInvalidState(() => running().resume(at(5)));
    });
  });

  describe('terminar (RF-15, RF-32, RF-33)', () => {
    it('25 min pausada 10 a los 5 → termina por tiempo a los 35 con 1500 s de concentración', () => {
      const pomodoro = running();
      pomodoro.pause(at(5));
      pomodoro.resume(at(15));
      expect(pomodoro.isDue(at(34))).toBe(false);
      expect(pomodoro.isDue(at(35))).toBe(true);
      pomodoro.finishByTime(at(36), { finishedOn, snapshot: [] });
      expect(pomodoro.status).toBe('finished');
      expect(pomodoro.finishedAt).toEqual(at(35));
      expect(pomodoro.endReason).toBe('time');
      expect(pomodoro.focusedSeconds).toBe(1500);
      expect(pomodoro.endsAt).toBeNull();
      expect(pomodoro.remainingMs).toBeNull();
    });

    it('terminar a mano a los 10 minutos de una sesión de 25 → 600 s de concentración', () => {
      const pomodoro = running();
      pomodoro.finishManually(at(10), { finishedOn, snapshot: [] });
      expect(pomodoro.status).toBe('finished');
      expect(pomodoro.finishedAt).toEqual(at(10));
      expect(pomodoro.endReason).toBe('manual');
      expect(pomodoro.focusedSeconds).toBe(600);
    });

    it('terminar a mano una sesión pausada cuenta solo el tiempo en curso', () => {
      const pomodoro = running();
      pomodoro.pause(at(5));
      pomodoro.finishManually(at(40), { finishedOn, snapshot: [] });
      expect(pomodoro.focusedSeconds).toBe(300);
      expect(pomodoro.finishedAt).toEqual(at(40));
    });

    it('la concentración se redondea hacia abajo a segundos enteros', () => {
      const pomodoro = running();
      pomodoro.finishManually(new Date(at(1).getTime() + 999), { finishedOn, snapshot: [] });
      expect(pomodoro.focusedSeconds).toBe(60);
    });

    it('al terminar guarda el día local del fin y la foto de las tareas (RF-16, RF-40)', () => {
      const snapshot = [
        {
          id: 't-1',
          title: 'Repasar',
          description: null,
          date: finishedOn,
          completed: true,
          completedAt: at(3),
        },
      ];
      const pomodoro = running();
      pomodoro.finishManually(at(10), { finishedOn, snapshot });
      expect(pomodoro.finishedOn).toEqual(finishedOn);
      expect(pomodoro.snapshot).toEqual(snapshot);
    });

    it('terminar una sesión ya terminada → INVALID_POMODORO_STATE (RF-34, RF-61)', () => {
      const pomodoro = running();
      pomodoro.finishManually(at(10), { finishedOn, snapshot: [] });
      expectInvalidState(() => pomodoro.finishManually(at(11), { finishedOn, snapshot: [] }));
      expectInvalidState(() => pomodoro.pause(at(11)));
      expectInvalidState(() => pomodoro.resume(at(11)));
    });

    it('terminar a mano una sesión ya vencida → INVALID_POMODORO_STATE: se asienta por tiempo', () => {
      expectInvalidState(() => running().finishManually(at(26), { finishedOn, snapshot: [] }));
    });

    it('finishByTime solo vale para una sesión en curso vencida', () => {
      expectInvalidState(() => running().finishByTime(at(24), { finishedOn, snapshot: [] }));
      const paused = running();
      paused.pause(at(5));
      expectInvalidState(() => paused.finishByTime(at(500), { finishedOn, snapshot: [] }));
    });

    it('finishByTime termina en el fin previsto aunque se asiente más tarde (RF-15)', () => {
      const pomodoro = running();
      pomodoro.finishByTime(at(90), { finishedOn, snapshot: [] });
      expect(pomodoro.finishedAt).toEqual(at(25));
    });
  });

  it('toProps devuelve una copia', () => {
    const pomodoro = running();
    const props = pomodoro.toProps();
    props.status = 'finished';
    expect(pomodoro.status).toBe('running');
  });
});
