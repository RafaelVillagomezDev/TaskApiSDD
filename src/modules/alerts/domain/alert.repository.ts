import type { Pagination } from '../../../shared/domain/pagination.value-object.js';
import type { Alert, AlertPeriod, AlertTask } from './alert.entity.js';

export interface AlertPageResult {
  items: Alert[];
  total: number;
}

// Puerto de salida de avisos
export interface AlertRepository {
  // Marca el periodo como evaluado y, solo si es la primera vez y `collect` devuelve tareas, registra
  // el aviso, dentro de una única transacción. null si el periodo ya se evaluó o no había tareas (RF-27, RF-28, D-7)
  claimPeriod(period: AlertPeriod, collect: () => Promise<AlertTask[]>): Promise<Alert | null>;
  // Del más reciente al más antiguo (RF-29)
  findPage(userId: string, pagination: Pagination): Promise<AlertPageResult>;
}
