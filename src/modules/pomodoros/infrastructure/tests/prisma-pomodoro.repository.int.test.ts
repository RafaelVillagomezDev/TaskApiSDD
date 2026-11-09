import { PrismaClient } from '@prisma/client';

import { createTestUser } from '../../../../../tests/integration/test-database.helper.js';
import { AppError } from '../../../../shared/domain/app.error.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { Pagination } from '../../../../shared/domain/pagination.value-object.js';
import type { NewPomodoroTask } from '../../domain/pomodoro-task.entity.js';
import { Pomodoro } from '../../domain/pomodoro.entity.js';
import { PrismaPomodoroRepository } from '../prisma-pomodoro.repository.js';

const prisma = new PrismaClient();
const repository = new PrismaPomodoroRepository(prisma);
const MINUTE = 60_000;
const START = new Date('2026-11-08T09:00:00Z');
const at = (minutes: number) => new Date(START.getTime() + minutes * MINUTE);
const day = (value: string) => LocalDate.parse(value);

describe('PrismaPomodoroRepository', () => {
  let userId: string;

  // Sin vaciar tablas: pomodoros y pomodoro_tasks las usa también prisma-achievement.repository.int.test.ts, que se
  // ejecuta en paralelo. Cada test crea sus propios usuarios y solo mira sus datos; global.setup vacía las cuentas,
  // con sus sesiones en cascada, una vez por ejecución
  beforeEach(async () => {
    userId = await createTestUser(prisma, 'pomodoro');
  });
  afterAll(() => prisma.$disconnect());

  const start = (owner = userId, minutes = 25, now = START) =>
    repository.transaction((unit) => unit.createPomodoro(Pomodoro.plan(owner, minutes, now)));

  const newTask = (pomodoroId: string, position: number, title: string, date = '2026-11-08'): NewPomodoroTask => ({
    userId,
    pomodoroId,
    title,
    description: null,
    date: day(date),
    position,
  });

  it('crea la sesión en curso y la devuelve con sus datos (RF-08)', async () => {
    const pomodoro = await start();
    expect(pomodoro.status).toBe('running');
    expect(pomodoro.endsAt).toEqual(at(25));
    expect(await repository.findById(userId, pomodoro.id)).toMatchObject({ id: pomodoro.id });
  });

  it('una sola sesión activa por usuario: la segunda → POMODORO_ALREADY_ACTIVE (RF-12, D-3)', async () => {
    await start();
    await expect(start()).rejects.toThrow(AppError);
    await expect(start()).rejects.toMatchObject({ code: 'POMODORO_ALREADY_ACTIVE' });
    const other = await createTestUser(prisma, 'otro');
    await expect(start(other)).resolves.toBeDefined();
  });

  it('al terminar, active_user_id queda libre y se puede empezar otra (RF-12)', async () => {
    const first = await start();
    await repository.transaction(async (unit) => {
      const locked = await unit.lockPomodoro(userId, first.id);
      locked?.finishManually(at(10), { finishedOn: day('2026-11-08'), snapshot: [] });
      if (locked) await unit.savePomodoro(locked);
    });
    await expect(start(userId, 25, at(11))).resolves.toBeDefined();
  });

  it('lockPomodoro no devuelve sesiones de otro usuario ni ids no UUID', async () => {
    const pomodoro = await start();
    const other = await createTestUser(prisma, 'otro');
    await repository.transaction(async (unit) => {
      expect(await unit.lockPomodoro(other, pomodoro.id)).toBeNull();
      expect(await unit.lockPomodoro(userId, 'no-es-un-uuid')).toBeNull();
      expect((await unit.lockActivePomodoro(userId))?.id).toBe(pomodoro.id);
    });
    expect(await repository.findById(other, pomodoro.id)).toBeNull();
    expect(await repository.findById(userId, 'no-es-un-uuid')).toBeNull();
  });

  it('dos asentamientos simultáneos de la misma sesión: solo uno la termina (R-4, D-4)', async () => {
    const pomodoro = await start();
    const settle = () =>
      repository.transaction(async (unit) => {
        const locked = await unit.lockPomodoro(userId, pomodoro.id);
        if (!locked?.isDue(at(30))) return false;
        locked.finishByTime(at(30), { finishedOn: day('2026-11-08'), snapshot: [] });
        await unit.savePomodoro(locked);
        return true;
      });
    const results = await Promise.all([settle(), settle()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repository.findById(userId, pomodoro.id)).toMatchObject({ status: 'finished', endReason: 'time' });
  });

  it('pausar y reanudar guardan ends_at y remaining_ms (RF-30, RF-31)', async () => {
    const pomodoro = await start();
    await repository.transaction(async (unit) => {
      const locked = await unit.lockPomodoro(userId, pomodoro.id);
      locked?.pause(at(5));
      if (locked) await unit.savePomodoro(locked);
    });
    expect(await repository.findById(userId, pomodoro.id)).toMatchObject({
      status: 'paused',
      endsAt: null,
      remainingMs: 20 * MINUTE,
    });
  });

  it('crea tareas en orden, las devuelve por position y calcula la mayor (RF-64, D-12)', async () => {
    const pomodoro = await start();
    const created = await repository.transaction((unit) =>
      unit.createTasks([newTask(pomodoro.id, 1, 'Primera'), newTask(pomodoro.id, 2, 'Segunda')]),
    );
    expect(created.map((task) => task.title)).toEqual(['Primera', 'Segunda']);
    await repository.transaction(async (unit) => {
      expect(await unit.maxPosition(pomodoro.id)).toBe(2);
      const [first] = await unit.tasksOf(pomodoro.id);
      // Quitar y volver a añadir la pone al final
      first?.moveTo(pomodoro.id, 3, day('2026-11-08'));
      if (first) await unit.saveTasks([first]);
    });
    expect((await repository.findTasksOf(pomodoro.id)).map((task) => task.title)).toEqual(['Segunda', 'Primera']);
  });

  it('la foto JSONB se guarda y se lee igual, en orden (RF-16, RF-64, D-9)', async () => {
    const pomodoro = await start();
    const snapshot = [
      { id: 'a', title: 'Hecha', description: 'Con nota', date: day('2026-11-08'), completed: true, completedAt: at(3) },
      { id: 'b', title: 'Pendiente', description: null, date: day('2026-11-20'), completed: false, completedAt: null },
    ];
    await repository.transaction(async (unit) => {
      const locked = await unit.lockPomodoro(userId, pomodoro.id);
      locked?.finishManually(at(10), { finishedOn: day('2026-11-08'), snapshot });
      if (locked) await unit.savePomodoro(locked);
    });
    const stored = await repository.findById(userId, pomodoro.id);
    expect(stored?.snapshot).toEqual(snapshot);
    expect(stored).toMatchObject({ endReason: 'manual', focusedSeconds: 600, finishedOn: day('2026-11-08') });
  });

  it('tareas en espera: solo pendientes sin sesión, por fecha y creación, paginadas (RF-23, RF-24)', async () => {
    const pomodoro = await start();
    const tasks = await repository.transaction((unit) =>
      unit.createTasks([
        newTask(pomodoro.id, 1, 'Mañana', '2026-11-09'),
        newTask(pomodoro.id, 2, 'Hoy A'),
        newTask(pomodoro.id, 3, 'Hoy B'),
        newTask(pomodoro.id, 4, 'Completada'),
      ]),
    );
    await repository.transaction(async (unit) => {
      for (const task of tasks) {
        if (task.title === 'Completada') task.complete(at(5));
        else task.moveToWaiting();
      }
      await unit.saveTasks(tasks);
    });
    const page = await repository.findWaitingPage(userId, new Pagination(1, 2));
    expect(page.items.map((task) => task.title)).toEqual(['Hoy A', 'Hoy B']);
    expect(page.total).toBe(3);
    const second = await repository.findWaitingPage(userId, new Pagination(2, 2));
    expect(second.items.map((task) => task.title)).toEqual(['Mañana']);
  });

  it('findTasks solo devuelve las del usuario y descarta ids no UUID; deleteTask las borra', async () => {
    const pomodoro = await start();
    const [task] = await repository.transaction((unit) => unit.createTasks([newTask(pomodoro.id, 1, 'Mía')]));
    const other = await createTestUser(prisma, 'otro');
    await repository.transaction(async (unit) => {
      expect(await unit.findTasks(other, [task?.id ?? ''])).toEqual([]);
      expect(await unit.findTasks(userId, ['no-es-un-uuid'])).toEqual([]);
      expect((await unit.findTasks(userId, [task?.id ?? ''])).map((found) => found.title)).toEqual(['Mía']);
      await unit.deleteTask(userId, task?.id ?? '');
    });
    expect(await repository.findTask(userId, task?.id ?? '')).toBeNull();
  });

  it('listado de sesiones de la más reciente a la más antigua (RF-18)', async () => {
    for (const minutes of [0, 30, 60]) {
      const pomodoro = await start(userId, 1, at(minutes));
      await repository.transaction(async (unit) => {
        const locked = await unit.lockPomodoro(userId, pomodoro.id);
        locked?.finishByTime(at(minutes + 1), { finishedOn: day('2026-11-08'), snapshot: [] });
        if (locked) await unit.savePomodoro(locked);
      });
    }
    const page = await repository.findPage(userId, new Pagination(1, 50));
    expect(page.items.map((pomodoro) => pomodoro.startedAt)).toEqual([at(60), at(30), at(0)]);
    expect(page.total).toBe(3);
  });

  it('findDue y findDueId devuelven solo las sesiones en curso vencidas (D-2)', async () => {
    const due = await start(userId, 1);
    const other = await createTestUser(prisma, 'otro');
    await start(other, 25);
    // findDue recorre todos los usuarios: se miran solo los dos de este test
    const mine = (await repository.findDue(at(2), 1000)).filter((row) => row.userId === userId || row.userId === other);
    expect(mine).toEqual([{ id: due.id, userId }]);
    expect(await repository.findDueId(userId, at(2))).toBe(due.id);
    expect(await repository.findDueId(other, at(2))).toBeNull();
  });

  it('días productivos: distintos, solo terminadas por tiempo y hasta el día indicado (RF-38, RF-41)', async () => {
    const finish = async (minutes: number, finishedOn: string, byTime: boolean) => {
      const pomodoro = await start(userId, 1, at(minutes));
      await repository.transaction(async (unit) => {
        const locked = await unit.lockPomodoro(userId, pomodoro.id);
        if (!locked) return;
        if (byTime) locked.finishByTime(at(minutes + 1), { finishedOn: day(finishedOn), snapshot: [] });
        else locked.finishManually(at(minutes), { finishedOn: day(finishedOn), snapshot: [] });
        await unit.savePomodoro(locked);
      });
    };
    await finish(0, '2026-11-06', true);
    await finish(10, '2026-11-06', true);
    await finish(20, '2026-11-07', false);
    await finish(30, '2026-11-08', true);
    await finish(40, '2026-11-09', true);
    const dates = await repository.findProductiveDates(userId, day('2026-11-08'));
    expect(dates.map((date) => date.toString())).toEqual(['2026-11-06', '2026-11-08']);
  });

  it('borrar la cuenta borra sus sesiones y tareas en cascada', async () => {
    const pomodoro = await start();
    await repository.transaction((unit) => unit.createTasks([newTask(pomodoro.id, 1, 'Tarea')]));
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.pomodoro.count({ where: { userId } })).toBe(0);
    expect(await prisma.pomodoroTask.count({ where: { userId } })).toBe(0);
  });
});
