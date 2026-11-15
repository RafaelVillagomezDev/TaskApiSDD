import { z } from 'zod';

// page ≥ 1 (por defecto 1) y pageSize entre 1 y 100 (por defecto 50) (RF-39, RF-42)
export const paginationQueryShape = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
};

export const paginationQuerySchema = z.object(paginationQueryShape);
