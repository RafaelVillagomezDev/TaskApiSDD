import type { RequestContext } from '../../../shared/application/request-context.type.js';
import type { ProductiveDateSource } from '../domain/productive-date.port.js';
import { Streak } from '../domain/streak.value-object.js';

// Racha actual y mejor racha del usuario según su día actual (RF-19 a RF-23)
export class GetStreakUseCase {
  constructor(private readonly productiveDates: ProductiveDateSource) {}

  async execute(context: RequestContext): Promise<Streak> {
    const dates = await this.productiveDates.findUntil(context.userId, context.today);
    return Streak.calculate(dates, context.today);
  }
}
