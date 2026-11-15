import type { Prisma, PrismaClient } from '@prisma/client';

import type { Pagination } from '../../../shared/domain/pagination.value-object.js';
import type { Alert, AlertPeriod, AlertTask } from '../domain/alert.entity.js';
import type { AlertPageResult, AlertRepository } from '../domain/alert.repository.js';
import { toAlertDomain, toAlertTasksJsonb } from './alert.mapper.js';

// Del más reciente al más antiguo, sobre el índice (user_id, created_at DESC, id) (RF-29)
const ALERT_ORDER: Prisma.AlertOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'asc' }];

export class PrismaAlertRepository implements AlertRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // Marca y aviso en la misma transacción: si otra pasada o instancia ya marcó el periodo, el INSERT
  // espera a que confirme y no inserta nada (plan, 5.5; D-7)
  async claimPeriod(period: AlertPeriod, collect: () => Promise<AlertTask[]>): Promise<Alert | null> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$executeRaw`
        INSERT INTO "alert_period_checks" ("user_id", "type", "period_start")
        VALUES (${period.userId}::uuid, ${period.type}::"alert_type", ${period.periodStart.toString()}::date)
        ON CONFLICT DO NOTHING`;
      if (claimed === 0) return null;

      // Sin tareas pendientes no hay aviso, pero el periodo queda evaluado (RF-27)
      const tasks = await collect();
      if (tasks.length === 0) return null;

      const row = await tx.alert.create({
        data: {
          userId: period.userId,
          type: period.type,
          periodStart: period.periodStart.toUtcDate(),
          periodEnd: period.periodEnd.toUtcDate(),
          tasks: toAlertTasksJsonb(tasks),
        },
      });
      return toAlertDomain(row);
    });
  }

  async findPage(userId: string, pagination: Pagination): Promise<AlertPageResult> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.alert.findMany({
        where: { userId },
        orderBy: ALERT_ORDER,
        skip: pagination.offset,
        take: pagination.pageSize,
      }),
      this.prisma.alert.count({ where: { userId } }),
    ]);
    return { items: rows.map(toAlertDomain), total };
  }
}
