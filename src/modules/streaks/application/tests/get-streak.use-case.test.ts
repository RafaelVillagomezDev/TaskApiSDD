import type { RequestContext } from '../../../../shared/application/request-context.type.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import type { ProductiveDateSource } from '../../domain/productive-date.port.js';
import { GetStreakUseCase } from '../get-streak.use-case.js';

// Fuente falsa: días productivos fijos y registro de la última consulta
class FakeProductiveDateSource implements ProductiveDateSource {
  lastQuery?: { userId: string; until: string };

  constructor(private readonly dates: string[]) {}

  async findUntil(userId: string, until: LocalDate): Promise<LocalDate[]> {
    this.lastQuery = { userId, until: until.toString() };
    return this.dates.map((value) => LocalDate.parse(value)).filter((date) => !date.isAfter(until));
  }
}

const contextOn = (today: string): RequestContext => ({
  userId: 'user-1',
  sessionId: 'session-1',
  today: LocalDate.parse(today),
  timeZone: 'Europe/Madrid',
});

describe('GetStreakUseCase', () => {
  it('hoy productivo: la racha termina hoy (RF-19)', async () => {
    const useCase = new GetStreakUseCase(new FakeProductiveDateSource(['2026-10-23', '2026-10-24']));
    expect(await useCase.execute(contextOn('2026-10-24'))).toMatchObject({ current: 2, best: 2 });
  });

  it('hoy aún no productivo: la racha se cuenta hasta ayer (RF-20)', async () => {
    const useCase = new GetStreakUseCase(new FakeProductiveDateSource(['2026-10-22', '2026-10-23']));
    expect(await useCase.execute(contextOn('2026-10-24'))).toMatchObject({ current: 2, best: 2 });
  });

  it('consulta los días productivos del usuario hasta su día actual (RF-23)', async () => {
    const source = new FakeProductiveDateSource([]);
    await new GetStreakUseCase(source).execute(contextOn('2026-10-25'));
    expect(source.lastQuery).toEqual({ userId: 'user-1', until: '2026-10-25' });
  });

  it('los días pasados no cambian el resultado: misma racha con el mismo historial (RF-22)', async () => {
    const source = new FakeProductiveDateSource(['2026-10-01', '2026-10-02', '2026-10-03']);
    const first = await new GetStreakUseCase(source).execute(contextOn('2026-10-10'));
    const second = await new GetStreakUseCase(source).execute(contextOn('2026-10-10'));
    expect(first).toEqual(second);
    expect(first).toMatchObject({ current: 0, best: 3 });
  });
});
