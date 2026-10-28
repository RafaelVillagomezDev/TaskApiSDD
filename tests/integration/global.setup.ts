import { execFileSync } from 'node:child_process';

import { PrismaClient } from '@prisma/client';

// Aplica las migraciones en el esquema `test` de la base de datos de desarrollo antes de los tests
// de integración (excepción del principio IV declarada en el plan, sección 2) y deja el esquema vacío
export default async function globalSetup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL no está definida: los tests de integración necesitan .env.dev');
  }

  // Mismo servidor y base de datos que desarrollo, pero aislados en el esquema `test`
  const testUrl = new URL(databaseUrl);
  testUrl.searchParams.set('schema', 'test');
  process.env.DATABASE_URL = testUrl.toString();

  execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
  });

  // Una sola vez por ejecución: las cuentas (con sus datos en cascada) y los tokens sueltos. Durante
  // la ejecución cada fichero crea sus propias cuentas con createTestUser (R-12 de la 002)
  const prisma = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } });
  try {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "users", "csrf_tokens", "login_attempts" CASCADE');
  } finally {
    await prisma.$disconnect();
  }
}
