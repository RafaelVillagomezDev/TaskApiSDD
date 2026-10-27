import { defineConfig } from 'vite';

// Solo lo usa `pnpm dev` (vite-node --watch): las carpetas que generan los tests con cobertura, el análisis
// de SonarQube y graphify no deben reiniciar la API (cada reinicio abre conexiones nuevas a PostgreSQL)
export default defineConfig({
  server: {
    watch: {
      ignored: ['**/coverage/**', '**/.scannerwork/**', '**/graphify-out/**'],
    },
  },
});
