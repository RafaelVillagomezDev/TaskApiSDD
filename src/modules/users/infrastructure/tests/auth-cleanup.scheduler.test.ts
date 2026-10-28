import { AuthCleanupScheduler } from '../auth-cleanup.scheduler.js';

const jest = import.meta.jest;
const INTERVAL = 60_000;

describe('AuthCleanupScheduler', () => {
  let scheduler: AuthCleanupScheduler | undefined;

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

  it('hace una pasada al arrancar y otra cada minuto (D-12)', async () => {
    const purge = { execute: jest.fn(async () => undefined) };
    scheduler = new AuthCleanupScheduler(purge, INTERVAL);
    scheduler.start();
    expect(purge.execute).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2 * INTERVAL);
    expect(purge.execute).toHaveBeenCalledTimes(3);
  });

  it('registra solo la pasada inicial, para no llenar el log cada minuto', async () => {
    scheduler = new AuthCleanupScheduler({ execute: async () => undefined }, INTERVAL);
    scheduler.start();
    await jest.advanceTimersByTimeAsync(3 * INTERVAL);
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('AUTH_CLEANUP_COMPLETED'));
  });

  it('no solapa pasadas: si la anterior sigue en curso, se salta el intervalo', async () => {
    let finish: () => void = () => undefined;
    const purge = { execute: jest.fn(() => new Promise<void>((resolve) => (finish = resolve))) };
    scheduler = new AuthCleanupScheduler(purge, INTERVAL);
    scheduler.start();
    await jest.advanceTimersByTimeAsync(3 * INTERVAL);
    expect(purge.execute).toHaveBeenCalledTimes(1);
    finish();
    await jest.advanceTimersByTimeAsync(INTERVAL);
    expect(purge.execute).toHaveBeenCalledTimes(2);
  });

  it('un fallo se registra en consola y no detiene el planificador', async () => {
    const purge = {
      execute: jest.fn(async () => {
        throw new Error('base de datos caída');
      }),
    };
    scheduler = new AuthCleanupScheduler(purge, INTERVAL);
    scheduler.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('AUTH_CLEANUP_FAILED'));
    await jest.advanceTimersByTimeAsync(INTERVAL);
    expect(purge.execute).toHaveBeenCalledTimes(2);
  });

  it('stop detiene las pasadas y start dos veces no duplica el temporizador', async () => {
    const purge = { execute: jest.fn(async () => undefined) };
    scheduler = new AuthCleanupScheduler(purge, INTERVAL);
    scheduler.start();
    scheduler.start();
    await jest.advanceTimersByTimeAsync(INTERVAL);
    expect(purge.execute).toHaveBeenCalledTimes(2);
    scheduler.stop();
    await jest.advanceTimersByTimeAsync(5 * INTERVAL);
    expect(purge.execute).toHaveBeenCalledTimes(2);
  });
});
