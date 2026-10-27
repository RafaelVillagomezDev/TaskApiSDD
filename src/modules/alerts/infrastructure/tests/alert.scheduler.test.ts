import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { InMemoryAlertRepository } from '../../../../../tests/support/in-memory-alert.repository.js';
import { InMemoryUserTimeZoneRepository } from '../../../../../tests/support/in-memory-user-time-zone.repository.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { IntlTimeZoneAdapter } from '../../../../shared/infrastructure/time/intl-time-zone.adapter.js';
import { GenerateDueAlertUseCase } from '../../application/generate-due-alert.use-case.js';
import { AlertScheduler } from '../alert.scheduler.js';

const jest = import.meta.jest;
const INTERVAL = 60_000;

describe('AlertScheduler', () => {
  let scheduler: AlertScheduler | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    scheduler?.stop();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // Pasada de prueba cuyo resultado controla el test
  const fakePass = (implementation: () => Promise<{ users: number; created: number }>) => {
    const execute = jest.fn(implementation);
    return { execute };
  };

  it('hace una pasada al arrancar y otra cada 60 s (RF-47)', async () => {
    const pass = fakePass(async () => ({ users: 0, created: 0 }));
    scheduler = new AlertScheduler(pass, INTERVAL);

    scheduler.start();
    expect(pass.execute).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(INTERVAL);
    expect(pass.execute).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(INTERVAL);
    expect(pass.execute).toHaveBeenCalledTimes(3);
  });

  it('no solapa pasadas: si la anterior sigue en curso, se salta el intervalo', async () => {
    let finish: () => void = () => undefined;
    const pass = fakePass(
      () => new Promise((resolve) => (finish = () => resolve({ users: 0, created: 0 }))),
    );
    scheduler = new AlertScheduler(pass, INTERVAL);

    scheduler.start();
    await jest.advanceTimersByTimeAsync(3 * INTERVAL);
    expect(pass.execute).toHaveBeenCalledTimes(1);

    finish();
    await jest.advanceTimersByTimeAsync(INTERVAL);
    expect(pass.execute).toHaveBeenCalledTimes(2);
  });

  it('un fallo de una pasada se registra en consola y no detiene el planificador', async () => {
    const pass = fakePass(async () => {
      throw new Error('base de datos caída');
    });
    scheduler = new AlertScheduler(pass, INTERVAL);

    scheduler.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('ALERT_PASS_FAILED'));

    await jest.advanceTimersByTimeAsync(INTERVAL);
    expect(pass.execute).toHaveBeenCalledTimes(2);
  });

  it('stop detiene las pasadas', async () => {
    const pass = fakePass(async () => ({ users: 0, created: 0 }));
    scheduler = new AlertScheduler(pass, INTERVAL);
    scheduler.start();
    scheduler.stop();
    await jest.advanceTimersByTimeAsync(5 * INTERVAL);
    expect(pass.execute).toHaveBeenCalledTimes(1);
  });

  it('un aviso de las 22:00 se registra en menos de 5 minutos (RNF-02)', async () => {
    const clock = new FakeClock('2026-10-21T19:59:30Z'); // 21:59:30 en Madrid
    const zones = new InMemoryUserTimeZoneRepository();
    const alerts = new InMemoryAlertRepository(clock);
    await zones.record('user-1', 'Europe/Madrid');
    const tasks = {
      find: async () => [{ id: 'task-1', title: 'Llamar al banco', date: LocalDate.parse('2026-10-21') }],
    };
    const generate = new GenerateDueAlertUseCase(clock, new IntlTimeZoneAdapter(), zones, alerts, tasks);
    scheduler = new AlertScheduler(generate, INTERVAL);

    scheduler.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(alerts.all()).toEqual([]);

    // El reloj de la aplicación avanza al mismo ritmo que los temporizadores
    for (let minute = 0; minute < 5 && alerts.all().length === 0; minute++) {
      clock.advance(INTERVAL);
      await jest.advanceTimersByTimeAsync(INTERVAL);
    }

    const [alert] = alerts.all();
    expect(alert?.type).toBe('daily');
    expect(alert!.createdAt.getTime()).toBeLessThanOrEqual(new Date('2026-10-21T20:05:00Z').getTime());
  });
});
