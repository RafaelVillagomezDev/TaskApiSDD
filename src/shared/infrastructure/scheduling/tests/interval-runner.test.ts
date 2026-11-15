import { IntervalRunner } from '../interval-runner.js';

const jest = import.meta.jest;
const INTERVAL = 60_000;
const FAILURE_EVENT = 'TEST_TASK_FAILED';

describe('IntervalRunner', () => {
  let runner: IntervalRunner | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    runner?.stop();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('ejecuta la tarea al arrancar y después en cada intervalo', async () => {
    const task = jest.fn(async () => undefined);
    runner = new IntervalRunner(task, INTERVAL, FAILURE_EVENT);
    runner.start();
    expect(task).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2 * INTERVAL);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('no solapa ejecuciones: salta los intervalos mientras la anterior sigue en curso', async () => {
    let finish: () => void = () => undefined;
    const task = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    runner = new IntervalRunner(task, INTERVAL, FAILURE_EVENT);
    runner.start();
    await jest.advanceTimersByTimeAsync(3 * INTERVAL);
    expect(task).toHaveBeenCalledTimes(1);
    finish();
    await jest.advanceTimersByTimeAsync(INTERVAL);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('un fallo se registra con su evento y no deja el ejecutor bloqueado', async () => {
    const task = jest.fn(() => Promise.reject(new Error('base de datos caída')));
    runner = new IntervalRunner(task, INTERVAL, FAILURE_EVENT);
    runner.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(console.error).toHaveBeenCalledWith(
      JSON.stringify({ event: FAILURE_EVENT, message: 'base de datos caída' }),
    );
    await jest.advanceTimersByTimeAsync(INTERVAL);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('start dos veces no duplica el temporizador y stop lo detiene', async () => {
    const task = jest.fn(async () => undefined);
    runner = new IntervalRunner(task, INTERVAL, FAILURE_EVENT);
    runner.start();
    runner.start();
    await jest.advanceTimersByTimeAsync(INTERVAL);
    expect(task).toHaveBeenCalledTimes(2);
    runner.stop();
    await jest.advanceTimersByTimeAsync(5 * INTERVAL);
    expect(task).toHaveBeenCalledTimes(2);
  });
});
