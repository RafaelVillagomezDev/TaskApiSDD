import type { PrismaClient } from '@prisma/client';

// Tablas del modelo de datos (plan, sección 4); `_prisma_migrations` no se toca
const TABLES = ['tasks', 'alerts', 'alert_period_checks', 'user_time_zones'] as const;

// Vacía las tablas del esquema `test`; cada `*.int.test.ts` lo llama en `beforeEach`
export async function truncateTables(prisma: PrismaClient): Promise<void> {
  // Salvaguarda: nunca vaciar otro esquema (los datos de desarrollo viven en `public`)
  const [row] = await prisma.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
  if (row?.schema !== 'test') {
    throw new Error(`truncateTables solo opera sobre el esquema "test" y la conexión apunta a "${row?.schema}"`);
  }

  const tableList = TABLES.map((table) => `"${table}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList}`);
}
