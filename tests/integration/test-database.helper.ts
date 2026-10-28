import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

// Tablas que cada `*.int.test.ts` vacía por su cuenta (plan de la 001, sección 4, y de la 002, sección 4).
// `users` no está: con las claves foráneas en cascada, vaciarla borraría los datos de los demás ficheros,
// que se ejecutan en paralelo. Se vacía una sola vez por ejecución en global.setup.ts (R-12 de la 002)
const TABLES = [
  'tasks',
  'alerts',
  'alert_period_checks',
  'user_time_zones',
  'sessions',
  'refresh_tokens',
  'csrf_tokens',
  'login_attempts',
] as const;
type Table = (typeof TABLES)[number];

// Salvaguarda: nunca operar sobre otro esquema (los datos de desarrollo viven en `public`)
async function assertTestSchema(prisma: PrismaClient): Promise<void> {
  const [row] = await prisma.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
  if (row?.schema !== 'test') {
    throw new Error(`Los helpers de integración solo operan sobre el esquema "test" y la conexión apunta a "${row?.schema}"`);
  }
}

// Vacía tablas del esquema `test`; cada `*.int.test.ts` lo llama en `beforeEach` solo con las suyas,
// porque Jest ejecuta los ficheros en paralelo y vaciar todas borraría los datos de otro fichero
export async function truncateTables(prisma: PrismaClient, tables: readonly Table[] = TABLES): Promise<void> {
  await assertTestSchema(prisma);
  const tableList = tables.map((table) => `"${table}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList}`);
}

// Crea una cuenta con un email único y devuelve su id, para cumplir las claves foráneas de user_id
export async function createTestUser(prisma: PrismaClient, label = 'user'): Promise<string> {
  await assertTestSchema(prisma);
  const user = await prisma.user.create({
    data: { email: `${label}-${randomUUID()}@test.local`, passwordHash: 'sin-uso-en-tests' },
  });
  return user.id;
}
