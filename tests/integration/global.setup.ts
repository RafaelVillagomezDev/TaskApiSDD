import { execFileSync } from 'node:child_process';

// Aplica las migraciones en el esquema `test` de la base de datos de desarrollo antes de los tests
// de integración (excepción del principio IV declarada en el plan, sección 2)
export default function globalSetup(): void {
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
}
