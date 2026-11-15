import { PrismaClient } from '@prisma/client';

import { createTestUser, truncateTables } from '../../../../../tests/integration/test-database.helper.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { Pagination } from '../../../../shared/domain/pagination.value-object.js';
import { PrismaTaskRepository } from '../prisma-task.repository.js';

const prisma = new PrismaClient();
const repository = new PrismaTaskRepository(prisma);
const day = (value: string) => LocalDate.parse(value);

describe('PrismaTaskRepository', () => {
  let user1: string;
  let user2: string;

  // Solo su tabla: los ficheros de integración se ejecutan en paralelo. Las tareas exigen una cuenta real
  beforeEach(async () => {
    await truncateTables(prisma, ['tasks']);
    user1 = await createTestUser(prisma);
    user2 = await createTestUser(prisma);
  });
  afterAll(() => prisma.$disconnect());

  it('crea una tarea pendiente con id UUID generado por PostgreSQL', async () => {
    const task = await repository.create({ userId: user1, title: 'Comprar pan', description: null, date: day('2026-10-24') });
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(task.completed).toBe(false);
    expect(task.createdAt).toBeInstanceOf(Date);
  });

  it('guarda y lee el día sin desplazamiento (R-4)', async () => {
    await repository.create({ userId: user1, title: 'Fin de año', description: null, date: day('2026-12-31') });
    const { items } = await repository.findPage(user1, { status: 'all' }, new Pagination(1, 50));
    expect(items[0]?.date.toString()).toBe('2026-12-31');
  });

  it('filtra por día y por usuario (RF-02, RF-08)', async () => {
    await repository.create({ userId: user1, title: 'Mía del 24', description: null, date: day('2026-10-24') });
    await repository.create({ userId: user1, title: 'Mía del 25', description: null, date: day('2026-10-25') });
    await repository.create({ userId: user2, title: 'Ajena del 24', description: null, date: day('2026-10-24') });
    const result = await repository.findPage(user1, { status: 'all', date: day('2026-10-24') }, new Pagination(1, 50));
    expect(result.items.map((task) => task.title)).toEqual(['Mía del 24']);
    expect(result.total).toBe(1);
  });

  it('ordena por fecha y creación y pagina en SQL (RF-41)', async () => {
    await repository.create({ userId: user1, title: 'B', description: null, date: day('2026-10-25') });
    await repository.create({ userId: user1, title: 'A1', description: null, date: day('2026-10-24') });
    await repository.create({ userId: user1, title: 'A2', description: null, date: day('2026-10-24') });
    const first = await repository.findPage(user1, { status: 'all' }, new Pagination(1, 2));
    const second = await repository.findPage(user1, { status: 'all' }, new Pagination(2, 2));
    expect(first.items.map((task) => task.title)).toEqual(['A1', 'A2']);
    expect(second.items.map((task) => task.title)).toEqual(['B']);
    expect(first.total).toBe(3);
  });

  describe('findPage con filtros de estado y rango (HU-04)', () => {
    const all = new Pagination(1, 50);
    const titles = (result: { items: { title: string }[] }) => result.items.map((task) => task.title);

    beforeEach(async () => {
      const seed = async (title: string, date: string, completed: boolean, userId = user1) => {
        const task = await repository.create({ userId, title, description: null, date: day(date) });
        if (completed) {
          task.complete(day(date));
          await repository.update(task);
        }
      };
      await seed('Hecha 20', '2026-10-20', true);
      await seed('Pendiente 21', '2026-10-21', false);
      await seed('Hecha 22', '2026-10-22', true);
      await seed('Pendiente 23', '2026-10-23', false);
      await seed('Hecha 24', '2026-10-24', true);
      await seed('Ajena 22', '2026-10-22', false, user2);
    });

    it('filtra por estado y cuenta solo las que coinciden (RF-10)', async () => {
      const pending = await repository.findPage(user1, { status: 'pending' }, all);
      expect(titles(pending)).toEqual(['Pendiente 21', 'Pendiente 23']);
      expect(pending.total).toBe(2);
      const completed = await repository.findPage(user1, { status: 'completed' }, all);
      expect(titles(completed)).toEqual(['Hecha 20', 'Hecha 22', 'Hecha 24']);
      expect(completed.total).toBe(3);
    });

    it('filtra por rango con ambos extremos incluidos y sin desplazamiento de día (RF-40, R-4)', async () => {
      const result = await repository.findPage(user1, { status: 'all', from: day('2026-10-21'), to: day('2026-10-23') }, all);
      expect(titles(result)).toEqual(['Pendiente 21', 'Hecha 22', 'Pendiente 23']);
      expect(result.total).toBe(3);
    });

    it('acepta un rango abierto por un extremo (RF-40)', async () => {
      expect(titles(await repository.findPage(user1, { status: 'all', from: day('2026-10-24') }, all))).toEqual([
        'Hecha 24',
      ]);
      expect(titles(await repository.findPage(user1, { status: 'all', to: day('2026-10-20') }, all))).toEqual([
        'Hecha 20',
      ]);
    });

    it('combina rango, estado y paginación, con count sobre el total filtrado (RF-10, RF-39, RF-40)', async () => {
      const filters = { status: 'completed' as const, from: day('2026-10-21'), to: day('2026-10-24') };
      const first = await repository.findPage(user1, filters, new Pagination(1, 1));
      const second = await repository.findPage(user1, filters, new Pagination(2, 1));
      expect(titles(first)).toEqual(['Hecha 22']);
      expect(titles(second)).toEqual(['Hecha 24']);
      expect(first.total).toBe(2);
    });
  });

  it('findById solo encuentra la tarea de su usuario (RF-02, RF-16)', async () => {
    const task = await repository.create({ userId: user1, title: 'Mía', description: null, date: day('2026-10-24') });
    expect((await repository.findById(user1, task.id))?.title).toBe('Mía');
    expect(await repository.findById(user2, task.id)).toBeNull();
    expect(await repository.findById(user1, '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b')).toBeNull();
  });

  it('update guarda el estado completado y actualiza updatedAt', async () => {
    const task = await repository.create({ userId: user1, title: 'Tarea', description: null, date: day('2026-10-24') });
    task.complete(day('2026-10-24'));
    const saved = await repository.update(task);
    expect(saved.completed).toBe(true);
    expect(saved.updatedAt.getTime()).toBeGreaterThanOrEqual(task.createdAt.getTime());
    expect((await repository.findById(user1, task.id))?.completed).toBe(true);
  });

  it('delete borra solo la tarea de su usuario y deja de devolverla (RF-15, RF-16)', async () => {
    const mine = await repository.create({ userId: user1, title: 'Mía', description: null, date: day('2026-10-24') });
    const other = await repository.create({ userId: user1, title: 'Otra', description: null, date: day('2026-10-24') });
    await repository.delete(user1, mine.id);
    expect(await repository.findById(user1, mine.id)).toBeNull();
    const { items, total } = await repository.findPage(user1, { status: 'all' }, new Pagination(1, 50));
    expect(items.map((task) => task.id)).toEqual([other.id]);
    expect(total).toBe(1);
  });

  it('delete no borra la tarea de otro usuario (RF-16)', async () => {
    const task = await repository.create({ userId: user1, title: 'Mía', description: null, date: day('2026-10-24') });
    await repository.delete(user2, task.id);
    expect(await repository.findById(user1, task.id)).not.toBeNull();
  });

  it('findPending devuelve las pendientes del usuario en el rango, ambos días incluidos, en orden (RF-24 a RF-26)', async () => {
    const seed = async (title: string, date: string, completed = false, userId = user1) => {
      const task = await repository.create({ userId, title, description: null, date: day(date) });
      if (completed) {
        task.complete(day(date));
        await repository.update(task);
      }
    };
    await seed('Antes', '2026-10-22');
    await seed('Viernes', '2026-10-23');
    await seed('Domingo', '2026-10-25');
    await seed('Sábado', '2026-10-24');
    await seed('Hecha', '2026-10-24', true);
    await seed('Ajena', '2026-10-24', false, user2);
    await seed('Después', '2026-10-26');

    const pending = await repository.findPending(user1, day('2026-10-23'), day('2026-10-25'));

    expect(pending.map((task) => [task.title, task.date.toString()])).toEqual([
      ['Viernes', '2026-10-23'],
      ['Sábado', '2026-10-24'],
      ['Domingo', '2026-10-25'],
    ]);
  });

  it('findProductiveDates devuelve días distintos con alguna tarea completada, hasta el día indicado (RF-17, RF-18)', async () => {
    const seed = async (date: string, completed: boolean, userId = user1) => {
      const task = await repository.create({ userId, title: 'Tarea', description: null, date: day(date) });
      if (completed) {
        task.complete(day(date));
        await repository.update(task);
      }
    };
    await seed('2026-10-21', true);
    await seed('2026-10-21', true);
    await seed('2026-10-20', true);
    await seed('2026-10-22', false);
    await seed('2026-10-25', true);
    await seed('2026-10-23', true, user2);
    const dates = await repository.findProductiveDates(user1, day('2026-10-24'));
    expect(dates.map(String)).toEqual(['2026-10-20', '2026-10-21']);
  });
});
