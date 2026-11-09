import { FakeClock } from '../../../../../tests/support/fake-clock.adapter.js';
import { InMemoryPomodoroRepository } from '../../../../../tests/support/in-memory-pomodoro.repository.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { Pagination } from '../../../../shared/domain/pagination.value-object.js';
import { IntlTimeZoneAdapter } from '../../../../shared/infrastructure/time/intl-time-zone.adapter.js';
import { Pomodoro } from '../../domain/pomodoro.entity.js';
import type { UserTimeZoneSource } from '../../domain/user-time-zone.port.js';
import { SettleDuePomodoroUseCase } from '../settle-due-pomodoro.use-case.js';

const MINUTE = 60_000;
// 23:50 en Madrid (UTC+1 en noviembre)
const START = '2026-11-08T22:50:00Z';
const day = (value: string) => LocalDate.parse(value);

// Zonas recordadas que controla el test
class FakeZones implements UserTimeZoneSource {
  readonly zones = new Map<string, string>();

  async find(userId: string): Promise<string | null> {
    return this.zones.get(userId) ?? null;
  }
}

describe('SettleDuePomodoroUseCase', () => {
  let clock: FakeClock;
  let repository: InMemoryPomodoroRepository;
  let zones: FakeZones;
  let useCase: SettleDuePomodoroUseCase;

  beforeEach(() => {
    clock = new FakeClock(START);
    repository = new InMemoryPomodoroRepository();
    zones = new FakeZones();
    zones.zones.set('user-1', 'Europe/Madrid');
    useCase = new SettleDuePomodoroUseCase(repository, zones, new IntlTimeZoneAdapter(), clock);
  });

  // Sesión de `minutes` minutos que empieza ahora, con tareas en ese orden; las indicadas, completadas
  async function startSession(userId = 'user-1', minutes = 25, titles: string[] = [], completed: string[] = []) {
    return repository.transaction(async (unit) => {
      const pomodoro = await unit.createPomodoro(Pomodoro.plan(userId, minutes, clock.now()));
      const tasks = await unit.createTasks(
        titles.map((title, index) => ({
          userId,
          pomodoroId: pomodoro.id,
          title,
          description: null,
          date: day('2026-11-08'),
          position: index + 1,
        })),
      );
      for (const task of tasks) if (completed.includes(task.title)) task.complete(clock.now());
      await unit.saveTasks(tasks);
      return pomodoro;
    });
  }

  it('asienta una sesión vencida: termina por tiempo en su fin previsto con toda la concentración (RF-15, RF-33)', async () => {
    const pomodoro = await startSession();
    clock.advance(40 * MINUTE);
    await useCase.forUser('user-1');
    const settled = await repository.findById('user-1', pomodoro.id);
    expect(settled).toMatchObject({ status: 'finished', endReason: 'time', focusedSeconds: 1500 });
    expect(settled?.finishedAt).toEqual(new Date(new Date(START).getTime() + 25 * MINUTE));
  });

  it('las pendientes pasan a espera y las completadas se quedan en la sesión (RF-23, RF-35)', async () => {
    const pomodoro = await startSession('user-1', 25, ['A', 'B', 'C'], ['B']);
    clock.advance(25 * MINUTE);
    await useCase.forUser('user-1');
    const waiting = await repository.findWaitingPage('user-1', new Pagination(1, 50));
    expect(waiting.items.map((task) => task.title)).toEqual(['A', 'C']);
    expect((await repository.findTasksOf(pomodoro.id)).map((task) => task.title)).toEqual(['B']);
  });

  it('guarda la foto de todas las tareas en el orden de la sesión (RF-16, RF-64)', async () => {
    const pomodoro = await startSession('user-1', 25, ['A', 'B', 'C'], ['B']);
    clock.advance(25 * MINUTE);
    await useCase.forUser('user-1');
    const snapshot = (await repository.findById('user-1', pomodoro.id))?.snapshot ?? [];
    expect(snapshot.map((task) => [task.title, task.completed])).toEqual([
      ['A', false],
      ['B', true],
      ['C', false],
    ]);
  });

  it('el día del fin es el local de la zona recordada: 23:50 + 25 min en Madrid → día siguiente (RF-40)', async () => {
    const pomodoro = await startSession();
    clock.advance(25 * MINUTE);
    await useCase.forUser('user-1');
    expect((await repository.findById('user-1', pomodoro.id))?.finishedOn).toEqual(day('2026-11-09'));
  });

  it('con otra zona recordada el mismo instante cae en otro día (RF-40)', async () => {
    zones.zones.set('user-1', 'America/New_York');
    const pomodoro = await startSession();
    clock.advance(25 * MINUTE);
    await useCase.forUser('user-1');
    expect((await repository.findById('user-1', pomodoro.id))?.finishedOn).toEqual(day('2026-11-08'));
  });

  it('no toca sesiones que aún no han vencido ni sesiones pausadas (RF-15, RF-60)', async () => {
    const running = await startSession('user-1', 25);
    clock.advance(24 * MINUTE);
    await useCase.forUser('user-1');
    expect((await repository.findById('user-1', running.id))?.status).toBe('running');

    await repository.transaction(async (unit) => {
      const locked = await unit.lockPomodoro('user-1', running.id);
      locked?.pause(clock.now());
      if (locked) await unit.savePomodoro(locked);
    });
    clock.advance(24 * 60 * MINUTE);
    await useCase.forUser('user-1');
    expect(await useCase.dueBatch()).toBe(0);
    expect((await repository.findById('user-1', running.id))?.status).toBe('paused');
  });

  it('es idempotente: asentar dos veces no cambia nada (R-4)', async () => {
    const pomodoro = await startSession('user-1', 25, ['A']);
    clock.advance(30 * MINUTE);
    await useCase.forUser('user-1');
    const first = (await repository.findById('user-1', pomodoro.id))?.toProps();
    clock.advance(30 * MINUTE);
    await useCase.forUser('user-1');
    expect(await useCase.dueBatch()).toBe(0);
    expect((await repository.findById('user-1', pomodoro.id))?.toProps()).toEqual(first);
  });

  it('dueBatch asienta las vencidas de todos los usuarios en varios lotes (D-2)', async () => {
    useCase = new SettleDuePomodoroUseCase(repository, zones, new IntlTimeZoneAdapter(), clock, 2);
    const users = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];
    for (const userId of users) {
      zones.zones.set(userId, 'Europe/Madrid');
      await startSession(userId, 1);
    }
    clock.advance(2 * MINUTE);
    expect(await useCase.dueBatch()).toBe(5);
    expect(await repository.findDue(clock.now(), 100)).toEqual([]);
  });

  it('un usuario sin zona recordada usa UTC para el día del fin', async () => {
    const pomodoro = await startSession('user-sin-zona');
    clock.advance(25 * MINUTE);
    await useCase.forUser('user-sin-zona');
    expect((await repository.findById('user-sin-zona', pomodoro.id))?.finishedOn).toEqual(day('2026-11-08'));
  });
  it('al asentar desbloquea los logros alcanzados con el fin de la sesión (RF-44)', async () => {
    const pomodoro = await startSession('user-1', 25);
    clock.advance(40 * MINUTE);
    await useCase.forUser('user-1');
    const unlocked = await repository.achievements.listUnlocked('user-1');
    expect(unlocked).toEqual([{ code: 'FIRST_POMODORO', unlockedAt: pomodoro.endsAt }]);
  });
});
