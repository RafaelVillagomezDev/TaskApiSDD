import type { LocalDate } from '../../../shared/domain/local-date.value-object.js';
import type { GetProductiveDateUseCase } from '../../tasks/task.facade.js';
import type { ProductiveDateSource } from '../domain/productive-date.port.js';

// Obtiene los días productivos a través de la fachada pública de tasks (principio V)
export class ProductiveDateAdapter implements ProductiveDateSource {
  constructor(private readonly getProductiveDates: GetProductiveDateUseCase) {}

  findUntil(userId: string, until: LocalDate): Promise<LocalDate[]> {
    return this.getProductiveDates.execute(userId, until);
  }
}
