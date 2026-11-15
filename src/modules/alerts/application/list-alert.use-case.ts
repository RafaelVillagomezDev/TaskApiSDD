import type { RequestContext } from '../../../shared/application/request-context.type.js';
import { createPage, type Page, type Pagination } from '../../../shared/domain/pagination.value-object.js';
import type { Alert } from '../domain/alert.entity.js';
import type { AlertRepository } from '../domain/alert.repository.js';

// Avisos del usuario, del más reciente al más antiguo y paginados (RF-29, RF-39)
export class ListAlertsUseCase {
  constructor(private readonly alerts: AlertRepository) {}

  async execute(context: RequestContext, pagination: Pagination): Promise<Page<Alert>> {
    const { items, total } = await this.alerts.findPage(context.userId, pagination);
    return createPage(items, pagination, total);
  }
}
