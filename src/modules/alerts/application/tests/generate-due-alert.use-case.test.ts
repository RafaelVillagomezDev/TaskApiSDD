import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { InMemoryAlertRepository } from '../../../../../tests/support/in-memory-alert.repository.js';
import { InMemoryUserTimeZoneRepository } from '../../../../../tests/support/in-memory-user-time-zone.repository.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { IntlTimeZoneAdapter } from '../../../../shared/infrastructure/time/intl-time-zone.adapter.js';
import type { Alert, AlertTask } from '../../domain/alert.entity.js';
import type { PendingTaskSource } from '../../domain/pending-task.port.js';
import { GenerateDueAlertUseCase } from '../generate-due-alert.use-case.js';

const day = (value: string) => LocalDate.parse(value);

interface FakeTask {
  userId: string;
  id: string;
  title: string;
  date: LocalDate;
  completed: boolean;
}

// Tareas de prueba vistas a través del puerto del módulo alerts
class FakePendingTasks implements PendingTaskSource {
  readonly rows: FakeTask[] = [];

  add(date: string, options: { userId?: string; title?: string; completed?: boolean } = {}): FakeTask {
    const row = {
      userId: options.userId ?? 'user-1',
      id: `task-${this.rows.length + 1}`,
      title: options.title ?? `Tarea ${date}`,
      date: day(date),
      completed: options.completed ?? false,
    };
    this.rows.push(row);
    return row;
  }

  async find(userId: string, from: LocalDate, to: LocalDate): Promise<AlertTask[]> {
    return this.rows
      .filter((row) => row.userId === userId && !row.completed && !row.date.isBefore(from) && !row.date.isAfter(to))
      .map(({ id, title, date }) => ({ id, title, date }));
  }
}

const summary = (alert: Alert) => ({
  type: alert.type,
  periodStart: alert.periodStart.toString(),
  periodEnd: alert.periodEnd.toString(),
  tasks: alert.tasks.map((task) => task.title),
});

describe('GenerateDueAlertUseCase', () => {
  let clock: FakeClock;
  let zones: InMemoryUserTimeZoneRepository;
  let alerts: InMemoryAlertRepository;
  let tasks: FakePendingTasks;
  let useCase: GenerateDueAlertUseCase;

  // Ejecuta una pasada del planificador en ese instante UTC
  const passAt = (instant: string) => {
    clock.set(instant);
    return useCase.execute();
  };
  const byType = (type: string) => alerts.all().filter((alert) => alert.type === type);

  beforeEach(async () => {
    clock = new FakeClock('2026-10-21T10:00:00Z');
    zones = new InMemoryUserTimeZoneRepository();
    alerts = new InMemoryAlertRepository(clock);
    tasks = new FakePendingTasks();
    useCase = new GenerateDueAlertUseCase(clock, new IntlTimeZoneAdapter(), zones, alerts, tasks);
    await zones.record('user-1', 'Europe/Madrid');
  });

  it('a las 22:00 locales registra el aviso diario con las pendientes de ese día (RF-24)', async () => {
    tasks.add('2026-10-21', { title: 'Llamar al banco' });
    tasks.add('2026-10-21', { title: 'Comprar pan' });
    tasks.add('2026-10-21', { title: 'Hecha', completed: true });
    tasks.add('2026-10-22', { title: 'Mañana' });
    tasks.add('2026-10-21', { title: 'Ajena', userId: 'user-2' });

    await passAt('2026-10-21T19:59:00Z'); // 21:59 en Madrid
    expect(alerts.all()).toEqual([]);

    const result = await passAt('2026-10-21T20:00:00Z'); // 22:00 en Madrid
    expect(result).toEqual({ users: 1, created: 1 });
    expect(alerts.all().map(summary)).toEqual([
      { type: 'daily', periodStart: '2026-10-21', periodEnd: '2026-10-21', tasks: ['Llamar al banco', 'Comprar pan'] },
    ]);
    expect(alerts.all()[0]?.createdAt.toISOString()).toBe('2026-10-21T20:00:00.000Z');
  });

  it('el viernes registra el semanal con las pendientes de viernes a domingo (RF-25)', async () => {
    tasks.add('2026-10-22');
    tasks.add('2026-10-23');
    tasks.add('2026-10-24');
    tasks.add('2026-10-25');
    tasks.add('2026-10-26');

    await passAt('2026-10-23T20:00:00Z');

    expect(byType('weekly').map(summary)).toEqual([
      {
        type: 'weekly',
        periodStart: '2026-10-19',
        periodEnd: '2026-10-25',
        tasks: ['Tarea 2026-10-23', 'Tarea 2026-10-24', 'Tarea 2026-10-25'],
      },
    ]);
    expect(byType('daily').map(summary)[0]?.tasks).toEqual(['Tarea 2026-10-23']);
  });

  it('el primero de los 3 últimos días registra el mensual con las pendientes de esos días (RF-26)', async () => {
    tasks.add('2026-10-28');
    tasks.add('2026-10-29');
    tasks.add('2026-10-31');

    await passAt('2026-10-29T21:00:00Z'); // 22:00 en Madrid, ya en horario de invierno (+01:00)

    expect(byType('monthly').map(summary)).toEqual([
      { type: 'monthly', periodStart: '2026-10-01', periodEnd: '2026-10-31', tasks: ['Tarea 2026-10-29', 'Tarea 2026-10-31'] },
    ]);
  });

  it('sin pendientes omite el aviso y no reevalúa el periodo aunque después se creen tareas (RF-27)', async () => {
    tasks.add('2026-10-21', { completed: true });
    expect(await passAt('2026-10-21T20:00:00Z')).toEqual({ users: 1, created: 0 });

    tasks.add('2026-10-21', { title: 'Creada después' });
    await passAt('2026-10-21T20:30:00Z');

    expect(alerts.all()).toEqual([]);
  });

  it('no duplica avisos aunque la pasada se repita (RF-28)', async () => {
    tasks.add('2026-10-21');
    await passAt('2026-10-21T20:00:00Z');
    await passAt('2026-10-21T20:01:00Z');
    tasks.add('2026-10-21', { title: 'Creada después de las 22:00' });
    await passAt('2026-10-21T20:02:00Z');

    expect(alerts.all().map(summary)).toEqual([
      { type: 'daily', periodStart: '2026-10-21', periodEnd: '2026-10-21', tasks: ['Tarea 2026-10-21'] },
    ]);
  });

  it('un usuario sin zona recordada no recibe avisos (RF-36)', async () => {
    tasks.add('2026-10-21', { userId: 'sin-zona' });
    expect(await passAt('2026-10-21T20:00:00Z')).toEqual({ users: 1, created: 0 });
    expect(alerts.all().filter((alert) => alert.userId === 'sin-zona')).toEqual([]);
  });

  it('usa la zona recordada de cada usuario (RF-35)', async () => {
    await zones.record('user-ny', 'America/New_York');
    tasks.add('2026-10-21', { userId: 'user-ny' });

    await passAt('2026-10-21T20:00:00Z'); // 16:00 en Nueva York
    expect(alerts.all()).toEqual([]);

    await passAt('2026-10-22T02:00:00Z'); // 22:00 del 21 en Nueva York
    expect(alerts.all().map((alert) => [alert.userId, alert.type, alert.periodStart.toString()])).toEqual([
      ['user-ny', 'daily', '2026-10-21'],
    ]);
  });

  it('calcula las 22:00 con la zona IANA el día del cambio de hora (RF-35)', async () => {
    tasks.add('2026-10-25'); // Madrid pasa de +02:00 a +01:00 esa madrugada

    await passAt('2026-10-25T20:00:00Z'); // 21:00 locales: con un desfase fijo de +02:00 serían las 22:00
    expect(byType('daily')).toEqual([]);

    await passAt('2026-10-25T21:00:00Z'); // 22:00 locales
    expect(byType('daily').map(summary)).toEqual([
      { type: 'daily', periodStart: '2026-10-25', periodEnd: '2026-10-25', tasks: ['Tarea 2026-10-25'] },
    ]);
  });

  it('el aviso guarda una copia que no cambia al completar, editar o borrar sus tareas (RF-30)', async () => {
    const task = tasks.add('2026-10-21', { title: 'Original' });
    await passAt('2026-10-21T20:00:00Z');

    task.completed = true;
    task.title = 'Cambiada';
    tasks.rows.length = 0;

    expect(alerts.all().map(summary)[0]?.tasks).toEqual(['Original']);
    expect(alerts.all()[0]?.tasks[0]?.id).toBe(task.id);
  });

  it('registra los tres avisos el mismo día cuando coinciden (2027-01-29, viernes) (CE-04)', async () => {
    tasks.add('2027-01-29');
    tasks.add('2027-01-30');
    tasks.add('2027-01-31');

    const result = await passAt('2027-01-29T21:00:00Z');

    expect(result.created).toBe(3);
    expect(alerts.all().map(summary)).toEqual([
      { type: 'daily', periodStart: '2027-01-29', periodEnd: '2027-01-29', tasks: ['Tarea 2027-01-29'] },
      {
        type: 'weekly',
        periodStart: '2027-01-25',
        periodEnd: '2027-01-31',
        tasks: ['Tarea 2027-01-29', 'Tarea 2027-01-30', 'Tarea 2027-01-31'],
      },
      {
        type: 'monthly',
        periodStart: '2027-01-01',
        periodEnd: '2027-01-31',
        tasks: ['Tarea 2027-01-29', 'Tarea 2027-01-30', 'Tarea 2027-01-31'],
      },
    ]);
  });

  describe('recuperación tras una parada (RF-47)', () => {
    it('el aviso diario se registra al volver si el día no ha terminado', async () => {
      tasks.add('2026-10-21');
      await passAt('2026-10-21T21:15:00Z'); // 23:15 en Madrid
      expect(byType('daily')).toHaveLength(1);
    });

    it('el aviso diario se descarta si se vuelve al día siguiente', async () => {
      tasks.add('2026-10-21');
      await passAt('2026-10-21T22:10:00Z'); // 00:10 del 22 en Madrid
      expect(alerts.all()).toEqual([]);
    });

    it('parado el viernes a las 22:00 y de vuelta el sábado: semanal solo con sábado y domingo', async () => {
      tasks.add('2026-10-23');
      tasks.add('2026-10-24');
      tasks.add('2026-10-25');

      await passAt('2026-10-24T08:00:00Z'); // sábado a las 10:00 en Madrid

      expect(alerts.all().map(summary)).toEqual([
        { type: 'weekly', periodStart: '2026-10-19', periodEnd: '2026-10-25', tasks: ['Tarea 2026-10-24', 'Tarea 2026-10-25'] },
      ]);
    });
  });

  it('recorre todos los usuarios con zona por lotes (RF-36)', async () => {
    const batched = new GenerateDueAlertUseCase(clock, new IntlTimeZoneAdapter(), zones, alerts, tasks, 2);
    for (const userId of ['user-2', 'user-3', 'user-4', 'user-5']) {
      await zones.record(userId, 'Europe/Madrid');
    }
    for (const userId of ['user-1', 'user-2', 'user-3', 'user-4', 'user-5']) {
      tasks.add('2026-10-21', { userId });
    }

    clock.set('2026-10-21T20:00:00Z');
    expect(await batched.execute()).toEqual({ users: 5, created: 5 });
    expect(new Set(alerts.all().map((alert) => alert.userId)).size).toBe(5);
  });
});
