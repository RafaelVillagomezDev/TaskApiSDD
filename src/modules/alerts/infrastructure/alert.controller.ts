import type { RequestHandler } from 'express';

import { Pagination } from '../../../shared/domain/pagination.value-object.js';
import { getRequestContext } from '../../../shared/infrastructure/http/request-context.middleware.js';
import { parseOrThrow } from '../../../shared/infrastructure/http/request-validation.helper.js';
import { sendSuccess } from '../../../shared/infrastructure/http/response-envelope.helper.js';
import type { ListAlertsUseCase } from '../application/list-alert.use-case.js';
import { toAlertResponse } from './alert.mapper.js';
import { listAlertsQuerySchema } from './alert.schema.js';

// GET /alerts
export class AlertController {
  constructor(private readonly listAlerts: ListAlertsUseCase) {}

  list: RequestHandler = async (req, res) => {
    const context = getRequestContext(res);
    const query = parseOrThrow(listAlertsQuerySchema, req.query);
    const page = await this.listAlerts.execute(context, new Pagination(query.page, query.pageSize));
    sendSuccess(res, 200, 'Operación realizada con éxito', { ...page, items: page.items.map(toAlertResponse) });
  };
}
