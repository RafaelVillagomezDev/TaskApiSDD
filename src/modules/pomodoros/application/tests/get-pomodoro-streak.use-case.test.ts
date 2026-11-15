import {
  createPomodoroFixture,
  day,
  MINUTE,
  pomodoroContext as context,
} from '../../../../../tests/support/pomodoro-use-case.fixture.js';
import { GetPomodoroStreakUseCase } from '../get-pomodoro-streak.use-case.js';

describe('GetPomodoroStreakUseCase', () => {
  let fixture: ReturnType<typeof createPomodoroFixture>;
  let useCase: GetPomodoroStreakUseCase;

  beforeEach(() => {
    fixture = createPomodoroFixture('2026-11-06T09:00:00Z');
    useCase = new GetPomodoroStreakUseCase(fixture.repository, fixture.settle);
  });

  // Una sesión de 1 minuto terminada por tiempo (o a mano) el día de `iso`
  async function sessionOn(iso: string, byTime = true): Promise<void> {
    fixture.clock.set(iso);
    const { pomodoro } = await fixture.startWith([], 1, [], { ...context, today: day(iso.slice(0, 10)) });
    if (byTime) {
      fixture.clock.advance(MINUTE);
      await fixture.settle.forUser(context.userId);
    } else {
      await fixture.changeStatus.execute(context, pomodoro.id, 'finished');
    }
  }

  const today = (date: string) => ({ ...context, today: day(date) });

  it('sin sesiones → { current: 0, best: 0 }', async () => {
    expect(await useCase.execute(today('2026-11-08'))).toMatchObject({ current: 0, best: 0 });
  });

  it('una terminada por tiempo hoy y otra ayer → racha actual 2 (RF-38, RF-41)', async () => {
    await sessionOn('2026-11-07T09:00:00Z');
    await sessionOn('2026-11-08T09:00:00Z');
    expect(await useCase.execute(today('2026-11-08'))).toMatchObject({ current: 2, best: 2 });
  });

  it('ayer y anteayer y nada hoy → racha actual 2: hoy aún no ha terminado (RF-41)', async () => {
    await sessionOn('2026-11-06T09:00:00Z');
    await sessionOn('2026-11-07T09:00:00Z');
    expect(await useCase.execute(today('2026-11-08'))).toMatchObject({ current: 2, best: 2 });
  });

  it('las terminadas a mano no cuentan (RF-38)', async () => {
    await sessionOn('2026-11-08T09:00:00Z', false);
    expect(await useCase.execute(today('2026-11-08'))).toMatchObject({ current: 0, best: 0 });
  });

  it('un hueco rompe la racha actual pero no la mejor (RF-41)', async () => {
    await sessionOn('2026-11-01T09:00:00Z');
    await sessionOn('2026-11-02T09:00:00Z');
    await sessionOn('2026-11-03T09:00:00Z');
    await sessionOn('2026-11-08T09:00:00Z');
    expect(await useCase.execute(today('2026-11-08'))).toMatchObject({ current: 1, best: 3 });
  });

  it('asienta antes la sesión vencida: cuenta aunque el barrido no haya pasado (RF-15)', async () => {
    fixture.clock.set('2026-11-08T09:00:00Z');
    await fixture.startWith([], 1, [], today('2026-11-08'));
    fixture.clock.advance(MINUTE);
    expect(await useCase.execute(today('2026-11-08'))).toMatchObject({ current: 1, best: 1 });
  });

  it('una sesión cuenta para el día local de su fin, aunque se asiente después de medianoche (RF-40)', async () => {
    // Empieza a las 23:30 del día 7 en Madrid y termina a las 23:31; se asienta a las 00:15 del día 8
    fixture.clock.set('2026-11-07T22:30:00Z');
    await fixture.startWith([], 1, [], today('2026-11-07'));
    fixture.clock.set('2026-11-07T23:15:00Z');
    await fixture.settle.forUser(context.userId);
    // Si contara para el día 8, el día 9 la racha actual seguiría viva
    expect(await useCase.execute(today('2026-11-09'))).toMatchObject({ current: 0, best: 1 });
  });

  it('no cuenta las sesiones de otros usuarios (RF-01)', async () => {
    await sessionOn('2026-11-08T09:00:00Z');
    expect(await useCase.execute({ ...today('2026-11-08'), userId: 'user-2' })).toMatchObject({ current: 0 });
  });
});
