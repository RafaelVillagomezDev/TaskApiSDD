import { PrismaClient } from '@prisma/client';

import { truncateTables } from '../../../../../tests/integration/test-database.helper.js';
import { LocalDate } from '../../../../shared/domain/local-date.value-object.js';
import { Pagination } from '../../../../shared/domain/pagination.value-object.js';
import type { AlertPeriod, AlertTask } from '../../domain/alert.entity.js';
import { PrismaAlertRepository } from '../prisma-alert.repository.js';

const prisma = new PrismaClient();
const repository = new PrismaAlertRepository(prisma);
const day = (value: string) => LocalDate.parse(value);

const daily = (date: string, userId = 'user-1'): AlertPeriod => ({
  userId,
  type: 'daily',
  periodStart: day(date),
  periodEnd: day(date),
});
const snapshot = (title: string, date = '2026-10-24'): AlertTask => ({
  id: '6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b',
  title,
  date: day(date),
});

describe('PrismaAlertRepository', () => {
  // Solo sus tablas: los ficheros de integración se ejecutan en paralelo
  beforeEach(() => truncateTables(prisma, ['alerts', 'alert_period_checks']));
  afterAll(() => prisma.$disconnect());

  it('claimPeriod registra el aviso con la copia de tareas en JSONB y sin desplazar los días (RF-30, R-4)', async () => {
    const alert = await repository.claimPeriod(
      { userId: 'user-1', type: 'weekly', periodStart: day('2026-10-19'), periodEnd: day('2026-10-25') },
      async () => [snapshot('Viernes', '2026-10-23'), snapshot('Domingo', '2026-10-25')],
    );

    expect(alert?.id).toMatch(/^[0-9a-f-]{36}$/);
    const { items } = await repository.findPage('user-1', new Pagination(1, 50));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'weekly' });
    expect(items[0]?.periodStart.toString()).toBe('2026-10-19');
    expect(items[0]?.periodEnd.toString()).toBe('2026-10-25');
    expect(items[0]?.tasks.map((task) => [task.title, task.date.toString()])).toEqual([
      ['Viernes', '2026-10-23'],
      ['Domingo', '2026-10-25'],
    ]);
  });

  it('un periodo ya evaluado no se vuelve a evaluar ni duplica el aviso (RF-28)', async () => {
    await repository.claimPeriod(daily('2026-10-24'), async () => [snapshot('Primera')]);
    const collect = import.meta.jest.fn(async () => [snapshot('Segunda')]);

    expect(await repository.claimPeriod(daily('2026-10-24'), collect)).toBeNull();
    expect(collect).not.toHaveBeenCalled();
    expect(await prisma.alert.count()).toBe(1);
  });

  it('un periodo sin tareas queda evaluado sin aviso y no se reevalúa (RF-27)', async () => {
    expect(await repository.claimPeriod(daily('2026-10-24'), async () => [])).toBeNull();
    expect(await repository.claimPeriod(daily('2026-10-24'), async () => [snapshot('Tarde')])).toBeNull();
    expect(await prisma.alert.count()).toBe(0);
    expect(await prisma.alertPeriodCheck.count()).toBe(1);
  });

  it('el mismo periodo de otro tipo o de otro usuario se evalúa por separado (RF-28)', async () => {
    await repository.claimPeriod(daily('2026-10-24'), async () => [snapshot('Mía')]);
    await repository.claimPeriod(daily('2026-10-24', 'user-2'), async () => [snapshot('Ajena')]);
    await repository.claimPeriod(
      { userId: 'user-1', type: 'monthly', periodStart: day('2026-10-01'), periodEnd: day('2026-10-31') },
      async () => [snapshot('Mensual')],
    );
    expect(await prisma.alert.count()).toBe(3);
  });

  it('dos claimPeriod concurrentes del mismo periodo: solo uno registra el aviso (RF-28)', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        repository.claimPeriod(daily('2026-10-24'), async () => [snapshot(`Intento ${index}`)]),
      ),
    );
    expect(results.filter((alert) => alert !== null)).toHaveLength(1);
    expect(await prisma.alert.count()).toBe(1);
  });

  it('si falla el registro del aviso, el periodo no queda marcado como evaluado (transacción)', async () => {
    await expect(
      repository.claimPeriod(daily('2026-10-24'), async () => {
        throw new Error('fallo al leer las tareas');
      }),
    ).rejects.toThrow('fallo al leer las tareas');
    expect(await prisma.alertPeriodCheck.count()).toBe(0);
    expect(await repository.claimPeriod(daily('2026-10-24'), async () => [snapshot('Reintento')])).not.toBeNull();
  });

  it('la restricción única impide dos avisos del mismo tipo, usuario y periodo (RF-28)', async () => {
    const data = {
      userId: 'user-1',
      type: 'daily' as const,
      periodStart: day('2026-10-24').toUtcDate(),
      periodEnd: day('2026-10-24').toUtcDate(),
      tasks: [],
    };
    await prisma.alert.create({ data });
    await expect(prisma.alert.create({ data })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('la copia JSONB sigue intacta después de borrar la tarea original (RF-30, D-6)', async () => {
    const task = await prisma.task.create({
      data: { userId: 'user-alert-copy', title: 'Llamar al banco', date: day('2026-10-24').toUtcDate() },
    });
    await repository.claimPeriod(daily('2026-10-24', 'user-alert-copy'), async () => [
      { id: task.id, title: task.title, date: day('2026-10-24') },
    ]);
    // deleteMany: el test de tasks puede haber vaciado ya la tabla en paralelo
    await prisma.task.deleteMany({ where: { id: task.id } });

    const { items } = await repository.findPage('user-alert-copy', new Pagination(1, 50));
    expect(items[0]?.tasks.map((copy) => ({ ...copy, date: copy.date.toString() }))).toEqual([
      { id: task.id, title: 'Llamar al banco', date: '2026-10-24' },
    ]);
  });

  it('findPage ordena del más reciente al más antiguo, pagina y filtra por usuario (RF-02, RF-29, RF-39)', async () => {
    for (const date of ['2026-10-20', '2026-10-21', '2026-10-22']) {
      await repository.claimPeriod(daily(date), async () => [snapshot(date, date)]);
    }
    await repository.claimPeriod(daily('2026-10-23', 'user-2'), async () => [snapshot('Ajena')]);

    const first = await repository.findPage('user-1', new Pagination(1, 2));
    const second = await repository.findPage('user-1', new Pagination(2, 2));
    expect(first.items.map((alert) => alert.periodStart.toString())).toEqual(['2026-10-22', '2026-10-21']);
    expect(second.items.map((alert) => alert.periodStart.toString())).toEqual(['2026-10-20']);
    expect(first.total).toBe(3);
  });
});
