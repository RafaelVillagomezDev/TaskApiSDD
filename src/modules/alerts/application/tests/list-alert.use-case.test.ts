import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { InMemoryAlertRepository } from '../../../../../tests/support/in-memory-alert.repository.js';
import type { RequestContext } from '../../../../shared/application/request-context.type.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { Pagination } from '../../../../shared/domain/pagination.value-object.js';
import { ListAlertsUseCase } from '../list-alert.use-case.js';

const context: RequestContext = { userId: 'user-1', today: LocalDate.parse('2026-10-24'), timeZone: 'Europe/Madrid' };
const day = (value: string) => LocalDate.parse(value);

describe('ListAlertsUseCase', () => {
  let clock: FakeClock;
  let alerts: InMemoryAlertRepository;
  let useCase: ListAlertsUseCase;

  // Registra un aviso diario del día indicado, un minuto después del anterior
  const seed = async (date: string, userId = 'user-1') => {
    clock.advance(60_000);
    await alerts.claimPeriod({ userId, type: 'daily', periodStart: day(date), periodEnd: day(date) }, async () => [
      { id: `task-${date}`, title: `Tarea ${date}`, date: day(date) },
    ]);
  };

  beforeEach(() => {
    clock = new FakeClock('2026-10-20T20:00:00Z');
    alerts = new InMemoryAlertRepository(clock);
    useCase = new ListAlertsUseCase(alerts);
  });

  it('devuelve los avisos del más reciente al más antiguo (RF-29)', async () => {
    await seed('2026-10-20');
    await seed('2026-10-21');
    await seed('2026-10-22');
    const page = await useCase.execute(context, new Pagination(1, 50));
    expect(page.items.map((alert) => alert.periodStart.toString())).toEqual(['2026-10-22', '2026-10-21', '2026-10-20']);
    expect(page).toMatchObject({ page: 1, pageSize: 50, totalItems: 3, totalPages: 1 });
  });

  it('pagina y devuelve items vacío fuera de rango (RF-39)', async () => {
    await seed('2026-10-20');
    await seed('2026-10-21');
    await seed('2026-10-22');
    const second = await useCase.execute(context, new Pagination(2, 2));
    expect(second.items.map((alert) => alert.periodStart.toString())).toEqual(['2026-10-20']);
    expect(second).toMatchObject({ totalItems: 3, totalPages: 2 });
    expect((await useCase.execute(context, new Pagination(3, 2))).items).toEqual([]);
  });

  it('solo devuelve los avisos del usuario (RF-02)', async () => {
    await seed('2026-10-20', 'user-2');
    const page = await useCase.execute(context, new Pagination(1, 50));
    expect(page).toMatchObject({ items: [], totalItems: 0, totalPages: 0 });
  });
});
