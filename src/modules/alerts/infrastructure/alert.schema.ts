import { paginationQuerySchema } from '../../../shared/infrastructure/http/pagination.schema.js';

// Query de GET /alerts: solo paginación (RF-39, RF-42)
export const listAlertsQuerySchema = paginationQuerySchema;
