# Plan: TaskApiSDD MVP — tareas diarias, rachas y avisos
Spec: `sdd/001-taskApiSDD-mvp/spec.md` (Aprobada) · Estado: Aprobado · Fecha: 2026-10-24

## 1. Resumen técnico

API REST en Express 5 + TypeScript estricto con tres módulos verticales hexagonales (`tasks`, `streaks`, `alerts`) sobre PostgreSQL vía Prisma, y una capa `src/shared/` que valida las cabeceras de usuario, hora y zona en el orden de precedencia de RF-46, calcula el día actual y envuelve toda respuesta en el sobre del principio VII. La racha se calcula al vuelo a partir de los días con tareas completadas (sin guardarla), y los avisos los genera un temporizador del propio proceso que cada minuto revisa, con la zona IANA recordada de cada usuario y la API `Intl` del runtime, qué periodos han llegado a su momento de disparo. No se añade ninguna librería fuera del stack salvo las herramientas de desarrollo justificadas en la sección 8.

## 2. Comprobación constitucional

**Excepciones usadas:**
- Principio IV: los tests de integración aplican las migraciones en el esquema `test` de la base de datos de desarrollo, vacían sus tablas con `TRUNCATE` antes de cada test y cargan datos de prueba; nunca en producción.
- Principio VII: las respuestas a `HEAD` van sin cuerpo, por norma de HTTP (excepción del principio desde la versión 1.5.0).

| Principio | Cómo lo cumple este plan | Estado |
| :--- | :--- | :--- |
| **I. Stack cerrado** | Runtime: solo `express`, `@prisma/client` y `zod`. Zonas horarias con `Intl` (sin librería de fechas), temporizador con `setInterval` (sin librería de cron), ids con `gen_random_uuid()` de PostgreSQL (`@default(dbgenerated("gen_random_uuid()"))`), tests HTTP con `fetch` nativo (sin supertest). Las herramientas de desarrollo fuera del stack (`vite-node`, `ts-jest`, `@types/*`) están justificadas en la sección 8 con su alternativa sin dependencia descartada, y el usuario las aprobó el 2026-10-24 por ser necesarias para los tests y el funcionamiento de la app. | ✅ |
| **II. Sin spec no hay cambio** | Todo el comportamiento observable sale de la spec aprobada. Las decisiones tomadas al planificar están en la spec: D-1 (cuándo se recuerda la zona) en *Clarificaciones* de RF-34, D-2 (recuperación de avisos tras una parada) como RF-47, y D-18 (formato de `X-Client-Time`) en *Clarificaciones* de RF-31. | ✅ |
| **III. Tests** | Cada `*.use-case.ts` y cada fichero de `domain/` con lógica tiene su `*.test.ts` en la subcarpeta `tests/` de su carpeta (sección 10, D-25). El cálculo de rachas se prueba con todos los ejemplos de RF-17 a RF-21 (CE-02). La suite completa se ejecuta con `docker compose -f docker-compose.dev.yml exec api pnpm test`. | ✅ |
| **IV. Migraciones** | El esquema vive en `prisma/schema.prisma` y solo cambia con migraciones de `prisma/migrations/`. La migración inicial crea las cuatro tablas de la sección 4. Los secretos solo en `.env.dev`/`.env.prod` (no versionados); se versiona un `.env.example` con los nombres de las variables y sin ningún valor (`VARIABLE=`). | ✅ |
| **V. Separación hexagonal** | `domain/` no importa frameworks (solo `src/shared/domain`). `application/` solo importa `domain/` y `src/shared/`. Toda entrada (cabeceras, body, params, query) se valida con Zod en `infrastructure/`. Cada módulo expone su fachada pública `[entidad].facade.ts` (p. ej. `task.facade.ts`) con los casos de uso que otros módulos pueden usar; los demás módulos solo importan esa fachada, nunca `domain/`, `application/` ni `infrastructure/` de otro módulo (D-9, recogido en el principio V; nombre en singular desde la versión 1.5.0). | ✅ |
| **VI. Clarificar antes de suponer** | Las dudas de comportamiento detectadas al planificar se preguntaron y están en la spec (D-1, D-2 → RF-47, D-18). El resto de decisiones son técnicas (CÓMO) y están justificadas en la sección 7. | ✅ |
| **VII. Formato de respuesta único** | Un único helper construye el sobre de éxito y un único middleware de errores construye el sobre de error, incluidas rutas inexistentes (`ROUTE_NOT_FOUND`), métodos no permitidos como `OPTIONS` (`ROUTE_NOT_FOUND`, D-19; `HEAD` responde lo mismo sin cuerpo, por la excepción del principio), cuerpos no válidos del parser (`VALIDATION_ERROR`, D-20) y fallos inesperados (`INTERNAL_ERROR`). Ningún endpoint usa `204`. Los tests HTTP comprueban el sobre en cada respuesta. | ✅ |

## 3. Estructura de archivos

Todo se crea desde cero salvo `.gitignore`, que ya existe y se amplía.

### Raíz

| Archivo | Qué hace |
| :--- | :--- |
| `package.json` | `"type": "module"` (ESM, D-22), `packageManager: pnpm@12.12.0`, dependencias con versión exacta (sección 8) y scripts: `dev`, `build`, `start`, `test`, `test:watch`, `test:coverage`, `test:perf`, `prisma`. Los scripts de Jest usan `NODE_OPTIONS=--experimental-vm-modules`; `test:perf` añade `JEST_PERFORMANCE=1`, la única forma de cargar el proyecto `performance`, para que `pnpm test <ruta>` filtre por ruta. |
| `pnpm-lock.yaml` | Lockfile generado dentro del contenedor. |
| `pnpm-workspace.yaml` | `allowBuilds`: autoriza los scripts de instalación de `prisma`, `@prisma/client` y `@prisma/engines` (descargan los motores) y deniega los de `@parcel/watcher` y `unrs-resolver`, que traen binarios precompilados (R-12). `Dockerfile.dev` lo copia antes de `pnpm install`. |
| `tsconfig.json` | TypeScript `strict`, `module`/`moduleResolution` `NodeNext` en ESM (los imports relativos llevan extensión `.js`), `verbatimModuleSyntax`, `target` ES2023, `noEmit` (compilan Vite y `ts-jest`). |
| `vite.config.ts` | Build SSR de `src/server.main.ts` a `dist/server.js` (`target: node22`), con las dependencias de `node_modules` como externas; para `pnpm dev`, ignora en la recarga en caliente las carpetas generadas (`coverage/`, `.scannerwork/`, `graphify-out/`, `dist/`). |
| `jest.config.ts` | Dos proyectos: `unit` (`src/**/*.test.ts`, excluyendo `*.int.test.ts` con `testPathIgnorePatterns`, sin base de datos) e `integration` (`src/**/*.int.test.ts` contra PostgreSQL); `ts-jest` como transformador. En ESM: preset `ts-jest/presets/default-esm`, `extensionsToTreatAsEsm: ['.ts']` y `moduleNameMapper` que quita la extensión `.js` de los imports relativos (D-22). |
| `Dockerfile.dev` | Node 22 LTS + pnpm (corepack), `ENV TZ=UTC`, `ENV CHECKPOINT_DISABLE=1` y `ENV PRISMA_HIDE_UPDATE_MESSAGE=true` (Prisma sin comprobaciones de versión por red); instala dependencias, ejecuta `pnpm prisma generate` (imagen autosuficiente) y arranca `pnpm dev` (vite-node en modo watch). |
| `Dockerfile.prod` | Multi-stage, `ENV TZ=UTC` en todas las etapas: `build` (`pnpm install --frozen-lockfile`, `prisma generate`, `vite build`; la usa también el servicio `migrate`), `prod-deps` (`pnpm prune --prod`, conserva el cliente de Prisma generado) y `runtime` mínima con `NODE_ENV=production`, usuario `node`, dependencias de producción, `dist/` y `prisma/`. |
| `docker-compose.dev.yml` | Servicios `api` (Dockerfile.dev, puertos 3000 y 5555 para Prisma Studio, código montado en `/app` incluido `./node_modules`) y `db` (PostgreSQL 16 con volumen y *healthcheck*), `env_file: .env.dev`. `./node_modules` lo instala el propio contenedor (`docker compose -f docker-compose.dev.yml run --rm api pnpm install`) para que el editor vea los tipos sin instalar nada en el host; contiene binarios de Linux que no se ejecutan desde macOS. Tras cambiar `schema.prisma`: `pnpm prisma generate` dentro del contenedor. |
| `docker-compose.prod.yml` | Proyecto `taskapisdd-prod`. Servicios `api` (Dockerfile.prod, etapa `runtime`, publicada en `API_HOST_PORT`, 3000 por defecto) y `db` (sin puertos publicados), `env_file: .env.prod`, y un servicio `migrate` de un solo uso construido con la etapa de build de `Dockerfile.prod` (que conserva el CLI de `prisma`, dependencia de desarrollo) que ejecuta `prisma migrate deploy` y termina: `docker compose -f docker-compose.prod.yml run --rm migrate`. |
| `.dockerignore` | Excluye `node_modules`, `dist`, `.env*`, `.git`. |
| `.gitignore` | Se asegura de ignorar `node_modules`, `dist`, `.env.dev`, `.env.prod`. |
| `.env.example` | Plantilla versionada con `DATABASE_URL=`, `PORT=`, `POSTGRES_USER=`, `POSTGRES_PASSWORD=`, `POSTGRES_DB=`, todas sin valor (principio IV). |
| `prisma/schema.prisma` | Modelo de datos de la sección 4. |
| `prisma/migrations/<timestamp>_init/migration.sql` | Migración inicial generada con `prisma migrate dev --name init`. |

### `src/`

| Archivo | Qué hace |
| :--- | :--- |
| `src/server.main.ts` | Punto de entrada: construye el contenedor, crea la app, escucha en `PORT` y arranca el planificador de avisos. |
| `src/app.factory.ts` | `createApp(container)`: monta el guardián de métodos, los routers de cada módulo, el middleware de ruta inexistente y el de errores. No monta parsers ni el contexto de forma global (D-8). |
| `src/dependency.container.ts` | Composition root: instancia repositorios Prisma, reloj, zona horaria, casos de uso, adaptadores entre módulos y planificador. En los tests HTTP se sustituye por `tests/support/test.container.ts` (D-21). |

### `src/shared/`

| Archivo | Qué hace |
| :--- | :--- |
| `domain/app.error.ts` | `AppError` con `code`, `status`, `message` y `details` opcionales. |
| `domain/error-code.constant.ts` | Catálogo de los 9 códigos de la spec con su HTTP, mensaje en español y orden de precedencia (RF-46). |
| `domain/local-date.value-object.ts` | `LocalDate` (día `AAAA-MM-DD` sin hora): parseo y validación de calendario, comparación, sumar/restar días, día de la semana, último día del mes. |
| `domain/pagination.value-object.ts` | `Pagination` (`page`, `pageSize`, `offset`) y `Page<T>` (`items`, `page`, `pageSize`, `totalItems`, `totalPages`). |
| `domain/clock.port.ts` | Puerto `Clock { now(): Date }`. |
| `domain/time-zone.port.ts` | Puerto `TimeZoneService`: `isValid(zone)`, `offsetMinutesAt(zone, instant)`, `localDateTimeAt(zone, instant) → { date: LocalDate, minutesOfDay }`. |
| `application/request-context.type.ts` | Tipo `RequestContext { userId, today: LocalDate, timeZone }` que reciben los casos de uso. |
| `infrastructure/time/system-clock.adapter.ts` | Implementa `Clock` con la hora del sistema. |
| `infrastructure/time/intl-time-zone.adapter.ts` | Implementa `TimeZoneService` con `Intl.DateTimeFormat` (`timeZoneName: 'longOffset'` y `formatToParts`). |
| `infrastructure/prisma/prisma.client.ts` | Instancia única de `PrismaClient`. |
| `infrastructure/http/request-header.schema.ts` | Schemas Zod de `X-User-Id`, `X-Client-Time` y `X-Timezone`. |
| `infrastructure/http/request-context.middleware.ts` | Valida las cabeceras en el orden 2 → 4 de RF-46, comprueba la tolerancia de 5 minutos y la coherencia desfase/zona, calcula `today` y avisa al callback `onAcceptedTimeZone` (RF-34, D-1). Cada rechazo `INVALID_CLIENT_TIME` escribe una línea JSON en consola (`console.warn`, sin librería de logs) con la desviación detectada. |
| `infrastructure/http/json-body.middleware.ts` | `express.json({ limit: '100kb' })` encapsulado: JSON mal formado, cuerpo demasiado grande o charset no soportado se convierten en `VALIDATION_ERROR` (D-20). Se encadena en cada ruta después del contexto (D-8). |
| `infrastructure/http/request-validation.helper.ts` | `parseOrThrow(schema, input)`: ejecuta un schema Zod y, si falla, lanza `VALIDATION_ERROR` con todos los campos erróneos en `details`. |
| `infrastructure/http/pagination.schema.ts` | Schema Zod de `page` (≥ 1, por defecto 1) y `pageSize` (1–100, por defecto 50) (RF-39, RF-42). |
| `infrastructure/http/response-envelope.helper.ts` | `sendSuccess(res, status, message, data)`: único constructor del sobre de éxito. |
| `infrastructure/http/allowed-method.middleware.ts` | Primer middleware de la app: cualquier método distinto de `GET`, `POST`, `PATCH` y `DELETE` (incluidos `OPTIONS` y `HEAD`) → `404 ROUTE_NOT_FOUND`; a `HEAD` se le responde sin cuerpo (excepción del principio VII). Evita las respuestas automáticas de Express fuera del sobre (D-19). |
| `infrastructure/http/route-not-found.middleware.ts` | Cualquier ruta o método no montado → `ROUTE_NOT_FOUND`. |
| `infrastructure/http/error-handler.middleware.ts` | Único constructor del sobre de error: `AppError` → su código; cualquier otro error → `INTERNAL_ERROR` sin detalles internos. |

### `src/modules/tasks/`

| Archivo | Qué hace |
| :--- | :--- |
| `task.facade.ts` | Fachada pública para otros módulos: exporta `GetProductiveDateUseCase` y `GetPendingTaskUseCase` y sus tipos. |
| `domain/task.entity.ts` | `Task` con sus reglas de día: `assertModifiable(today)` (`DAY_CLOSED`), `complete(today)` (`DAY_NOT_STARTED`), `uncomplete()`, `edit(changes)`. Exporta `TITLE_MAX_LENGTH = 200` y `DESCRIPTION_MAX_LENGTH = 1000`. |
| `domain/task.repository.ts` | Puerto `TaskRepository`: `create`, `findById(userId, id)`, `findPage(userId, filters, pagination)`, `update`, `delete`, `findProductiveDates(userId, until)`, `findPending(userId, from, to)`. |
| `application/create-task.use-case.ts` | Crea una tarea pendiente; rechaza fechas pasadas (RF-03, RF-07). |
| `application/list-task.use-case.ts` | Lista paginada con filtros de día, rango y estado (RF-08 a RF-10, RF-39 a RF-41). |
| `application/get-task.use-case.ts` | Devuelve una tarea del usuario por id (RF-16, RF-44). |
| `application/update-task.use-case.ts` | Edita, completa o desmarca aplicando las reglas de día (RF-11 a RF-14, RF-45). |
| `application/delete-task.use-case.ts` | Borra definitivamente si el día no está cerrado (RF-14 a RF-16). |
| `application/get-productive-date.use-case.ts` | Días con al menos una tarea completada hasta una fecha (para `streaks`). |
| `application/get-pending-task.use-case.ts` | Tareas pendientes de un usuario en un rango de días (para `alerts`). |
| `infrastructure/task.schema.ts` | Schemas Zod de body, query y params (el `id` de la ruta solo se valida como cadena, sin formato, ver D-10): recorte de espacios, límites 1–200 y ≤ 1000, descripción vacía → `null`, día válido, `strict()` en `PATCH`, reglas `from`/`to`/`date` (RF-04 a RF-06, RF-37, RF-38, RF-40, RF-43). |
| `infrastructure/task.mapper.ts` | Fila Prisma ↔ `Task` ↔ JSON del recurso `Task`, con conversión `LocalDate` ↔ columna `DATE`. |
| `infrastructure/prisma-task.repository.ts` | Implementa `TaskRepository` con Prisma. |
| `infrastructure/task.controller.ts` | Traduce HTTP ↔ casos de uso y responde con `sendSuccess`. |
| `infrastructure/task.routes.ts` | Rutas de `/tasks`: cada ruta encadena contexto → JSON → controlador; nada se monta con `router.use` (D-8). |

### `src/modules/streaks/`

| Archivo | Qué hace |
| :--- | :--- |
| `domain/streak.value-object.ts` | `Streak.calculate(productiveDates, today) → { current, best }` (RF-17 a RF-21). Lógica pura. |
| `domain/productive-date.port.ts` | Puerto `ProductiveDateSource { findUntil(userId, today) }`. |
| `application/get-streak.use-case.ts` | Obtiene los días productivos y calcula la racha. |
| `infrastructure/productive-date.adapter.ts` | Implementa el puerto llamando a la fachada de `tasks`. |
| `infrastructure/streak.controller.ts` | `GET /streak`. |
| `infrastructure/streak.routes.ts` | Ruta `GET /streak`: contexto → controlador, encadenados en la propia ruta (D-8). |

### `src/modules/alerts/`

| Archivo | Qué hace |
| :--- | :--- |
| `domain/alert.entity.ts` | `Alert` inmutable con copia de tareas `{ id, title, date }` (RF-30). |
| `domain/alert-window.value-object.ts` | Para un tipo y un día local: periodo (`periodStart`/`periodEnd`), día de disparo, fin de la ventana, rango de tareas y si está vencido a una hora local dada (RF-24 a RF-26, RF-47). Lógica pura. |
| `domain/alert.repository.ts` | Puerto `AlertRepository`: `claimPeriod(period, collect)` (marca el periodo, lee las pendientes con `collect` y registra el aviso, todo en una transacción; `null` si ya estaba evaluado o no hay pendientes) y `findPage(userId, pagination)`. |
| `domain/user-time-zone.repository.ts` | Puerto `UserTimeZoneRepository`: `record(userId, zone)`, `listBatch(cursor, size)`. |
| `domain/pending-task.port.ts` | Puerto `PendingTaskSource { find(userId, from, to) }`. |
| `application/record-user-time-zone.use-case.ts` | Guarda la última zona válida del usuario (RF-34, D-1). |
| `application/generate-due-alert.use-case.ts` | Una pasada del planificador: para cada usuario con zona, evalúa los periodos vencidos y registra los avisos (RF-24 a RF-28, RF-35, RF-36, RF-47). |
| `application/list-alert.use-case.ts` | Lista paginada de avisos, del más reciente al más antiguo (RF-29, RF-39). |
| `infrastructure/alert.schema.ts` | Query de `GET /alerts` (reutiliza `pagination.schema.ts`). |
| `infrastructure/alert.mapper.ts` | Fila Prisma ↔ `Alert` ↔ JSON. |
| `infrastructure/prisma-alert.repository.ts` | Implementa `AlertRepository`. |
| `infrastructure/prisma-user-time-zone.repository.ts` | Implementa `UserTimeZoneRepository` con un upsert que no escribe si la zona no cambia. |
| `infrastructure/pending-task.adapter.ts` | Implementa `PendingTaskSource` llamando a la fachada de `tasks`. |
| `infrastructure/alert.scheduler.ts` | `setInterval` de 60 s que ejecuta `GenerateDueAlertUseCase`, con una pasada inicial al arrancar y sin solapar pasadas. |
| `infrastructure/alert.controller.ts` | `GET /alerts`. |
| `infrastructure/alert.routes.ts` | Ruta `GET /alerts`: contexto → controlador, encadenados en la propia ruta (D-8). |

### `tests/`

| Archivo | Qué hace |
| :--- | :--- |
| `tests/integration/global.setup.ts` | Aplica las migraciones en el esquema `test` de la base de datos del contenedor antes de los tests de integración. |
| `tests/support/in-memory-task.repository.ts` | Implementación en memoria de `TaskRepository` para tests unitarios y HTTP (D-21). |
| `tests/support/in-memory-alert.repository.ts` | Implementación en memoria de `AlertRepository`, incluido `claimPeriod` (D-21). |
| `tests/support/in-memory-user-time-zone.repository.ts` | Implementación en memoria de `UserTimeZoneRepository` (D-21). |
| `tests/support/fake-clock.adapter.ts` | `Clock` controlable desde el test: fijar y avanzar la hora (D-21). |
| `tests/support/test.container.ts` | `createTestContainer()`: el mismo cableado que `dependency.container.ts` pero con los fakes anteriores; lo usan los tests HTTP (D-21). |
| `tests/integration/test-database.helper.ts` | `truncateTables(prisma, tablas)`: vacía con `TRUNCATE` tablas del esquema `test`; cada `*.int.test.ts` lo llama en `beforeEach` solo con sus tablas, porque Jest ejecuta los ficheros en paralelo. |
| `tests/performance/api.perf.test.ts` | Carga 10 000 tareas en 3 años y mide el p95 de cada endpoint con el cableado real (RNF-01, CE-05), y la duración de una pasada del planificador con 10 000 usuarios (R-1). Se ejecuta con `pnpm test:perf`, sobre el esquema `test` (mismo `globalSetup` que la integración). |

Los tests unitarios, HTTP y de integración (`*.test.ts`, `*.int.test.ts`) van en una subcarpeta `tests/` dentro de la carpeta del fichero que prueban, con su mismo nombre base (D-25); ver sección 10.

### Documentación

| Archivo | Qué hace |
| :--- | :--- |
| `sdd/001-taskApiSDD-mvp/quickstart.md` | Guía de pruebas manuales: sección común QS-0 (levantar contenedores, migrar, cabeceras de ejemplo) y una sección por historia (QS-H1 a QS-H6) más QS-R (producción y rendimiento), con peticiones `curl` y respuesta esperada. Los *checkpoints* de `tasks.md` citan sus pasos. |
| `sdd/001-taskApiSDD-mvp/mvp-p1.postman-collection.json` | Colección de Postman del MVP P1 (H1–H3): flujo en orden, casos de error y carpeta "Mis tareas" con un usuario fijo (variable `myUserId`), con `X-Client-Time`, fechas locales y usuario nuevo calculados por un script de colección. Se verifica con Newman desde su imagen de Docker, sin instalar nada en el host. |

## 4. Modelo de datos

Cuatro tablas en PostgreSQL. Los días se guardan como `DATE` (sin hora ni zona); los instantes como `TIMESTAMPTZ(3)` en UTC.

### `tasks`

| Columna | Tipo | Restricciones | Notas |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK, `DEFAULT gen_random_uuid()` | Se expone como cadena opaca. |
| `user_id` | `TEXT` | NOT NULL | Valor de `X-User-Id`. |
| `title` | `VARCHAR(200)` | NOT NULL | Ya recortado (RF-38). |
| `description` | `VARCHAR(1000)` | NULL | Ya recortada; vacía → `NULL`. |
| `date` | `DATE` | NOT NULL | Día al que pertenece la tarea. |
| `completed` | `BOOLEAN` | NOT NULL, `DEFAULT false` | |
| `sequence` | `BIGSERIAL` | NOT NULL, `UNIQUE` | Orden de creación exacto dentro de cada día (RF-41, D-24). |
| `created_at` | `TIMESTAMPTZ(3)` | NOT NULL, `DEFAULT now()` | Se expone en el contrato. |
| `updated_at` | `TIMESTAMPTZ(3)` | NOT NULL | `@updatedAt`. |

Índices: `(user_id, date, sequence)` para listados y rangos; `(user_id, completed, date)` para días productivos y tareas pendientes.

### `alerts`

| Columna | Tipo | Restricciones | Notas |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK, `DEFAULT gen_random_uuid()` | |
| `user_id` | `TEXT` | NOT NULL | |
| `type` | enum `alert_type` (`daily`, `weekly`, `monthly`) | NOT NULL | |
| `period_start` | `DATE` | NOT NULL | Día, lunes o día 1. |
| `period_end` | `DATE` | NOT NULL | Día, domingo o último día del mes. |
| `tasks` | `JSONB` | NOT NULL | Copia inmutable: `[{ "id": "<uuid>", "title": "…", "date": "AAAA-MM-DD" }]` (RF-30). Sin clave foránea, para sobrevivir al borrado de la tarea. |
| `created_at` | `TIMESTAMPTZ(3)` | NOT NULL, `DEFAULT now()` | Instante real de registro (RNF-02). |

Restricción: `UNIQUE (user_id, type, period_start)` (RF-28). Índice: `(user_id, created_at DESC, id)` (RF-29).

### `alert_period_checks`

| Columna | Tipo | Restricciones | Notas |
| :--- | :--- | :--- | :--- |
| `user_id` | `TEXT` | PK compuesta | |
| `type` | `alert_type` | PK compuesta | |
| `period_start` | `DATE` | PK compuesta | |
| `checked_at` | `TIMESTAMPTZ(3)` | NOT NULL, `DEFAULT now()` | |

Marca que un periodo ya se evaluó, haya generado aviso o no. Evita duplicados aunque haya varias instancias (RF-28) y cumple RF-27: un periodo omitido por no tener pendientes no se vuelve a evaluar aunque después se creen tareas (D-7).

### `user_time_zones`

| Columna | Tipo | Restricciones | Notas |
| :--- | :--- | :--- | :--- |
| `user_id` | `TEXT` | PK | |
| `time_zone` | `VARCHAR(64)` | NOT NULL | Nombre IANA, p. ej. `Europe/Madrid` (RF-34). |
| `updated_at` | `TIMESTAMPTZ(3)` | NOT NULL | |

No se guarda la racha: se calcula siempre a partir de `tasks` (D-5).

## 5. Lógica principal

### 5.1 Orden de procesamiento de una petición (RF-46)
1. `allowed-method.middleware`: un método distinto de `GET`, `POST`, `PATCH` o `DELETE` → `ROUTE_NOT_FOUND` (D-19). Después Express busca la ruta y el método; si no coinciden → `route-not-found.middleware` → `ROUTE_NOT_FOUND`. Como el contexto y el parser van encadenados en cada ruta y no en el router (D-8), ninguna otra comprobación se adelanta: `PUT /tasks` sin `X-User-Id` responde `ROUTE_NOT_FOUND`.
2. `request-context.middleware` (encadenado en cada ruta):
   1. `X-User-Id` recortado no vacío; si no → `MISSING_USER`.
   2. `X-Client-Time` cumple el formato extendido de ISO 8601 `AAAA-MM-DDTHH:MM[:SS[.fracción]]±HH:MM`, con fracción de cualquier número de dígitos (no se acepta `Z`, D-18; el formato básico sin separadores no es compatible con un desfase `±HH:MM`), es un instante válido y `|instante − clock.now()| ≤ 5 min`; si no → `INVALID_CLIENT_TIME`.
   3. `X-Timezone` es un nombre de zona IANA: empieza por una letra, está formado por segmentos de letras, dígitos, `_`, `+` o `-` separados por `/`, y `Intl` lo acepta. Se rechazan los identificadores de desfase como `+02:00`, que `Intl` admite pero no son nombres IANA; si no → `INVALID_TIMEZONE`.
   4. `offsetMinutesAt(X-Timezone, instante)` es igual al desfase de `X-Client-Time`; si no → `INVALID_TIMEZONE`.
   5. `today` = parte de fecha de `X-Client-Time` tal como viene (es la fecha local del dispositivo, RF-23).
   6. Se llama a `RecordUserTimeZoneUseCase(userId, zona)` (D-1: basta con que las cabeceras sean válidas).
   7. Se adjunta `RequestContext { userId, today, timeZone }` a la petición.
3. `json-body.middleware` (solo en rutas con body): JSON mal formado, cuerpo de más de 100 kB o charset no soportado → `VALIDATION_ERROR` (D-20).
4. El controlador valida params, query y body con Zod (`parseOrThrow`); el `id` de la ruta se valida solo como cadena, sin comprobar su formato, porque un formato no UUID debe responder `TASK_NOT_FOUND` y no `VALIDATION_ERROR` (D-10); todos los fallos se acumulan en `details` → `VALIDATION_ERROR`.
5. El caso de uso aplica las reglas de negocio: `TASK_NOT_FOUND`, después `DAY_CLOSED` o `DAY_NOT_STARTED`.
6. Cualquier excepción no prevista → `INTERNAL_ERROR`.

### 5.2 Tareas
- **Crear (RF-03, RF-07):** body validado → si `date < today` → `DAY_CLOSED` → insertar con `completed = false` → `201`.
- **Listar (RF-08 a RF-10, RF-39 a RF-41):** filtros `date` | (`from`, `to`), `status`; `count` + `findMany` con `ORDER BY date, sequence`, `OFFSET (page−1)·pageSize`, `LIMIT pageSize`; `totalPages = ceil(totalItems / pageSize)` (0 si no hay tareas); una página fuera de rango devuelve `items: []`.
- **Consultar por id (RF-16, RF-44):** si el id no tiene formato UUID → `TASK_NOT_FOUND` sin consultar la base de datos; si no existe o `user_id` no coincide → `TASK_NOT_FOUND`.
- **Actualizar (RF-11 a RF-14, RF-37, RF-45):** body `strict` con al menos un campo → buscar (`TASK_NOT_FOUND`) → si `task.date < today` → `DAY_CLOSED` → si `completed === true` y `task.date > today` → `DAY_NOT_STARTED` → aplicar los cambios en un único `UPDATE` (operaciones idempotentes) → `200`.
- **Borrar (RF-14 a RF-16):** buscar (`TASK_NOT_FOUND`) → si `task.date < today` → `DAY_CLOSED` → `DELETE` físico → `200` con `data: null`.

### 5.3 Racha (RF-17 a RF-23)
1. `dates` = días distintos con al menos una tarea `completed = true` y `date ≤ today`, en orden ascendente (`SELECT DISTINCT date …`). Con 10 000 tareas en 3 años son como mucho unos 1 100 días.
2. **Mejor racha:** recorrer `dates` contando tramos consecutivos (`dates[i] = dates[i−1] + 1 día`); `best` = tramo más largo.
3. **Racha actual:**
   - si el último día es `today` → longitud del tramo que termina hoy (RF-19);
   - si el último día es `today − 1` → longitud del tramo que termina ayer (RF-20);
   - en otro caso → 0.
4. `best` siempre incluye el tramo actual (RF-21). Como los días pasados son inmutables (RF-14, RF-45), el resultado de un día pasado no cambia (RF-22).

### 5.4 Ventanas de aviso (RF-24 a RF-26, RF-47)
Para un usuario con zona `Z`, en el instante `now`: `{ date: D, minutesOfDay: m } = localDateTimeAt(Z, now)`; disparo = 22:00 (`m ≥ 1320`).

| Tipo | Periodo | Día de disparo `T` | Fin de ventana `E` | Vencido si… |
| :--- | :--- | :--- | :--- | :--- |
| `daily` | `[D, D]` | `D` | `D` | `D = T` y `m ≥ 1320` |
| `weekly` | `[lunes, domingo]` de la semana de `D` | viernes de esa semana | domingo | (`D = T` y `m ≥ 1320`) o `T < D ≤ E` |
| `monthly` | `[día 1, último día L]` del mes de `D` | `L − 2` | `L` | (`D = T` y `m ≥ 1320`) o `T < D ≤ E` |

Rango de tareas del aviso: `[max(T, D), E]`. Solo días que aún se pueden completar: en una recuperación tardía (RF-47) se excluyen los días ya cerrados.

### 5.5 Generación de avisos (pasada del planificador)
1. Si hay una pasada en curso, no se inicia otra.
2. Recorrer `user_time_zones` por lotes de 500 (RF-36: sin zona no hay avisos).
3. Para cada usuario y cada tipo vencido según 5.4:
   1. `claimPeriod`: `INSERT INTO alert_period_checks … ON CONFLICT DO NOTHING`. Si no se insertó, otro proceso o una pasada anterior ya lo evaluó → siguiente.
   2. `pending` = tareas con `completed = false` en el rango de tareas del aviso.
   3. Si `pending` está vacío → no se crea aviso (RF-27).
   4. Si no → `INSERT` en `alerts` con la copia `{ id, title, date }` de cada tarea (RF-30).
   5. Los pasos 1 a 4 van en la misma transacción.
4. La pasada se ejecuta al arrancar y cada 60 s. Peor caso: el aviso se registra unos 60 s más el tiempo de la pasada después de las 22:00, dentro de los 5 minutos de RNF-02.

### 5.6 Recordar la zona (RF-34, D-1)
`INSERT INTO user_time_zones … ON CONFLICT (user_id) DO UPDATE SET time_zone = EXCLUDED.time_zone, updated_at = now() WHERE user_time_zones.time_zone <> EXCLUDED.time_zone`. Solo escribe cuando la zona cambia.

## 6. Interfaz

Siete endpoints REST (contrato completo en la spec, sección *Contrato de la API*). Todos exigen `X-User-Id`, `X-Client-Time` y `X-Timezone`, y responden con el sobre del principio VII.

| Método y ruta | Entrada | Salida (`data`) | Errores posibles (por precedencia) |
| :--- | :--- | :--- | :--- |
| `POST /tasks` | Body `{ title, description?, date }` | `201`, `Task` | `MISSING_USER`, `INVALID_CLIENT_TIME`, `INVALID_TIMEZONE`, `VALIDATION_ERROR`, `DAY_CLOSED` |
| `GET /tasks` | Query `date` \| `from`/`to`, `status`, `page`, `pageSize` | `200`, `Page<Task>` | `MISSING_USER`, `INVALID_CLIENT_TIME`, `INVALID_TIMEZONE`, `VALIDATION_ERROR` |
| `GET /tasks/{id}` | Param `id` | `200`, `Task` | `MISSING_USER`, `INVALID_CLIENT_TIME`, `INVALID_TIMEZONE`, `TASK_NOT_FOUND` |
| `PATCH /tasks/{id}` | Param `id`; body `{ title?, description?, completed? }` (al menos uno, sin otros campos) | `200`, `Task` | `MISSING_USER`, `INVALID_CLIENT_TIME`, `INVALID_TIMEZONE`, `VALIDATION_ERROR`, `TASK_NOT_FOUND`, `DAY_CLOSED`, `DAY_NOT_STARTED` |
| `DELETE /tasks/{id}` | Param `id` | `200`, `null` | `MISSING_USER`, `INVALID_CLIENT_TIME`, `INVALID_TIMEZONE`, `TASK_NOT_FOUND`, `DAY_CLOSED` |
| `GET /streak` | — | `200`, `{ current, best }` | `MISSING_USER`, `INVALID_CLIENT_TIME`, `INVALID_TIMEZONE` |
| `GET /alerts` | Query `page`, `pageSize` | `200`, `Page<Alert>` | `MISSING_USER`, `INVALID_CLIENT_TIME`, `INVALID_TIMEZONE`, `VALIDATION_ERROR` |
| Cualquier otra ruta o método | — | — | `ROUTE_NOT_FOUND` |

Mensajes de éxito (`message`, en español, RNF-03): `POST` → "Tarea creada con éxito"; `PATCH` → "Tarea actualizada con éxito"; `DELETE` → "Tarea eliminada con éxito"; consultas → "Operación realizada con éxito". Los mensajes de error se definen en `error-code.constant.ts`; los de cada campo de `details`, en los schemas Zod.

## 7. Decisiones técnicas

| ID | Decisión | Por qué | Alternativas descartadas |
| :--- | :--- | :--- | :--- |
| D-1 | La zona se recuerda en cuanto las cabeceras son válidas, aunque la petición falle después (RF-34). | Decidido por el usuario (2026-10-24): la zona es un dato del dispositivo, no de la operación. | Recordarla solo con respuesta `2xx`. |
| D-2 | Los avisos no disparados por una parada se recuperan mientras su ventana siga abierta; nunca se duplican. | Decidido por el usuario (2026-10-24): el usuario aún puede reaccionar. Recogido en la spec como RF-47. | No recuperar avisos perdidos. |
| D-3 | Planificador con `setInterval` de 60 s dentro del proceso de la API. | Sin dependencias ni servicios extra; la idempotencia de D-7 lo hace seguro aunque haya varias instancias. | `node-cron` (dependencia nueva para un intervalo fijo), contenedor *worker* aparte (más infraestructura para el MVP), `pg_cron` (extensión de base de datos y lógica fuera del código). |
| D-4 | Zonas horarias con `Intl.DateTimeFormat` del runtime. | Node incluye ICU completo: valida zonas IANA, da desfases y hora local con horario de verano. Cumple el principio I. | `luxon`, `date-fns-tz`, `dayjs` (dependencias que duplican lo que ya trae el runtime). |
| D-5 | La racha se calcula al vuelo, sin guardarla. | Como mucho unos 1 100 días por usuario: cálculo O(n) muy por debajo de 300 ms. Sin contadores, no hay riesgo de desincronización. | Guardar racha actual y mejor en una tabla y actualizarlas con cada cambio (más estados que mantener coherentes). |
| D-6 | Copia de las tareas del aviso en una columna `JSONB`. | El aviso es inmutable (RF-30) y debe sobrevivir al borrado de sus tareas. | Tabla `alert_tasks` con clave foránea (se rompería al borrar, o exigiría `ON DELETE SET NULL` y duplicar campos igualmente). |
| D-7 | Tabla `alert_period_checks` con clave `(user_id, type, period_start)`. | Separa "periodo evaluado" de "aviso creado": cumple RF-27 (un periodo omitido no se reevalúa) y RF-28 (sin duplicados, incluso con varias instancias). | Guardar avisos vacíos y ocultarlos en `GET /alerts` (filas que no son avisos, filtro fácil de olvidar); bloqueos en memoria (no sirven con varias instancias). |
| D-8 | El contexto y el parser JSON se encadenan en cada ruta (`router.get(path, context, json, handler)`), nunca globalmente ni con `router.use`. | Es la única forma de que `ROUTE_NOT_FOUND` gane a `MISSING_USER` también en rutas existentes con un método desconocido (`PUT /tasks`), y `MISSING_USER` a un JSON mal formado (RF-46). | Parser y contexto globales o con `router.use` (invierten la precedencia). |
| D-9 | Cada módulo expone una fachada `[entidad].facade.ts` (p. ej. `task.facade.ts`), y los demás módulos solo importan esa fachada. | Es la API pública que define el principio V (versión 1.5.0) y lo hace verificable: ningún import de `modules/<otro>/(domain\|application\|infrastructure)`. | Importar directamente los casos de uso de otro módulo. |
| D-10 | Ids `UUID` generados por PostgreSQL; un id con formato no UUID responde `TASK_NOT_FOUND` sin consultar la base de datos; el `id` pasa por Zod solo como cadena (principio V) y el formato UUID lo comprueba el caso de uso, porque un schema con formato respondería `VALIDATION_ERROR`. | Ids opacos sin dependencias. Evita que PostgreSQL lance un error de tipo, que acabaría como `500`. | `cuid`/`nanoid` (dependencias), ids numéricos (no son opacos y permiten enumerar). |
| D-11 | Borrado físico de tareas. | RF-15 pide que no vuelvan a aparecer; los avisos ya guardan su copia. | Borrado lógico (filtros extra en todas las consultas sin necesidad funcional). |
| D-12 | Tests HTTP con la app escuchando en un puerto efímero y `fetch` nativo. | Sin dependencias. | `supertest`. |
| D-13 | Recarga en caliente en desarrollo con `vite-node --watch`. | Pertenece a la familia de Vite, la herramienta de build del stack: mismo resolutor y configuración. | `tsx` o `ts-node-dev` (otra cadena de herramientas que solapa con Vite, prohibido por el principio I); `nodemon` + build (lento); `node --watch` con *type stripping* (prohíbe enums y obliga a extensiones `.ts` en los imports). |
| D-14 | `ts-jest` como transformador de Jest. | Jest no entiende TypeScript por sí solo. `ts-jest` es una única dependencia y además comprueba tipos. | `babel-jest` + presets (tres dependencias, sin comprobación de tipos); `@swc/jest` (dos dependencias nativas). |
| D-15 | Express 5. | Propaga los errores de los controladores `async` al middleware de errores sin envoltorios. | Express 4 más un helper `asyncHandler` en cada ruta. |
| D-16 | El día de la tarea se guarda como `DATE` y se convierte a `LocalDate` en el mapper. | Un día no tiene hora ni zona; guardarlo como instante produciría desfases. | `TIMESTAMPTZ` a medianoche UTC. |
| D-17 | Los límites de 200 y 1000 caracteres y el recorte de espacios se aplican en los schemas Zod de `infrastructure/`, con las constantes exportadas desde `task.entity.ts`. | Petición expresa del usuario (clarificación 7) y principio V. Una sola fuente de los valores. | Validar en el dominio con *value objects* (duplicaría la validación). |
| D-18 | `X-Client-Time` exige siempre el desfase `±HH:MM`; `Z` se rechaza con `INVALID_CLIENT_TIME` (un usuario en UTC envía `+00:00`). | Decidido por el usuario (2026-10-24): un único formato de desfase, explícito y fácil de validar. Registrado en *Clarificaciones* de la spec. | Aceptar también `Z` como desfase cero. |
| D-19 | Guardián de métodos al principio de la app: solo `GET`, `POST`, `PATCH` y `DELETE`; el resto → `ROUTE_NOT_FOUND`. | Express responde solo a `OPTIONS` con un cuerpo de texto fuera del sobre, y a `HEAD` reutilizando el `GET`. Con el guardián, `OPTIONS` recibe el sobre y `HEAD` un `404` sin cuerpo, como permite la excepción del principio VII. | Desactivar esas respuestas automáticas router por router (fácil de olvidar en un router nuevo). |
| D-20 | Los errores del parser JSON (mal formado, más de 100 kB, charset no soportado) → `VALIDATION_ERROR` (400). | Son cuerpos no válidos, que es lo que define `VALIDATION_ERROR` en la spec; así no se convierten en `INTERNAL_ERROR` 500. Con un título de 200 y una descripción de 1000 caracteres, 100 kB sobra. | Responder 413/415 (códigos sin equivalente en la spec ni en el sobre). |
| D-21 | Los fakes de tests (repositorios en memoria, reloj falso y contenedor de test) viven en `tests/support/`, uno por fichero. | Decidido por el usuario (2026-10-24): no entran en el build de producción y se comparten entre tests unitarios y HTTP de los tres módulos. | Fakes en `infrastructure/` de cada módulo (código de test dentro de producción); fakes dentro de cada test (duplicación). |
| D-22 | El proyecto es ESM de principio a fin: `"type": "module"`, `NodeNext`, imports relativos con `.js`, build de Vite en ESM y Jest en modo ESM (`--experimental-vm-modules`, preset `default-esm`; el objeto `jest` se usa como `import.meta.jest`). | Decidido por el usuario (2026-10-25): sin CommonJS. | CommonJS (más simple para Jest, descartado por el usuario). |
| D-23 | Prisma 6.19.3 (cliente y CLI). | Decidido por el usuario (2026-10-25): Prisma 7 exige un *driver adapter* (`@prisma/adapter-pg`, dependencia nueva), `prisma.config.ts` y cliente generado en el código fuente; la 6.19.3 funciona como describe este plan sin dependencias extra. | Prisma 7.10.0 con `@prisma/adapter-pg`. La migración a Prisma 7 queda como funcionalidad futura. |
| D-24 | Columna `tasks.sequence` (`BIGSERIAL`, única) y orden de las listas por `date, sequence`. | Detectado al implementar H2: con `created_at` de precisión de milisegundos, dos tareas creadas en el mismo milisegundo empataban y el desempate por `id` (UUID aleatorio) las ordenaba al azar, incumpliendo RF-41. Se añade con una migración nueva (principio IV). | Subir `created_at` a microsegundos (reduce el empate pero no lo elimina); desempatar por `id` (orden aleatorio). |
| D-25 | Los tests de cada carpeta van en su subcarpeta `tests/`, con el mismo nombre base que el fichero probado (`application/tests/create-task.use-case.test.ts`); el soporte común sigue en `tests/` de la raíz. | Decidido por el usuario (2026-10-25): separa código y tests sin alejarlos, y facilita comprobar que cada fichero tiene su test. `tests` en plural por la convención de carpetas de AGENTS.md. Jest no cambia: `src/**/*.test.ts` los encuentra. | Tests junto al código (mezclados); una carpeta `test/` por módulo que reproduce su estructura (más lejos del fichero probado). |

## 8. Complexity Tracking

### Dependencias

| Dependencia | Tipo | ¿En el stack de AGENTS.md? | Por qué hace falta | Alternativa sin ella descartada |
| :--- | :--- | :--- | :--- | :--- |
| `express` | runtime | Sí | Framework HTTP. | Módulo `http` nativo de Node: obliga a escribir a mano el enrutado, el parseo del cuerpo y la cadena de middlewares; además el stack de AGENTS.md fija Express. |
| `@prisma/client` | runtime | Sí | Acceso a PostgreSQL. | Ninguna: Node no trae cliente de PostgreSQL, así que cualquier alternativa (`pg`) es otra dependencia; el stack fija Prisma y el principio I prohíbe otro ORM o query builder. |
| `zod` | runtime | Sí | Validación de entrada (principio V). | Validación a mano con condicionales: repetitiva y sin acumular todos los errores en `details`; además el principio V exige Zod. |
| `typescript` | dev | Sí | Lenguaje en modo estricto. | JavaScript con JSDoc: sin el modo estricto que exige AGENTS.md. |
| `prisma` | dev | Sí | CLI de migraciones y generación del cliente. | Escribir y aplicar migraciones SQL a mano: incumple el principio IV, que exige migraciones de Prisma. |
| `vite` | dev | Sí | Build de producción. | `tsc` como compilador de producción: genera un fichero por módulo sin empaquetar; el stack fija Vite. |
| `jest` | dev | Sí | Tests. | `node:test` nativo: es otro runner, y el principio I prohíbe un runner distinto de Jest. |
| `vite-node` | dev | No (familia de Vite) | Ejecutar TypeScript con recarga en caliente en `Dockerfile.dev`. | `node --watch` con *type stripping* (D-13). |
| `ts-jest` | dev | No | Que Jest ejecute TypeScript. | Compilar a JS antes de cada ejecución de tests: duplica el build y rompe el modo watch (D-14). |
| `@types/node`, `@types/express`, `@types/jest` | dev | No (solo tipos) | Tipos para el modo estricto. | Declarar los tipos a mano (inviable y propenso a errores). |

Las dependencias fuera del stack (`vite-node`, `ts-jest`, `@types/*`) las aprobó el usuario el 2026-10-24: son necesarias para los tests y el funcionamiento de la app. Versiones fijadas en `package.json` (2026-10-25, todas publicadas al menos dos semanas antes): `express` 5.3.0, `@prisma/client` y `prisma` 6.19.3 (D-23), `zod` 4.6.5, `typescript` 6.0.3 (`ts-jest` exige < 7), `vite` 8.3.4, `vite-node` 6.0.0 (exige Vite 8), `jest` 30.5.2, `ts-jest` 29.4.14, `@types/jest` 30.0.0, `@types/node` 22.20.5, `@types/express` 5.0.6; gestor `pnpm` 12.12.0.

### Piezas nuevas

| Pieza | Por qué hace falta | Alternativa más simple descartada |
| :--- | :--- | :--- |
| Planificador de avisos (`alert.scheduler.ts`) | Los avisos se disparan sin petición (RF-24 a RF-26). | Generarlos al consultar `GET /alerts`: incumple RNF-02 si el usuario no consulta y CE-04 no sería verificable. |
| Tabla `alert_period_checks` | RF-27, RF-28 y RF-47 a la vez (D-7). | Restricción única solo en `alerts`: no recuerda los periodos omitidos. |
| Tabla `user_time_zones` | RF-34 a RF-36: los avisos necesitan la zona sin petición en curso. | — (la spec lo exige). |
| Fachadas `[entidad].facade.ts` | Principio V verificable (D-9). | — |
| Esquema `test` en la base de datos del contenedor | Tests de integración aislados sin una variable de entorno nueva. | Una segunda base de datos o un `DATABASE_URL_TEST` (cambiaría la configuración documentada en AGENTS.md). |

## 9. Riesgos

| ID | Riesgo | Mitigación |
| :--- | :--- | :--- |
| R-1 | Con muchos usuarios, una pasada del planificador dura más de lo previsto e incumple RNF-02 (5 min). | Lotes de 500, consultas indexadas y solo se procesan los periodos vencidos. Un test mide la duración de una pasada con 10 000 usuarios. Si se acerca al límite, se mueve el planificador a un contenedor propio sin cambiar el código de dominio. |
| R-2 | Avisos duplicados con varias instancias de la API o con pasadas solapadas. | `claimPeriod` con `ON CONFLICT DO NOTHING` en transacción (D-7), restricción única en `alerts` y bloqueo de solapamiento en el planificador. |
| R-3 | Errores de zona horaria en el cambio de horario de verano. | `Intl` con ICU completo (imagen oficial de Node). Tests con las fechas reales de cambio de 2026 en `Europe/Madrid` y `America/New_York`. |
| R-4 | La columna `DATE` se lee como `Date` de JS y se desplaza un día según la zona del servidor. | El mapper convierte siempre en UTC (`toISOString().slice(0, 10)`), el contenedor usa `TZ=UTC` y un test de integración lo comprueba. |
| R-5 | Suplantación de usuario o de zona horaria cambiando las cabeceras. | Riesgo aceptado en la spec (S-01, S-06). La tolerancia de 5 minutos y la coherencia desfase/zona acotan el margen. |
| R-6 | `GET /streak` lento con historiales largos (CE-05). | `SELECT DISTINCT date` sobre el índice `(user_id, completed, date)` y cálculo O(n) en memoria. Test de rendimiento con 10 000 tareas. |
| R-7 | El reloj del servidor se desvía y empieza a rechazar peticiones legítimas (RF-31). | El contenedor toma la hora del host, sincronizado por NTP; cada rechazo `INVALID_CLIENT_TIME` escribe en consola una línea JSON con la desviación (`request-context.middleware.ts`), visible con `docker compose logs api`. |
| R-8 | Montar mal los middlewares rompe la precedencia de RF-46. | D-8 y una batería de tests HTTP que combina fallos en cada par de niveles de la precedencia. |
| R-9 | Incompatibilidades entre `vite-node`/ESM y el cliente de Prisma. | Se valida al montar el esqueleto del proyecto (primera tarea), antes de escribir lógica. Si falla, se reabre D-13. |
| R-10 | Una petición en la frontera de medianoche ve otro "hoy" que la siguiente. | Es el comportamiento especificado (RF-23); hay casos límite con 23:59 y 00:01 en los tests. |
| R-11 | El modo ESM de Jest es experimental (`--experimental-vm-modules`) y puede fallar con `ts-jest` o con los mocks. | Se valida en T008 con un test mínimo antes de escribir tests reales; los tests usan `import.meta.jest` en lugar del global `jest`. **Verificado en T008:** un test unitario ESM con import relativo `.js` e `import.meta.jest.fn` pasa. Jest muestra un aviso `ExperimentalWarning` de VM Modules, que es esperado. |
| R-12 | pnpm (desde la versión 10) bloquea por defecto los scripts de instalación de las dependencias, y Prisma los usa para descargar sus motores. | **Ocurrió en T004** (pnpm 12 falla con `ERR_PNPM_IGNORED_BUILDS`). Mitigado con `pnpm-workspace.yaml` (`allowBuilds`): solo se autorizan `prisma`, `@prisma/client` y `@prisma/engines`. Verificado en T005: `pnpm prisma --version` encuentra los motores. |
| R-13 | Jest puede necesitar `ts-node` (dependencia nueva) para leer `jest.config.ts`. | Se comprueba en T008. Si Node 22 no lo carga de forma nativa, se usa `jest.config.js` (ESM) en lugar de añadir `ts-node`, actualizando antes el plan y `tasks.md`. **Descartado en T008:** Jest 30 carga `jest.config.ts` sin `ts-node`. |

## 10. Estrategia de tests

Tipos de test (todos en la subcarpeta `tests/` de la carpeta del fichero probado, D-25):
- **Unitarios** (`*.test.ts`, sin base de datos): dominio y casos de uso con los repositorios en memoria y el `Clock` falso de `tests/support/` (D-21).
- **HTTP** (`*.routes.test.ts`): la app real con contenedor de fakes y `fetch` nativo. Cubren el contrato, el sobre y la precedencia.
- **Integración** (`*.int.test.ts`): repositorios Prisma contra el esquema `test` de PostgreSQL.
- **Rendimiento** (`tests/performance/`): RNF-01 y CE-05.

| Módulo | Test | Qué comprueba | RF / RNF / CE |
| :--- | :--- | :--- | :--- |
| shared | `local-date.value-object.test.ts` | Días válidos e inválidos (`2026-02-30`), sumar días entre meses y años, 29 de febrero, día de la semana, último día del mes. | RF-06, casos límite de calendario |
| shared | `pagination.value-object.test.ts` | `offset`, `totalPages` (incluido 0) y página fuera de rango. | RF-39 |
| shared | `intl-time-zone.adapter.test.ts` | Zona válida e inválida, desfase en las fechas de cambio de horario, hora local en otra zona. | RF-32, RF-33, RF-35 |
| shared | `request-context.middleware.test.ts` | Sin usuario o vacío; formato de hora (`Z` rechazado, `+00:00` aceptado, fracción de 6 dígitos aceptada); zona `+02:00` rechazada y `Europe/Madrid` aceptada; tolerancia de 5 min (4:59 aceptado, 5:01 rechazado); zona inválida; desfase incoherente; `today` en medianoche; recuerda la zona aunque luego falle (D-1). | RF-01, RF-23, RF-31 a RF-34, RF-46 |
| shared | `error-handler.middleware.test.ts` | Sobre de error, `details` solo en validación, JSON mal formado, cuerpo de más de 100 kB y charset no soportado → `VALIDATION_ERROR`, error inesperado sin detalles internos, ruta inexistente, `OPTIONS`/`PUT` → `ROUTE_NOT_FOUND` con sobre, `HEAD` → `404` sin cuerpo, `PUT /tasks` sin usuario → `ROUTE_NOT_FOUND`. | Principio VII, RF-46 |
| tasks | `task.entity.test.ts` | Reglas de día: cerrado, no empezado, completar y desmarcar idempotentes. | RF-11, RF-12, RF-14, RF-45 |
| tasks | `task.schema.test.ts` | Recorte de espacios, 200/201 y 1000/1001 caracteres, descripción vacía → `null`, campos desconocidos y `date` en `PATCH`, `from > to`, `date` + `from`, `page`/`pageSize` inválidos, `status` inválido. | RF-04 a RF-06, RF-10, RF-37, RF-38, RF-42, RF-43 |
| tasks | `create-task.use-case.test.ts` | Crea pendiente; hoy y futuro aceptados; pasado → `DAY_CLOSED`. | RF-03, RF-07 |
| tasks | `list-task.use-case.test.ts` | Por día, todas, por estado, por rango inclusivo, paginación y orden. | RF-08 a RF-10, RF-39 a RF-41 |
| tasks | `get-task.use-case.test.ts` | Propia (también de días pasados), ajena, inexistente, id con formato no UUID. | RF-16, RF-44 |
| tasks | `update-task.use-case.test.ts` | Editar título y descripción; completar hoy; completar futuro → `DAY_NOT_STARTED`; pasado → `DAY_CLOSED`; desmarcar; tarea ajena. | RF-11 a RF-14, RF-16, RF-45 |
| tasks | `delete-task.use-case.test.ts` | Borra (hoy y futuro); pasado → `DAY_CLOSED`; ajena o inexistente. | RF-14 a RF-16 |
| tasks | `get-productive-date.use-case.test.ts` | Días con al menos una completada, sin duplicados, hasta hoy, ordenados. | RF-17, RF-18, RF-22 |
| tasks | `get-pending-task.use-case.test.ts` | Solo pendientes del usuario en el rango. | RF-24 a RF-26 (soporte) |
| tasks | `task.routes.test.ts` | Contrato completo de los 5 endpoints de tareas: códigos HTTP, sobre, aislamiento entre usuarios y precedencia de errores combinados. | RF-02, RF-03 a RF-16, RF-37 a RF-46, principio VII |
| tasks | `prisma-task.repository.int.test.ts` | CRUD, aislamiento por usuario, orden y paginación en SQL, `DATE` sin desplazamiento, `SELECT DISTINCT` de días productivos. | RF-02, RF-15, RF-41, R-4 |
| streaks | `streak.value-object.test.ts` | Todos los ejemplos de RF-17 a RF-21, cambio de mes y año, 29 de febrero, sin días productivos → 0/0. | RF-17 a RF-21, CE-02 |
| streaks | `get-streak.use-case.test.ts` | Hoy productivo, hoy aún no productivo, días pasados inmutables. | RF-19, RF-20, RF-22, RF-23 |
| streaks | `streak.routes.test.ts` | `GET /streak` con el sobre y los errores de cabecera. | RF-01, RF-31 a RF-33, principio VII |
| alerts | `alert.entity.test.ts` | La copia `{ id, title, date }` se construye una vez y no cambia aunque cambien las tareas de origen. | RF-30 |
| alerts | `alert-window.value-object.test.ts` | Periodos y días de disparo (viernes 2026-10-23, 2026-10-29, 2027-02-26), vencido antes y después de las 22:00, recuperación hasta el fin de la ventana y rango sin días cerrados. | RF-24 a RF-26, RF-47 |
| alerts | `generate-due-alert.use-case.test.ts` | Crea los avisos vencidos; omite sin pendientes y no reevalúa; nunca duplica; sin zona no hay avisos; usa la zona recordada; copia inmutable; tres avisos el mismo día; recuperación tras parada. | RF-24 a RF-28, RF-30, RF-35, RF-36, RF-47, CE-04 |
| alerts | `record-user-time-zone.use-case.test.ts` | Guarda la zona y la actualiza solo si cambia. | RF-34 |
| alerts | `list-alert.use-case.test.ts` | Orden de más reciente a más antiguo y paginación. | RF-29, RF-39 |
| alerts | `alert.scheduler.test.ts` | Pasada inicial, intervalo de 60 s con temporizadores falsos, sin solapamiento, registro dentro de los 5 min. | RNF-02 |
| alerts | `alert.routes.test.ts` | `GET /alerts` con el sobre, paginación válida e inválida, copia de tareas tras borrarlas. | RF-29, RF-30, RF-39, RF-42, principio VII |
| alerts | `prisma-alert.repository.int.test.ts` | `claimPeriod` concurrente (solo uno gana), restricción única, `JSONB` intacto tras borrar la tarea. | RF-28, RF-30 |
| alerts | `prisma-user-time-zone.repository.int.test.ts` | Upsert que no escribe si la zona no cambia; lotes. | RF-34, RF-36 |
| — | `tests/performance/api.perf.test.ts` | p95 < 300 ms por endpoint con 10 000 tareas en 3 años; duración de una pasada del planificador. | RNF-01, CE-05, R-1 |

RNF-03 (mensajes en español) se comprueba en todos los tests HTTP. CE-01 y CE-03 se cubren en `task.routes.test.ts` y `streak.routes.test.ts`.

## 11. Trazabilidad

| RF | Archivo(s) | Test(s) |
| :--- | :--- | :--- |
| RF-01 | `shared/infrastructure/http/request-context.middleware.ts`, `request-header.schema.ts` | `request-context.middleware.test.ts`, `*.routes.test.ts` |
| RF-02 | `tasks/infrastructure/prisma-task.repository.ts`, `alerts/infrastructure/prisma-alert.repository.ts`, casos de uso (filtro por `userId`) | `task.routes.test.ts`, `prisma-task.repository.int.test.ts` |
| RF-03 | `tasks/application/create-task.use-case.ts`, `task.controller.ts` | `create-task.use-case.test.ts`, `task.routes.test.ts` |
| RF-04, RF-05 | `tasks/infrastructure/task.schema.ts`, `task.entity.ts` (constantes) | `task.schema.test.ts`, `task.routes.test.ts` |
| RF-06 | `task.schema.ts`, `shared/domain/local-date.value-object.ts` | `task.schema.test.ts`, `local-date.value-object.test.ts` |
| RF-07 | `create-task.use-case.ts` | `create-task.use-case.test.ts`, `task.routes.test.ts` |
| RF-08 a RF-10 | `list-task.use-case.ts`, `task.schema.ts`, `prisma-task.repository.ts` | `list-task.use-case.test.ts`, `task.schema.test.ts`, `task.routes.test.ts` |
| RF-11, RF-12 | `task.entity.ts`, `update-task.use-case.ts` | `task.entity.test.ts`, `update-task.use-case.test.ts` |
| RF-13 | `update-task.use-case.ts`, `task.schema.ts` | `update-task.use-case.test.ts`, `task.schema.test.ts` |
| RF-14 | `task.entity.ts`, `update-task.use-case.ts`, `delete-task.use-case.ts` | `task.entity.test.ts`, `update-task.use-case.test.ts`, `delete-task.use-case.test.ts` |
| RF-15 | `delete-task.use-case.ts`, `prisma-task.repository.ts` | `delete-task.use-case.test.ts`, `prisma-task.repository.int.test.ts` |
| RF-16 | `get-task.use-case.ts`, `update-task.use-case.ts`, `delete-task.use-case.ts` | `get-task.use-case.test.ts`, `update-task.use-case.test.ts`, `delete-task.use-case.test.ts` |
| RF-17, RF-18 | `tasks/application/get-productive-date.use-case.ts`, `streaks/domain/streak.value-object.ts` | `get-productive-date.use-case.test.ts`, `streak.value-object.test.ts` |
| RF-19 a RF-21 | `streak.value-object.ts`, `get-streak.use-case.ts` | `streak.value-object.test.ts`, `get-streak.use-case.test.ts` |
| RF-22 | `streak.value-object.ts`, `task.entity.ts` (inmutabilidad de días pasados) | `get-streak.use-case.test.ts`, `get-productive-date.use-case.test.ts` |
| RF-23 | `request-context.middleware.ts` | `request-context.middleware.test.ts`, `get-streak.use-case.test.ts` |
| RF-24 a RF-26 | `alerts/domain/alert-window.value-object.ts`, `generate-due-alert.use-case.ts` | `alert-window.value-object.test.ts`, `generate-due-alert.use-case.test.ts` |
| RF-27, RF-28 | `generate-due-alert.use-case.ts`, `prisma-alert.repository.ts` (`claimPeriod`) | `generate-due-alert.use-case.test.ts`, `prisma-alert.repository.int.test.ts` |
| RF-29 | `list-alert.use-case.ts`, `prisma-alert.repository.ts` | `list-alert.use-case.test.ts`, `alert.routes.test.ts` |
| RF-30 | `alert.entity.ts`, `alert.mapper.ts`, `prisma-alert.repository.ts` | `alert.entity.test.ts`, `generate-due-alert.use-case.test.ts`, `prisma-alert.repository.int.test.ts`, `alert.routes.test.ts` |
| RF-31 a RF-33 | `request-context.middleware.ts`, `request-header.schema.ts`, `intl-time-zone.adapter.ts` | `request-context.middleware.test.ts`, `intl-time-zone.adapter.test.ts` |
| RF-34 | `request-context.middleware.ts`, `record-user-time-zone.use-case.ts`, `prisma-user-time-zone.repository.ts` | `request-context.middleware.test.ts`, `record-user-time-zone.use-case.test.ts`, `prisma-user-time-zone.repository.int.test.ts` |
| RF-35 | `intl-time-zone.adapter.ts`, `generate-due-alert.use-case.ts` | `intl-time-zone.adapter.test.ts`, `generate-due-alert.use-case.test.ts` |
| RF-36 | `generate-due-alert.use-case.ts`, `prisma-user-time-zone.repository.ts` | `generate-due-alert.use-case.test.ts`, `prisma-user-time-zone.repository.int.test.ts` |
| RF-37, RF-38 | `task.schema.ts` | `task.schema.test.ts`, `task.routes.test.ts` |
| RF-39 | `shared/domain/pagination.value-object.ts`, `pagination.schema.ts`, `list-task.use-case.ts`, `list-alert.use-case.ts` | `pagination.value-object.test.ts`, `list-task.use-case.test.ts`, `list-alert.use-case.test.ts` |
| RF-40, RF-41 | `list-task.use-case.ts`, `prisma-task.repository.ts` | `list-task.use-case.test.ts`, `prisma-task.repository.int.test.ts` |
| RF-42, RF-43 | `pagination.schema.ts`, `task.schema.ts` | `task.schema.test.ts`, `alert.routes.test.ts` |
| RF-44 | `get-task.use-case.ts` | `get-task.use-case.test.ts`, `task.routes.test.ts` |
| RF-45 | `task.entity.ts`, `update-task.use-case.ts` | `task.entity.test.ts`, `update-task.use-case.test.ts` |
| RF-46 | `app.factory.ts` (orden de montaje), `allowed-method.middleware.ts`, `request-context.middleware.ts`, `json-body.middleware.ts`, `request-validation.helper.ts`, `error-handler.middleware.ts`, `route-not-found.middleware.ts` | `request-context.middleware.test.ts`, `error-handler.middleware.test.ts`, `task.routes.test.ts` |
| RF-47 | `alert-window.value-object.ts`, `generate-due-alert.use-case.ts`, `alert.scheduler.ts` (pasada al arrancar) | `alert-window.value-object.test.ts`, `generate-due-alert.use-case.test.ts`, `alert.scheduler.test.ts` |
| RNF-01 | Índices de la sección 4, `streak.value-object.ts` | `api.perf.test.ts` |
| RNF-02 (con el sistema en funcionamiento) | `alert.scheduler.ts`, `generate-due-alert.use-case.ts` | `alert.scheduler.test.ts`, `api.perf.test.ts` |
| RNF-03 | `error-code.constant.ts`, `response-envelope.helper.ts`, schemas Zod | Todos los `*.routes.test.ts` |
