import { PrismaClient } from '@prisma/client';

import { truncateTables } from '../../../../../tests/integration/test-database.helper.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { Pagination } from '../../../../shared/domain/pagination.value-object.js';
import { PrismaTaskRepository } from '../prisma-task.repository.js';

const prisma = new PrismaClient();
const repository = new PrismaTaskRepository(prisma);
const day = (value: string) => LocalDate.parse(value);

describe('PrismaTaskRepository', () => {
  beforeEach(() => truncateTables(prisma));
  afterAll(() => prisma.$disconnect());

  it('crea una tarea pendiente con id UUID generado por PostgreSQL', async () => {
    const task = await repository.create({ userId: 'user-1', title: 'Comprar pan', description: null, date: day('2026-10-24') });
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(task.completed).toBe(false);
    expect(task.createdAt).toBeInstanceOf(Date);
  });

  it('guarda y lee el día sin desplazamiento (R-4)', async () => {
    await repository.create({ userId: 'user-1', title: 'Fin de año', description: null, date: day('2026-12-31') });
    const { items } = await repository.findPage('user-1', { status: 'all' }, new Pagination(1, 50));
    expect(items[0]?.date.toString()).toBe('2026-12-31');
  });

  it('filtra por día y por usuario (RF-02, RF-08)', async () => {
    await repository.create({ userId: 'user-1', title: 'Mía del 24', description: null, date: day('2026-10-24') });
    await repository.create({ userId: 'user-1', title: 'Mía del 25', description: null, date: day('2026-10-25') });
    await repository.create({ userId: 'user-2', title: 'Ajena del 24', description: null, date: day('2026-10-24') });
    const result = await repository.findPage('user-1', { status: 'all', date: day('2026-10-24') }, new Pagination(1, 50));
    expect(result.items.map((task) => task.title)).toEqual(['Mía del 24']);
    expect(result.total).toBe(1);
  });

  it('ordena por fecha y creación y pagina en SQL (RF-41)', async () => {
    await repository.create({ userId: 'user-1', title: 'B', description: null, date: day('2026-10-25') });
    await repository.create({ userId: 'user-1', title: 'A1', description: null, date: day('2026-10-24') });
    await repository.create({ userId: 'user-1', title: 'A2', description: null, date: day('2026-10-24') });
    const first = await repository.findPage('user-1', { status: 'all' }, new Pagination(1, 2));
    const second = await repository.findPage('user-1', { status: 'all' }, new Pagination(2, 2));
    expect(first.items.map((task) => task.title)).toEqual(['A1', 'A2']);
    expect(second.items.map((task) => task.title)).toEqual(['B']);
    expect(first.total).toBe(3);
  });

  it('findById solo encuentra la tarea de su usuario (RF-02, RF-16)', async () => {
    const task = await repository.create({ userId: 'user-1', title: 'Mía', description: null, date: day('2026-10-24') });
    expect((await repository.findById('user-1', task.id))?.title).toBe('Mía');
    expect(await repository.findById('user-2', task.id)).toBeNull();
    expect(await repository.findById('user-1', '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b')).toBeNull();
  });

  it('update guarda el estado completado y actualiza updatedAt', async () => {
    const task = await repository.create({ userId: 'user-1', title: 'Tarea', description: null, date: day('2026-10-24') });
    task.complete(day('2026-10-24'));
    const saved = await repository.update(task);
    expect(saved.completed).toBe(true);
    expect(saved.updatedAt.getTime()).toBeGreaterThanOrEqual(task.createdAt.getTime());
    expect((await repository.findById('user-1', task.id))?.completed).toBe(true);
  });

  it('findProductiveDates devuelve días distintos con alguna tarea completada, hasta el día indicado (RF-17, RF-18)', async () => {
    const seed = async (date: string, completed: boolean, userId = 'user-1') => {
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
    await seed('2026-10-23', true, 'user-2');
    const dates = await repository.findProductiveDates('user-1', day('2026-10-24'));
    expect(dates.map(String)).toEqual(['2026-10-20', '2026-10-21']);
  });
});
