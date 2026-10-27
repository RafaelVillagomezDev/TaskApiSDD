import type { PrismaClient } from '@prisma/client';

// Tablas del modelo de datos (plan, sección 4); `_prisma_migrations` no se toca
const TABLES = ['tasks', 'alerts', 'alert_period_checks', 'user_time_zones'] as const;
type Table = (typeof TABLES)[number];

// Vacía tablas del esquema `test`; cada `*.int.test.ts` lo llama en `beforeEach` solo con las suyas,
// porque Jest ejecuta los ficheros en paralelo y vaciar todas borraría los datos de otro fichero
export async function truncateTables(prisma: PrismaClient, tables: readonly Table[] = TABLES): Promise<void> {
  // Salvaguarda: nunca vaciar otro esquema (los datos de desarrollo viven en `public`)
  const [row] = await prisma.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
  if (row?.schema !== 'test') {
    throw new Error(`truncateTables solo opera sobre el esquema "test" y la conexión apunta a "${row?.schema}"`);
  }

  const tableList = tables.map((table) => `"${table}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList}`);
}
