import type { Config } from 'jest';

// Configuración común en modo ESM (plan, D-22): ts-jest transforma TypeScript como módulos ES
// y los imports relativos con extensión `.js` se resuelven al fichero `.ts`
const esmProject = {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }],
  },
  // Cobertura sobre todo el código de src/, también el que no tiene test (quality gate de SonarQube, principio III)
  collectCoverageFrom: ['<rootDir>/src/**/*.ts', '!<rootDir>/src/**/tests/**'],
} satisfies Config;

const config: Config = {
  // lcov para SonarQube (sonar-project.properties) y un resumen en consola
  coverageReporters: ['lcov', 'text-summary'],
  projects: [
    {
      ...esmProject,
      displayName: 'unit',
      // Tests sin base de datos (en las subcarpetas tests/, D-25); los de integración tienen su propio proyecto
      testMatch: ['<rootDir>/src/**/*.test.ts'],
      testPathIgnorePatterns: ['/node_modules/', '\\.int\\.test\\.ts$'],
    },
    {
      ...esmProject,
      displayName: 'integration',
      // Repositorios Prisma contra el esquema `test` de PostgreSQL
      testMatch: ['<rootDir>/src/**/*.int.test.ts'],
      globalSetup: '<rootDir>/tests/integration/global.setup.ts',
    },
    // Solo con `pnpm test:perf` (RNF-01, CE-05): fuera de `pnpm test` para que una ruta pasada
    // como argumento filtre los tests en lugar de interpretarse como nombre de proyecto
    ...(process.env.JEST_PERFORMANCE === '1'
      ? [
          {
            ...esmProject,
            displayName: 'performance',
            testMatch: ['<rootDir>/tests/performance/**/*.test.ts'],
          },
        ]
      : []),
  ],
};

export default config;
