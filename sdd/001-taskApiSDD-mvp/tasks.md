# Tasks: TaskApiSDD MVP — tareas diarias, rachas y avisos
Spec: `sdd/001-taskApiSDD-mvp/spec.md` (Aprobada) · Plan: `sdd/001-taskApiSDD-mvp/plan.md` · Fecha: 2026-10-24

## Cómo leer este fichero

- **Formato:** `- [ ] T### [P] [Fase] Descripción (RF-xx) — archivo(s)`, con una línea **Verifica** con el comando que da la tarea por terminada.
- **[P]:** se puede hacer en paralelo con las demás tareas [P] de su bloque (archivos distintos y sin dependencias pendientes).
- **Fases:** `[Base]` es la fase común; `[H1]` a `[H6]` son las historias HU-01 a HU-06 en orden de prioridad (P1: H1–H3, P2: H4–H5, P3: H6); `[Rob]` es la fase de robustez.
- **Dentro de cada historia:** primero los tests, que **deben fallar** (rojo); después la implementación, que los hace pasar (verde).
- **Comandos:** todo se ejecuta en Docker (AGENTS.md). Abreviatura usada en este fichero:
  - Hasta T026: `dce` = `docker compose -f docker-compose.dev.yml run --rm api`, porque `api` no queda en ejecución hasta que exista `src/server.main.ts` (T027); `run` levanta también `db`.
  - Desde T027: `dce` = `docker compose -f docker-compose.dev.yml exec api`, como en AGENTS.md.
- **Requisito previo:** `.env.dev` creado en la raíz con `DATABASE_URL`, `PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD` y `POSTGRES_DB` (AGENTS.md §3) antes de T004.
- Las rutas `src/...` y `tests/...` son relativas a la raíz del repositorio.

---

## Fase 0 — Base

### Proyecto y contenedores
- [x] T001 [Base] Ampliar `.gitignore` (`node_modules`, `dist`, `.env.dev`, `.env.prod`) y crear `.dockerignore` (`node_modules`, `dist`, `.env*`, `.git`) — `.gitignore`, `.dockerignore`
  - Verifica: `git check-ignore .env.dev .env.prod node_modules/ dist` lista las 4 rutas.
- [x] T002 [P] [Base] Plantilla de variables sin ningún valor (principio IV) — `.env.example`
  - Verifica: `grep -cE '^[A-Z_]+=$' .env.example` devuelve `5`.
- [x] T003 [Base] Dependencias con versión exacta (plan §8) y scripts `dev`, `build`, `start`, `test`, `test:watch`, `test:coverage`, `test:perf`, `prisma`; TypeScript `strict`, `NodeNext`, ES2023 — `package.json`, `tsconfig.json`
  - Verifica: `docker run --rm -v "$PWD":/app -w /app node:22-alpine node -e "JSON.parse(require('fs').readFileSync('package.json'))"` termina sin error.
- [x] T004 [Base] Imagen de desarrollo (Node 22, corepack + pnpm, `ENV TZ=UTC`, `pnpm dev` con vite-node) y orquestación `api` + `db` (PostgreSQL 16, volumen, `env_file: .env.dev`, puertos `PORT` y 5555) — `Dockerfile.dev`, `docker-compose.dev.yml`
  - Verifica: `docker compose -f docker-compose.dev.yml up -d --build && docker compose -f docker-compose.dev.yml ps` muestra la imagen construida y `db` sana. `api` se detiene hasta que exista `src/server.main.ts` (T027); a partir de ahí debe quedar en ejecución.
  - Nota: incluye `pnpm-workspace.yaml` (`allowBuilds` de Prisma, R-12), necesario para que `pnpm install` no falle.
- [x] T005 [Base] Generar el lockfile dentro del contenedor — `pnpm-lock.yaml`
  - Verifica: `docker compose -f docker-compose.dev.yml run --rm --no-deps api pnpm install --frozen-lockfile` termina sin cambios (se usa `run` porque `api` no queda en ejecución hasta T027).

### Base de datos y tests
- [x] T006 [Base] Modelo de datos: `tasks`, `alerts`, `alert_period_checks`, `user_time_zones`, enum `alert_type`, índices, `UNIQUE (user_id, type, period_start)` e ids con `dbgenerated("gen_random_uuid()")` (plan §4) — `prisma/schema.prisma`
  - Verifica: `dce pnpm prisma validate`.
- [x] T007 [Base] Migración inicial — `prisma/migrations/<timestamp>_init/migration.sql`
  - Verifica: `dce pnpm prisma migrate dev --name init` y después `dce pnpm prisma migrate status` indica que está al día.
- [x] T008 [Base] Jest con proyectos `unit` (`src/**/*.test.ts`, excluye `*.int.test.ts`), `integration` (`src/**/*.int.test.ts`) y `performance` (`tests/performance/**`, solo con `test:perf`); `ts-jest`; *global setup* que aplica las migraciones en el esquema `test` — `jest.config.ts`, `tests/integration/global.setup.ts`
  - Verifica: `dce pnpm test --passWithNoTests`.
- [x] T009 [P] [Base] `truncateTables()` para vaciar el esquema `test` en `beforeEach` — `tests/integration/test-database.helper.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.

### Dominio compartido
- [x] T010 [P] [Base] Test de `LocalDate`: días válidos e inválidos (`2026-02-30`), sumar días entre meses y años, 29 de febrero, día de la semana, último día del mes (RF-06) — `src/shared/domain/tests/local-date.value-object.test.ts`
  - Verifica: `dce pnpm test src/shared/domain/tests/local-date` **falla**.
- [x] T011 [Base] `LocalDate` (RF-06) — `src/shared/domain/local-date.value-object.ts`
  - Verifica: `dce pnpm test src/shared/domain/tests/local-date` pasa.
- [x] T012 [P] [Base] Test de paginación: `offset`, `totalPages` (incluido 0), página fuera de rango (RF-39) — `src/shared/domain/tests/pagination.value-object.test.ts`
  - Verifica: `dce pnpm test src/shared/domain/tests/pagination` **falla**.
- [x] T013 [Base] `Pagination` y `Page<T>` (RF-39) — `src/shared/domain/pagination.value-object.ts`
  - Verifica: `dce pnpm test src/shared/domain/tests/pagination` pasa.
- [x] T014 [P] [Base] `AppError` y catálogo de los 9 códigos con HTTP, mensaje en español y orden de precedencia (RF-46, RNF-03) — `src/shared/domain/app.error.ts`, `src/shared/domain/error-code.constant.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T015 [P] [Base] Puertos `Clock` y `TimeZoneService` — `src/shared/domain/clock.port.ts`, `src/shared/domain/time-zone.port.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T016 [Base] Tipo `RequestContext` y reloj falso para tests (D-21) — `src/shared/application/request-context.type.ts`, `tests/support/fake-clock.adapter.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.

### Infraestructura compartida
- [x] T017 [P] [Base] Test del adaptador `Intl`: zona válida e inválida, desfase en los cambios de horario de 2026 (`Europe/Madrid`, `America/New_York`), hora local en otra zona (RF-32, RF-33, RF-35) — `src/shared/infrastructure/time/tests/intl-time-zone.adapter.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/time` **falla**.
- [x] T018 [Base] Adaptadores de zona horaria y reloj del sistema (RF-32, RF-33, RF-35) — `src/shared/infrastructure/time/intl-time-zone.adapter.ts`, `src/shared/infrastructure/time/system-clock.adapter.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/time` pasa.
- [x] T019 [P] [Base] Instancia única de Prisma — `src/shared/infrastructure/prisma/prisma.client.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T020 [P] [Base] Test del sobre de error y de los middlewares transversales: `details` solo en validación; JSON mal formado, cuerpo de más de 100 kB y charset no soportado → `VALIDATION_ERROR`; error inesperado → `INTERNAL_ERROR` sin detalles; ruta inexistente, `OPTIONS` y `PUT` → `ROUTE_NOT_FOUND` con sobre; `HEAD` → `404` sin cuerpo (principio VII, RF-46) — `src/shared/infrastructure/http/tests/error-handler.middleware.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/error-handler` **falla**.
- [x] T021 [Base] Sobre de éxito y middleware de errores (principio VII) — `src/shared/infrastructure/http/response-envelope.helper.ts`, `src/shared/infrastructure/http/error-handler.middleware.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T022 [Base] Guardián de métodos y ruta inexistente (RF-46, D-19) — `src/shared/infrastructure/http/allowed-method.middleware.ts`, `src/shared/infrastructure/http/route-not-found.middleware.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T023 [Base] Parser JSON con límite de 100 kB y `parseOrThrow` con todos los fallos en `details` (RF-46, D-20) — `src/shared/infrastructure/http/json-body.middleware.ts`, `src/shared/infrastructure/http/request-validation.helper.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T024 [P] [Base] Test del contexto: sin usuario o vacío; `X-Client-Time` (`Z` rechazado, `+00:00` y fracción de 6 dígitos aceptados); tolerancia de 5 min (4:59 sí, 5:01 no); zona `+02:00` rechazada y `Europe/Madrid` aceptada; desfase incoherente; `today` en medianoche; callback de zona aunque la petición falle después (D-1); orden de precedencia de los pasos 2 a 4 (RF-01, RF-23, RF-31 a RF-34, RF-46) — `src/shared/infrastructure/http/tests/request-context.middleware.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/request-context` **falla**.
- [x] T025 [Base] Schemas de cabeceras y middleware de contexto, con aviso en consola por cada `INVALID_CLIENT_TIME` (RF-01, RF-23, RF-31 a RF-34) — `src/shared/infrastructure/http/request-header.schema.ts`, `src/shared/infrastructure/http/request-context.middleware.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/request-context` pasa.

### Aplicación
- [x] T026 [Base] `createApp(container)`: guardián de métodos, routers del contenedor, ruta inexistente y errores, sin parsers ni contexto globales (D-8, D-19); contenedor de test todavía sin módulos (D-21) — `src/app.factory.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test src/shared` pasa entero (incluido T020).
- [x] T027 [Base] Composition root y arranque del servidor; valida vite-node + Prisma (R-9) — `src/dependency.container.ts`, `src/server.main.ts`
  - Verifica: `docker compose -f docker-compose.dev.yml restart api` y `curl -s localhost:$PORT/foo` devuelve el sobre `404 ROUTE_NOT_FOUND`.
- [ ] T028 [P] [Base] Build SSR de producción e imagen multi-stage con `ENV TZ=UTC` — `vite.config.ts`, `Dockerfile.prod`
  - Verifica: `docker build -f Dockerfile.prod -t taskapisdd:latest .`
- [ ] T029 [P] [Base] Orquestación de producción — `docker-compose.prod.yml`
  - Verifica: `docker compose -f docker-compose.prod.yml config` sin errores.
- [x] T030 [Base] Guía manual, sección QS-0: levantar contenedores, migrar, bloque de cabeceras de ejemplo y comprobación de `ROUTE_NOT_FOUND` — `sdd/001-taskApiSDD-mvp/quickstart.md`
  - Verifica: ejecutar QS-0 a mano.

### Checkpoint Base
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-0.1** levantar con `docker compose -f docker-compose.dev.yml up --build`; **QS-0.2** `dce pnpm prisma migrate dev`; **QS-0.3** `curl localhost:$PORT/foo` → `404 ROUTE_NOT_FOUND`; **QS-0.4** `curl -X OPTIONS localhost:$PORT/tasks` → `404` con sobre; **QS-0.5** `curl -I localhost:$PORT/tasks` → `404` sin cuerpo.

---

## Fase H1 — Planificar y consultar las tareas de un día (HU-01, P1)

### Tests (deben fallar)
- [x] T031 [P] [H1] Test de schemas: cuerpo de creación (recorte, 1–200, ≤ 1000, descripción vacía → `null`, día válido) y query `date`/`status`/`page`/`pageSize` con sus valores por defecto (RF-04, RF-05, RF-06, RF-38) — `src/modules/tasks/infrastructure/tests/task.schema.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/task.schema` **falla**.
- [x] T032 [P] [H1] Test de crear tarea: pendiente; hoy y futuro aceptados; pasado → `DAY_CLOSED` (RF-03, RF-07) — `src/modules/tasks/application/tests/create-task.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/create-task` **falla**.
- [x] T033 [P] [H1] Test de listar por día con paginación y orden por fecha y creación (RF-08, RF-39, RF-41) — `src/modules/tasks/application/tests/list-task.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/list-task` **falla**.
- [x] T034 [P] [H1] Test HTTP de `POST /tasks` y `GET /tasks?date=`: `201`/`200` con sobre, mensajes en español, aislamiento entre usuarios, `PUT /tasks` sin usuario → `ROUTE_NOT_FOUND`, precedencia `MISSING_USER` > `INVALID_CLIENT_TIME` > `INVALID_TIMEZONE` > `VALIDATION_ERROR` > `DAY_CLOSED` (RF-01, RF-02, RF-03, RF-07, RF-08, RF-46, RNF-03) — `src/modules/tasks/infrastructure/tests/task.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/task.routes` **falla**.
- [x] T035 [P] [H1] Test de integración: crear, página por día, orden, `DATE` sin desplazamiento (R-4), aislamiento por usuario (RF-02, RF-41) — `src/modules/tasks/infrastructure/tests/prisma-task.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/prisma-task` **falla**.

### Implementación
- [x] T036 [H1] Entidad `Task` con `TITLE_MAX_LENGTH`/`DESCRIPTION_MAX_LENGTH` y puerto `TaskRepository` (`create`, `findPage`) — `src/modules/tasks/domain/task.entity.ts`, `src/modules/tasks/domain/task.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T037 [H1] Repositorio en memoria (`create`, `findPage`) (D-21) — `tests/support/in-memory-task.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T038 [H1] Schema de paginación y schemas de creación y consulta por día (RF-04, RF-05, RF-06, RF-38) — `src/shared/infrastructure/http/pagination.schema.ts`, `src/modules/tasks/infrastructure/task.schema.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/task.schema` pasa.
- [x] T039 [P] [H1] Caso de uso crear tarea (RF-03, RF-07) — `src/modules/tasks/application/create-task.use-case.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/create-task` pasa.
- [x] T040 [P] [H1] Caso de uso listar por día, paginado y ordenado (RF-08, RF-39, RF-41) — `src/modules/tasks/application/list-task.use-case.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/list-task` pasa.
- [x] T041 [H1] Mapper y repositorio Prisma (`create`, `findPage`) (RF-02, RF-41) — `src/modules/tasks/infrastructure/task.mapper.ts`, `src/modules/tasks/infrastructure/prisma-task.repository.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/prisma-task` pasa.
- [x] T042 [H1] Controlador y rutas `POST /tasks` y `GET /tasks`, con contexto y JSON encadenados en cada ruta (D-8) — `src/modules/tasks/infrastructure/task.controller.ts`, `src/modules/tasks/infrastructure/task.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T043 [H1] Cablear el módulo `tasks` en los contenedores real y de test (RF-02) — `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test src/modules/tasks` pasa entero.
- [x] T044 [H1] Guía manual, sección QS-H1 — `sdd/001-taskApiSDD-mvp/quickstart.md`
  - Verifica: ejecutar QS-H1 a mano.

### Checkpoint H1
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-H1.1** crear una tarea para hoy → `201` pendiente; **QS-H1.2** `GET /tasks?date=<hoy>` → la tarea aparece en `data.items`; **QS-H1.3** crear sin título → `400 VALIDATION_ERROR` con `details`; **QS-H1.4** crear para ayer → `409 DAY_CLOSED`; **QS-H1.5** sin `X-User-Id` → `401 MISSING_USER`; **QS-H1.6** `PUT /tasks` → `404 ROUTE_NOT_FOUND`.

---

## Fase H2 — Completar tareas (HU-02, P1)

### Tests (deben fallar)
- [x] T045 [P] [H2] Test de reglas de día de la entidad: completar hoy, desmarcar, idempotencia, pasado → `DAY_CLOSED`, futuro → `DAY_NOT_STARTED` (RF-11, RF-12, RF-14, RF-45) — `src/modules/tasks/domain/tests/task.entity.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/domain/tests/task.entity` **falla**.
- [x] T046 [P] [H2] Test de actualizar (completar/desmarcar): tarea ajena, inexistente o con id no UUID → `TASK_NOT_FOUND`; pasado → `DAY_CLOSED`; futuro → `DAY_NOT_STARTED` (RF-11, RF-12, RF-14, RF-16, RF-45) — `src/modules/tasks/application/tests/update-task.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/update-task` **falla**.
- [x] T047 [P] [H2] Test HTTP de `PATCH /tasks/{id}` con `completed`: `200`, idempotente, `404`, `409 DAY_CLOSED` y `409 DAY_NOT_STARTED`, `VALIDATION_ERROR` antes que `TASK_NOT_FOUND` (RF-11, RF-12, RF-14, RF-16, RF-45, RF-46) — `src/modules/tasks/infrastructure/tests/task.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/task.routes` **falla**.
- [x] T048 [P] [H2] Test de integración `findById` (filtrado por usuario) y `update` (RF-02, RF-16) — `src/modules/tasks/infrastructure/tests/prisma-task.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/prisma-task` **falla**.

### Implementación
- [x] T049 [H2] Reglas de día en la entidad: `assertModifiable`, `complete`, `uncomplete` (RF-11, RF-12, RF-14, RF-45) — `src/modules/tasks/domain/task.entity.ts`
  - Verifica: `dce pnpm test src/modules/tasks/domain/tests/task.entity` pasa.
- [x] T050 [H2] Puerto y repositorio en memoria con `findById` y `update` — `src/modules/tasks/domain/task.repository.ts`, `tests/support/in-memory-task.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T051 [H2] Schema de `PATCH` con `completed` (`strict`) y `id` de la ruta validado solo como cadena (D-10) — `src/modules/tasks/infrastructure/task.schema.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/task.schema` pasa.
- [x] T052 [H2] Caso de uso actualizar: comprobación de formato UUID, `TASK_NOT_FOUND`, `DAY_CLOSED`, `DAY_NOT_STARTED` (RF-11, RF-12, RF-14, RF-16, RF-45) — `src/modules/tasks/application/update-task.use-case.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/update-task` pasa.
- [x] T053 [H2] Repositorio Prisma con `findById` y `update` (RF-02, RF-16) — `src/modules/tasks/infrastructure/prisma-task.repository.ts`
  - Nota: incluye la columna `tasks.sequence` y su migración `task_creation_sequence` (D-24), necesarias para que el orden de creación de RF-41 sea exacto.
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/prisma-task` pasa.
- [x] T054 [H2] Controlador y ruta `PATCH /tasks/{id}` (D-8) — `src/modules/tasks/infrastructure/task.controller.ts`, `src/modules/tasks/infrastructure/task.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T055 [H2] Cablear el caso de uso actualizar — `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test src/modules/tasks` pasa entero.
- [x] T056 [H2] Guía manual, sección QS-H2 — `sdd/001-taskApiSDD-mvp/quickstart.md`
  - Verifica: ejecutar QS-H2 a mano.

### Checkpoint H2
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-H2.1** completar una tarea de hoy → `200` con `completed: true`; **QS-H2.2** desmarcarla → `200` con `completed: false`; **QS-H2.3** completar una tarea de mañana → `409 DAY_NOT_STARTED`; **QS-H2.4** completar una tarea de ayer (insertada con QS-0 o la base de datos) → `409 DAY_CLOSED`; **QS-H2.5** `PATCH /tasks/abc` → `404 TASK_NOT_FOUND`.

---

## Fase H3 — Ver mi racha actual y mi mejor racha (HU-03, P1)

### Tests (deben fallar)
- [x] T057 [P] [H3] Test del cálculo de racha: todos los ejemplos de RF-17 a RF-21, cambio de mes y de año, 29 de febrero, sin días productivos → 0/0 (RF-17 a RF-21, CE-02) — `src/modules/streaks/domain/tests/streak.value-object.test.ts`
  - Verifica: `dce pnpm test src/modules/streaks/domain` **falla**.
- [x] T058 [P] [H3] Test de días productivos: al menos una completada, sin duplicados, hasta hoy, ordenados (RF-17, RF-18, RF-22) — `src/modules/tasks/application/tests/get-productive-date.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/get-productive-date` **falla**.
- [x] T059 [P] [H3] Test de obtener racha: hoy productivo, hoy aún no productivo, días pasados inmutables, "hoy" según el contexto (RF-19, RF-20, RF-22, RF-23) — `src/modules/streaks/application/tests/get-streak.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/streaks/application` **falla**.
- [x] T060 [P] [H3] Test HTTP de `GET /streak`: sobre, errores de cabecera, flujo crear → completar → racha 1 en 3 peticiones (RF-01, RF-31 a RF-33, CE-01) — `src/modules/streaks/infrastructure/tests/streak.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/streaks/infrastructure` **falla**.
- [x] T061 [P] [H3] Test de integración `findProductiveDates` con `SELECT DISTINCT` (RF-17, RF-18) — `src/modules/tasks/infrastructure/tests/prisma-task.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/prisma-task` **falla**.

### Implementación
- [x] T062 [H3] `Streak.calculate` (RF-17 a RF-21) — `src/modules/streaks/domain/streak.value-object.ts`
  - Verifica: `dce pnpm test src/modules/streaks/domain` pasa.
- [x] T063 [H3] Puerto y repositorio en memoria con `findProductiveDates` — `src/modules/tasks/domain/task.repository.ts`, `tests/support/in-memory-task.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T064 [H3] Caso de uso de días productivos y fachada pública del módulo (D-9) (RF-17, RF-18, RF-22) — `src/modules/tasks/application/get-productive-date.use-case.ts`, `src/modules/tasks/task.facade.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/get-productive-date` pasa.
- [x] T065 [H3] Repositorio Prisma con `findProductiveDates` (RF-17, RF-18) — `src/modules/tasks/infrastructure/prisma-task.repository.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/prisma-task` pasa.
- [x] T066 [H3] Puerto `ProductiveDateSource` y adaptador hacia la fachada de `tasks` — `src/modules/streaks/domain/productive-date.port.ts`, `src/modules/streaks/infrastructure/productive-date.adapter.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T067 [H3] Caso de uso obtener racha (RF-19, RF-20, RF-22, RF-23) — `src/modules/streaks/application/get-streak.use-case.ts`
  - Verifica: `dce pnpm test src/modules/streaks/application` pasa.
- [x] T068 [H3] Controlador y ruta `GET /streak` (D-8) — `src/modules/streaks/infrastructure/streak.controller.ts`, `src/modules/streaks/infrastructure/streak.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T069 [H3] Cablear el módulo `streaks` — `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test src/modules/streaks` pasa entero.
- [x] T070 [H3] Guía manual, sección QS-H3 — `sdd/001-taskApiSDD-mvp/quickstart.md`
  - Verifica: ejecutar QS-H3 a mano.

### Checkpoint H3 (fin de las historias P1: MVP utilizable)
- `dce pnpm test` pasa entero.
- Principio V: `grep -rnE "modules/(tasks|streaks|alerts)/(domain|application|infrastructure)" src/modules/streaks` no devuelve resultados.
- quickstart.md → **QS-H3.1** usuario nuevo → `GET /streak` → `{ current: 0, best: 0 }`; **QS-H3.2** crear y completar una tarea de hoy → `{ current: 1, best: 1 }`; **QS-H3.3** desmarcarla → `{ current: 0, best: 0 }`; **QS-H3.4** con días productivos cargados en la base de datos para ayer y anteayer y hoy sin completar → `current: 2` (se mantiene hasta fin de día).

---

## Fase H4 — Consultar todas mis tareas por estado (HU-04, P2)

### Tests (deben fallar)
- [x] T071 [P] [H4] Test de schemas de consulta: `status` inválido, `from`/`to`, `from > to`, `date` + `from`, `page`/`pageSize` inválidos (RF-10, RF-40, RF-42, RF-43) — `src/modules/tasks/infrastructure/tests/task.schema.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/task.schema` **falla**.
- [x] T072 [P] [H4] Test de listar: todas, por estado, por rango inclusivo, página fuera de rango (RF-09, RF-10, RF-39, RF-40) — `src/modules/tasks/application/tests/list-task.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/list-task` **falla**.
- [x] T073 [P] [H4] Test de consultar por id: propia (también de días pasados), ajena, inexistente, id no UUID (RF-16, RF-44) — `src/modules/tasks/application/tests/get-task.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/get-task` **falla**.
- [x] T074 [P] [H4] Test HTTP de `GET /tasks` con filtros y paginación y de `GET /tasks/{id}` (RF-09, RF-10, RF-39 a RF-44) — `src/modules/tasks/infrastructure/tests/task.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/task.routes` **falla**.
- [x] T075 [P] [H4] Test de integración de filtros por estado y rango con `count` (RF-10, RF-40) — `src/modules/tasks/infrastructure/tests/prisma-task.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/prisma-task` **falla**.

### Implementación
- [x] T076 [H4] Schemas de consulta completos (RF-10, RF-40, RF-42, RF-43) — `src/modules/tasks/infrastructure/task.schema.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/task.schema` pasa.
- [x] T077 [H4] Puerto y repositorio en memoria con filtros de estado y rango — `src/modules/tasks/domain/task.repository.ts`, `tests/support/in-memory-task.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T078 [H4] Caso de uso listar con todos los filtros (RF-09, RF-10, RF-40) — `src/modules/tasks/application/list-task.use-case.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/list-task` pasa.
- [x] T079 [P] [H4] Caso de uso consultar por id (RF-16, RF-44) — `src/modules/tasks/application/get-task.use-case.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/get-task` pasa.
- [x] T080 [H4] Repositorio Prisma con filtros (RF-10, RF-40) — `src/modules/tasks/infrastructure/prisma-task.repository.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/prisma-task` pasa.
- [x] T081 [H4] Controlador y ruta `GET /tasks/{id}`; filtros en `GET /tasks` (RF-44) — `src/modules/tasks/infrastructure/task.controller.ts`, `src/modules/tasks/infrastructure/task.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T082 [H4] Cablear el caso de uso consultar por id — `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test src/modules/tasks` pasa entero.
- [x] T083 [H4] Guía manual, sección QS-H4 — `sdd/001-taskApiSDD-mvp/quickstart.md`
  - Verifica: ejecutar QS-H4 a mano.

### Checkpoint H4
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-H4.1** `GET /tasks` sin filtros → todas, paginadas; **QS-H4.2** `?status=pending` → solo pendientes; **QS-H4.3** `?from=…&to=…` → rango inclusivo; **QS-H4.4** `?pageSize=101` → `400 VALIDATION_ERROR`; **QS-H4.5** `?date=…&from=…` → `400`; **QS-H4.6** `GET /tasks/{id}` propia → `200`, ajena → `404`.

---

## Fase H5 — Editar y borrar tareas (HU-05, P2)

### Tests (deben fallar)
- [x] T084 [P] [H5] Test de schema de `PATCH`: `title`/`description` con recorte y límites, campos desconocidos y `date` → `VALIDATION_ERROR`, cuerpo vacío (RF-04, RF-05, RF-37, RF-38) — `src/modules/tasks/infrastructure/tests/task.schema.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/task.schema` **falla**.
- [x] T085 [P] [H5] Test de actualizar (edición): título y descripción; tarea de un día pasado → `DAY_CLOSED` (RF-13, RF-14) — `src/modules/tasks/application/tests/update-task.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/update-task` **falla**.
- [x] T086 [P] [H5] Test de borrar: hoy y futuro; pasado → `DAY_CLOSED`; ajena o inexistente → `TASK_NOT_FOUND` (RF-14, RF-15, RF-16) — `src/modules/tasks/application/tests/delete-task.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/delete-task` **falla**.
- [x] T087 [P] [H5] Test HTTP de `PATCH` con edición y de `DELETE`: `200` con `data: null`, `404`, `409` (RF-13 a RF-16, RF-37) — `src/modules/tasks/infrastructure/tests/task.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/task.routes` **falla**.
- [x] T088 [P] [H5] Test de integración de `delete` (RF-15) — `src/modules/tasks/infrastructure/tests/prisma-task.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/prisma-task` **falla**.

### Implementación
- [x] T089 [H5] Schema de `PATCH` completo y `strict` (RF-04, RF-05, RF-37, RF-38) — `src/modules/tasks/infrastructure/task.schema.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/task.schema` pasa.
- [x] T090 [H5] Edición en la entidad y en el caso de uso actualizar (RF-13, RF-14) — `src/modules/tasks/domain/task.entity.ts`, `src/modules/tasks/application/update-task.use-case.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/update-task` pasa.
- [x] T091 [H5] Puerto y repositorio en memoria con `delete` — `src/modules/tasks/domain/task.repository.ts`, `tests/support/in-memory-task.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T092 [H5] Caso de uso borrar (RF-14, RF-15, RF-16) — `src/modules/tasks/application/delete-task.use-case.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/delete-task` pasa.
- [x] T093 [H5] Repositorio Prisma con `delete` (RF-15) — `src/modules/tasks/infrastructure/prisma-task.repository.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/prisma-task` pasa.
- [x] T094 [H5] Controlador y ruta `DELETE /tasks/{id}` (D-8) — `src/modules/tasks/infrastructure/task.controller.ts`, `src/modules/tasks/infrastructure/task.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T095 [H5] Cablear el caso de uso borrar — `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test src/modules/tasks` pasa entero.
- [x] T096 [H5] Guía manual, sección QS-H5 — `sdd/001-taskApiSDD-mvp/quickstart.md`
  - Verifica: ejecutar QS-H5 a mano.

### Checkpoint H5
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-H5.1** cambiar el título de una tarea de hoy → `200` con el título recortado; **QS-H5.2** `PATCH` con `date` → `400 VALIDATION_ERROR`; **QS-H5.3** borrar una tarea de hoy → `200` con `data: null` y deja de aparecer en `GET /tasks`; **QS-H5.4** borrar una tarea de ayer → `409 DAY_CLOSED`.

---

## Fase H6 — Recibir avisos de tareas que van a quedar sin completar (HU-06, P3)

### Tests (deben fallar)
- [ ] T097 [P] [H6] Test de la entidad aviso: copia `{ id, title, date }` inmutable (RF-30) — `src/modules/alerts/domain/tests/alert.entity.test.ts`
  - Verifica: `dce pnpm test src/modules/alerts/domain/tests/alert.entity` **falla**.
- [ ] T098 [P] [H6] Test de ventanas: periodos y días de disparo (viernes 2026-10-23, 2026-10-29, 2027-02-26), vencido antes y después de las 22:00, recuperación hasta el fin de la ventana y rango sin días cerrados (RF-24 a RF-26, RF-47) — `src/modules/alerts/domain/tests/alert-window.value-object.test.ts`
  - Verifica: `dce pnpm test src/modules/alerts/domain/tests/alert-window` **falla**.
- [ ] T099 [P] [H6] Test de recordar zona: guarda y actualiza solo si cambia (RF-34) — `src/modules/alerts/application/tests/record-user-time-zone.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/alerts/application/tests/record-user-time-zone` **falla**.
- [ ] T100 [P] [H6] Test de tareas pendientes: solo pendientes del usuario en el rango (RF-24 a RF-26) — `src/modules/tasks/application/tests/get-pending-task.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/get-pending-task` **falla**.
- [ ] T101 [P] [H6] Test de generar avisos: vencidos, omitidos sin pendientes y no reevaluados, sin duplicados, sin zona no hay avisos, zona recordada, copia inmutable, tres avisos el mismo día, recuperación tras una parada (RF-24 a RF-28, RF-30, RF-35, RF-36, RF-47, CE-04) — `src/modules/alerts/application/tests/generate-due-alert.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/alerts/application/tests/generate-due-alert` **falla**.
- [ ] T102 [P] [H6] Test de listar avisos: del más reciente al más antiguo, paginado (RF-29, RF-39) — `src/modules/alerts/application/tests/list-alert.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/alerts/application/tests/list-alert` **falla**.
- [ ] T103 [P] [H6] Test del planificador: pasada al arrancar, intervalo de 60 s con temporizadores falsos, sin solapamiento, registro dentro de los 5 min (RNF-02, RF-47) — `src/modules/alerts/infrastructure/tests/alert.scheduler.test.ts`
  - Verifica: `dce pnpm test src/modules/alerts/infrastructure/tests/alert.scheduler` **falla**.
- [ ] T104 [P] [H6] Test HTTP de `GET /alerts`: sobre, paginación válida e inválida, copia de tareas tras borrarlas, zona recordada tras una petición con cabeceras válidas aunque falle (RF-29, RF-30, RF-34, RF-39, RF-42) — `src/modules/alerts/infrastructure/tests/alert.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/alerts/infrastructure/tests/alert.routes` **falla**.
- [ ] T105 [P] [H6] Test de integración del repositorio de avisos: `claimPeriod` concurrente (solo uno gana), restricción única, `JSONB` intacto tras borrar la tarea (RF-28, RF-30) — `src/modules/alerts/infrastructure/tests/prisma-alert.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/alerts/infrastructure/tests/prisma-alert` **falla**.
- [ ] T106 [P] [H6] Test de integración de zonas: upsert que no escribe si no cambia; lotes (RF-34, RF-36) — `src/modules/alerts/infrastructure/tests/prisma-user-time-zone.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/alerts/infrastructure/tests/prisma-user-time-zone` **falla**.
- [ ] T107 [P] [H6] Test de integración `findPending` (RF-24 a RF-26) — `src/modules/tasks/infrastructure/tests/prisma-task.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/prisma-task` **falla**.

### Implementación
- [ ] T108 [H6] Entidad `Alert` (RF-30) — `src/modules/alerts/domain/alert.entity.ts`
  - Verifica: `dce pnpm test src/modules/alerts/domain/tests/alert.entity` pasa.
- [ ] T109 [P] [H6] `AlertWindow` (RF-24 a RF-26, RF-47) — `src/modules/alerts/domain/alert-window.value-object.ts`
  - Verifica: `dce pnpm test src/modules/alerts/domain/tests/alert-window` pasa.
- [ ] T110 [H6] Puerto `AlertRepository` y su fake (D-21) — `src/modules/alerts/domain/alert.repository.ts`, `tests/support/in-memory-alert.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T111 [P] [H6] Puerto `UserTimeZoneRepository` y su fake (D-21) — `src/modules/alerts/domain/user-time-zone.repository.ts`, `tests/support/in-memory-user-time-zone.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T112 [H6] Caso de uso recordar zona (RF-34) — `src/modules/alerts/application/record-user-time-zone.use-case.ts`
  - Verifica: `dce pnpm test src/modules/alerts/application/tests/record-user-time-zone` pasa.
- [ ] T113 [H6] Puerto y repositorio en memoria de tareas con `findPending` — `src/modules/tasks/domain/task.repository.ts`, `tests/support/in-memory-task.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T114 [H6] Caso de uso de tareas pendientes y su exportación en la fachada (RF-24 a RF-26) — `src/modules/tasks/application/get-pending-task.use-case.ts`, `src/modules/tasks/task.facade.ts`
  - Verifica: `dce pnpm test src/modules/tasks/application/tests/get-pending-task` pasa.
- [ ] T115 [H6] Repositorio Prisma de tareas con `findPending` (RF-24 a RF-26) — `src/modules/tasks/infrastructure/prisma-task.repository.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/prisma-task` pasa.
- [ ] T116 [H6] Puerto `PendingTaskSource` y adaptador hacia la fachada de `tasks` — `src/modules/alerts/domain/pending-task.port.ts`, `src/modules/alerts/infrastructure/pending-task.adapter.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T117 [H6] Caso de uso generar avisos (RF-24 a RF-28, RF-30, RF-35, RF-36, RF-47) — `src/modules/alerts/application/generate-due-alert.use-case.ts`
  - Verifica: `dce pnpm test src/modules/alerts/application/tests/generate-due-alert` pasa.
- [ ] T118 [P] [H6] Caso de uso listar avisos (RF-29, RF-39) — `src/modules/alerts/application/list-alert.use-case.ts`
  - Verifica: `dce pnpm test src/modules/alerts/application/tests/list-alert` pasa.
- [ ] T119 [H6] Mapper y repositorio Prisma de avisos con `claimPeriod` transaccional (RF-28, RF-29, RF-30) — `src/modules/alerts/infrastructure/alert.mapper.ts`, `src/modules/alerts/infrastructure/prisma-alert.repository.ts`
  - Verifica: `dce pnpm test src/modules/alerts/infrastructure/tests/prisma-alert` pasa.
- [ ] T120 [P] [H6] Repositorio Prisma de zonas con upsert condicional (RF-34, RF-36) — `src/modules/alerts/infrastructure/prisma-user-time-zone.repository.ts`
  - Verifica: `dce pnpm test src/modules/alerts/infrastructure/tests/prisma-user-time-zone` pasa.
- [ ] T121 [H6] Planificador de 60 s con pasada inicial y sin solapamiento (RNF-02, RF-47) — `src/modules/alerts/infrastructure/alert.scheduler.ts`
  - Verifica: `dce pnpm test src/modules/alerts/infrastructure/tests/alert.scheduler` pasa.
- [ ] T122 [H6] Schema de consulta y controlador de `GET /alerts` (RF-39, RF-42) — `src/modules/alerts/infrastructure/alert.schema.ts`, `src/modules/alerts/infrastructure/alert.controller.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T123 [H6] Ruta `GET /alerts` con contexto encadenado (D-8) — `src/modules/alerts/infrastructure/alert.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T124 [H6] Cablear el módulo `alerts`: router, callback `onAcceptedTimeZone` → recordar zona, planificador (RF-34) — `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test src/modules/alerts` pasa entero.
- [ ] T125 [H6] Arrancar el planificador al iniciar el servidor (RF-47) — `src/server.main.ts`
  - Verifica: `docker compose -f docker-compose.dev.yml restart api && docker compose -f docker-compose.dev.yml logs api` muestra la pasada inicial sin errores.
- [ ] T126 [H6] Guía manual, sección QS-H6 — `sdd/001-taskApiSDD-mvp/quickstart.md`
  - Verifica: ejecutar QS-H6 a mano.

### Checkpoint H6
- `dce pnpm test` pasa entero.
- Principio V: `grep -rnE "modules/tasks/(domain|application|infrastructure)" src/modules/alerts src/modules/streaks` no devuelve resultados.
- quickstart.md → **QS-H6.1** elegir una zona IANA cuya hora local actual esté entre las 22:00 y las 23:59, hacer una petición con ella y crear una tarea pendiente para su "hoy"; **QS-H6.2** esperar ≤ 5 min → `GET /alerts` muestra un aviso `daily` con esa tarea; **QS-H6.3** completar la tarea → el aviso no cambia; **QS-H6.4** parar `api`, volver a levantarlo antes del fin del día local → no se duplica el aviso; **QS-H6.5** usuario que nunca hizo una petición → sin avisos.

---

## Fase R — Robustez

- [ ] T127 [Rob] Batería de precedencia por pares: cada combinación de dos fallos de niveles distintos de RF-46 devuelve el de menor orden (RF-46, R-8) — `src/modules/tasks/infrastructure/tests/task.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/task.routes` pasa.
- [ ] T128 [P] [Rob] Test de rendimiento: 10 000 tareas en 3 años, p95 < 300 ms por endpoint, duración de una pasada del planificador con 10 000 usuarios (RNF-01, CE-05, R-1) — `tests/performance/api.perf.test.ts`
  - Verifica: `dce pnpm test:perf` pasa.
- [ ] T129 [Rob] Guía manual, sección QS-R: producción y rendimiento — `sdd/001-taskApiSDD-mvp/quickstart.md`
  - Verifica: ejecutar QS-R a mano.

- [x] T130 [P] [Rob] Colección de Postman del MVP P1 (H1–H3): flujo, casos de error y carpeta "Mis tareas" con usuario fijo (RF-01 a RF-03, RF-07, RF-08, RF-10, RF-11, RF-12, RF-16, RF-19 a RF-21, RF-31 a RF-33, RF-45, RF-46) — `sdd/001-taskApiSDD-mvp/mvp-p1.postman-collection.json`
  - Verifica: `docker run --rm -e TZ=Europe/Madrid -v "$PWD/sdd/001-taskApiSDD-mvp":/etc/newman postman/newman:6-alpine run mvp-p1.postman-collection.json --env-var baseUrl=http://host.docker.internal:3000` → 22 peticiones y 25 comprobaciones sin fallos.
  - Nota: ampliada con H4 (filtros `status`, `from`/`to`, paginación, `GET /tasks/{id}` y errores RF-42, RF-43 y RF-16): mismo comando → 34 peticiones y 38 comprobaciones sin fallos. Ampliada con H5 (editar, borrar y errores RF-04, RF-16 y RF-37 en `PATCH`/`DELETE`): 43 peticiones y 47 comprobaciones sin fallos. `DELETE` de un día pasado (`DAY_CLOSED`) queda fuera: la API no deja crear esas tareas, se prueba en QS-H5.4.

### Checkpoint Robustez
- `dce pnpm test` y `dce pnpm test:coverage` pasan; `dce pnpm test:perf` pasa.
- Principio V: `grep -rnE "from ['\"](express|@prisma/client|zod)" src/modules/*/domain src/modules/*/application src/shared/domain src/shared/application` no devuelve resultados.
- quickstart.md → **QS-R.1** `docker compose -f docker-compose.prod.yml up --build -d`; **QS-R.2** `docker compose -f docker-compose.prod.yml exec api pnpm prisma migrate deploy`; **QS-R.3** repetir QS-H1.1 y QS-H3.2 contra producción; **QS-R.4** `dce pnpm test:perf` y revisar los p95 que imprime.

---

## Cobertura RF → tareas

| RF | Tareas |
| :--- | :--- |
| RF-01 | T024, T025, T034, T060 |
| RF-02 | T034, T035, T041, T043, T048, T053 |
| RF-03 | T032, T034, T039 |
| RF-04 | T031, T038, T084, T089 |
| RF-05 | T031, T038, T084, T089 |
| RF-06 | T010, T011, T031, T038 |
| RF-07 | T032, T034, T039 |
| RF-08 | T033, T034, T040 |
| RF-09 | T072, T074, T078 |
| RF-10 | T071, T072, T074, T075, T076, T078, T080 |
| RF-11 | T045, T046, T047, T049, T052 |
| RF-12 | T045, T046, T047, T049, T052 |
| RF-13 | T085, T087, T090 |
| RF-14 | T045, T046, T047, T049, T052, T085, T086, T087, T090, T092 |
| RF-15 | T086, T087, T088, T092, T093 |
| RF-16 | T046, T047, T048, T052, T053, T073, T079, T086, T087, T092 |
| RF-17 | T057, T058, T061, T062, T064, T065 |
| RF-18 | T057, T058, T061, T062, T064, T065 |
| RF-19 | T057, T059, T062, T067 |
| RF-20 | T057, T059, T062, T067 |
| RF-21 | T057, T062 |
| RF-22 | T058, T059, T064, T067 |
| RF-23 | T024, T025, T059, T067 |
| RF-24 | T098, T100, T101, T107, T109, T114, T115, T117 |
| RF-25 | T098, T100, T101, T107, T109, T114, T115, T117 |
| RF-26 | T098, T100, T101, T107, T109, T114, T115, T117 |
| RF-27 | T101, T117 |
| RF-28 | T101, T105, T117, T119 |
| RF-29 | T102, T104, T118, T119 |
| RF-30 | T097, T101, T104, T105, T108, T117, T119 |
| RF-31 | T024, T025, T060 |
| RF-32 | T017, T018, T024, T025, T060 |
| RF-33 | T017, T018, T024, T025, T060 |
| RF-34 | T024, T025, T099, T104, T106, T112, T120, T124 |
| RF-35 | T017, T018, T101, T117 |
| RF-36 | T101, T106, T117, T120 |
| RF-37 | T084, T087, T089 |
| RF-38 | T031, T038, T084, T089 |
| RF-39 | T012, T013, T033, T040, T072, T074, T102, T104, T118, T122 |
| RF-40 | T071, T072, T074, T075, T076, T078, T080 |
| RF-41 | T033, T035, T040, T041, T074 |
| RF-42 | T071, T074, T076, T104, T122 |
| RF-43 | T071, T074, T076 |
| RF-44 | T073, T074, T079, T081 |
| RF-45 | T045, T046, T047, T049, T052 |
| RF-46 | T014, T020, T022, T023, T024, T034, T047, T127 |
| RF-47 | T098, T101, T103, T109, T117, T121, T125 |
| RNF-01 | T128 |
| RNF-02 | T103, T121 |
| RNF-03 | T014, T034 |

Los 47 RF y los 3 RNF tienen al menos una tarea de test y una de implementación.
