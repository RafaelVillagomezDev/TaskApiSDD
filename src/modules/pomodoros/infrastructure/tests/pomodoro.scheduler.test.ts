import { PomodoroScheduler } from '../pomodoro.scheduler.js';

const jest = import.meta.jest;
const INTERVAL = 60_000;

describe('PomodoroScheduler', () => {
  let scheduler: PomodoroScheduler | undefined;

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

  const fakeSettle = (implementation: () => Promise<number>) => ({ dueBatch: jest.fn(implementation) });

  it('asienta al arrancar y después cada 60 s (RF-15; plan, D-2)', async () => {
    const settle = fakeSettle(async () => 0);
    scheduler = new PomodoroScheduler(settle, INTERVAL);

    scheduler.start();
    expect(settle.dueBatch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2 * INTERVAL);
    expect(settle.dueBatch).toHaveBeenCalledTimes(3);
  });

  it('solo registra las pasadas que asientan alguna sesión', async () => {
    let settled = 0;
    const settle = fakeSettle(async () => settled);
    scheduler = new PomodoroScheduler(settle, INTERVAL);

    scheduler.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(console.log).not.toHaveBeenCalled();

    settled = 3;
    await jest.advanceTimersByTimeAsync(INTERVAL);
    expect(console.log).toHaveBeenCalledWith(JSON.stringify({ event: 'POMODORO_SETTLE_COMPLETED', settled: 3 }));
  });

  it('un fallo se registra como POMODORO_SETTLE_FAILED y no detiene el barrido', async () => {
    const settle = fakeSettle(async () => {
      throw new Error('base de datos caída');
    });
    scheduler = new PomodoroScheduler(settle, INTERVAL);

    scheduler.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('POMODORO_SETTLE_FAILED'));
    await jest.advanceTimersByTimeAsync(INTERVAL);
    expect(settle.dueBatch).toHaveBeenCalledTimes(2);
  });

  it('stop detiene el barrido', async () => {
    const settle = fakeSettle(async () => 0);
    scheduler = new PomodoroScheduler(settle, INTERVAL);
    scheduler.start();
    scheduler.stop();
    await jest.advanceTimersByTimeAsync(5 * INTERVAL);
    expect(settle.dueBatch).toHaveBeenCalledTimes(1);
  });
});
