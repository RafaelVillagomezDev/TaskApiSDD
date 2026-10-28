import { defineConfig } from 'vite';

export default defineConfig({
  // `pnpm build` (T028): build SSR del servidor en dist/server.js, que arranca `pnpm start`.
  // Las dependencias de node_modules no se empaquetan: la imagen de producción las instala aparte
  build: {
    ssr: 'src/server.main.ts',
    target: 'node22',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: { entryFileNames: 'server.js' },
    },
  },
  // `pnpm dev` (vite-node --watch): las carpetas que generan los tests con cobertura, el análisis
  // de SonarQube y graphify no deben reiniciar la API (cada reinicio abre conexiones nuevas a PostgreSQL)
  server: {
    watch: {
      ignored: ['**/coverage/**', '**/.scannerwork/**', '**/graphify-out/**', '**/dist/**'],
    },
  },
});
