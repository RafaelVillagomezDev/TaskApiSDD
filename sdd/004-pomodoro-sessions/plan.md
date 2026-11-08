# Plan: Sesiones pomodoro — temporizador con una lista de tareas, racha y logros propios
Spec: `sdd/004-pomodoro-sessions/spec.md` (Aprobada) · Estado: Aprobado · Fecha: 2026-11-08

Los RF, RNF, CE y S de este plan son los de la spec 004; cuando se cita otra funcionalidad se indica («RF-34 de la 002», «D-8 de la 001»). Las decisiones de este plan se numeran D-1, D-2… dentro de la 004.

## 1. Resumen técnico

Un módulo vertical nuevo, `pomodoros`, con la misma arquitectura hexagonal que los demás, gestiona sesiones, tareas del pomodoro, racha y logros sobre tres tablas nuevas: `pomodoros`, `pomodoro_tasks` y `pomodoro_achievements`. No hay dependencias nuevas.

- **Temporizador sin procesos por sesión.** La sesión guarda `ends_at` (en curso) o `remaining_ms` (pausada). El estado se calcula con el `Clock` del servidor (RNF-02). Una sesión en curso cuyo `ends_at` ya pasó se **asienta** (se termina por tiempo con `finished_at = ends_at`) de dos formas idempotentes: al principio de cualquier petición del pomodoro de ese usuario, y en un barrido cada 60 s con el `IntervalRunner` que ya usan avisos y limpieza (D-2).
- **Una sola sesión activa por usuario,** garantizada por la base de datos con una columna `active_user_id` única que vale `user_id` mientras la sesión está activa y `NULL` al terminar (D-3).
- **Al terminar:** se guarda la foto de las tareas en JSONB (como `alerts.tasks`), las pendientes pasan a espera (`pomodoro_id = NULL`), se calcula el día local del fin con la zona recordada del usuario y se desbloquean los logros alcanzados, todo en una transacción que bloquea la fila de la sesión (D-4, D-5).
- **Racha:** el cálculo de `Streak` de la 001 se mueve a `src/shared/domain/` para reutilizarlo sin que un módulo importe a otro (D-6).
- **Zona recordada:** se lee a través de una fachada nueva del módulo `alerts`, dueño de `user_time_zones` (D-7).
- **Reglas de texto:** las de título, descripción y día se extraen de `tasks` a `src/shared/` para no duplicarlas (D-8).

## 2. Comprobación constitucional

**Excepciones usadas:**
- **Principio II:** dos refactors sin cambio observable, que la excepción del principio permite sin spec: mover `Streak` de `streaks/domain/` a `src/shared/domain/` (D-6) y extraer los schemas de texto de `tasks` a `src/shared/` (D-8). Los tests de la 001 deben seguir en verde sin tocar sus expectativas.
- **Principio VII:** las respuestas a `HEAD` siguen sin cuerpo, como en la 001.

| Principio | Cómo lo cumple este plan | Estado |
| :--- | :--- | :--- |
| **I. Stack cerrado** | Sin dependencias nuevas. El temporizador usa el `Clock` y el `IntervalRunner` existentes; la exclusión de sesiones activas, una restricción `UNIQUE` de PostgreSQL; los bloqueos, `$queryRaw` con plantilla etiquetada (patrón ya usado en `prisma-session.repository.ts`). | ✅ |
| **II. Sin spec no hay cambio** | Todo el comportamiento sale de la spec 004 *Aprobada* (64 RF). Las decisiones de la sección 7 son técnicas. Las dos refactorizaciones son la excepción declarada arriba. El hueco detectado al planificar (orden de las tareas dentro de una sesión) no se decidió aquí: se preguntó y se añadió antes a la spec como RF-64 (R-1). | ✅ |
| **III. Tests y calidad** | Cada `*.use-case.ts` y cada fichero de `domain/` con lógica tiene su test (sección 10). Los repositorios Prisma tienen tests de integración y las rutas, tests HTTP con la precedencia de RF-63. Sin código duplicado: racha y schemas de texto se comparten (D-6, D-8). El código sigue AGENTS.md §8: constantes con nombre (`MAX_TASKS_PER_POMODORO = 20`, `DEFAULT_DURATION_MINUTES = 25`…), complejidad ≤ 15, sin `any`. | ✅ |
| **IV. Migraciones y secretos** | Una migración nueva, `<AAAAMMDDHHMMSS>_pomodoro_sessions`, crea las tres tablas, dos enums y sus índices. No borra ni modifica datos existentes. Sin variables de entorno nuevas. | ✅ |
| **V. Separación hexagonal** | `pomodoros/domain/` solo importa `src/shared/domain/`. La zona recordada se lee con un puerto propio (`UserTimeZoneSource`) implementado con la fachada nueva `alerts/alert.facade.ts` (D-7), igual que `streaks` lee las tareas con `task.facade.ts`. `pomodoros` no importa `tasks` (RF-02). Las entradas se validan con Zod en `infrastructure/`. La sesión y el contexto llegan inyectados desde el contenedor, como en los demás routers. | ✅ |
| **VI. Clarificar antes de suponer** | La spec está *Aprobada* y sin marcas. El hueco R-1 se preguntó al usuario (2026-11-08) y está en la spec como RF-64. | ✅ |
| **VII. Formato de respuesta único** | Éxitos con `sendSuccess` (`201` en `POST /pomodoros`, `200` en el resto, `data: null` en `DELETE /pomodoro-tasks/{id}`), errores con el middleware de errores. Ningún `204`. La petición previa de CORS usa `allowPreflight`, que responde con el sobre. | ✅ |

## 3. Estructura de archivos

### Raíz y configuración

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `prisma/schema.prisma` | Modificado | Modelos `Pomodoro`, `PomodoroTask` y `PomodoroAchievement`, enums `PomodoroStatus` y `PomodoroEndReason`, y relaciones en `User` (sección 4). |
| `prisma/migrations/<AAAAMMDDHHMMSS>_pomodoro_sessions/migration.sql` | Nuevo | Crea las tablas, enums e índices. Se genera con `prisma migrate diff` (AGENTS.md §3). |
| `AGENTS.md` | Modificado | §2: el módulo `pomodoros` (004) en la lista de módulos. |
| `README.md` | Modificado | Estado de la 004, endpoints, reglas de negocio, modelo de datos y estructura (Gobierno 7). |

### `src/` (raíz)

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `dependency.container.ts` | Modificado | Crea el repositorio, los casos de uso, el controlador, el router y el `PomodoroScheduler`; añade `pomodoroRouter` a `routers` y `pomodoroScheduler` al `Container`. |
| `server.main.ts` | Modificado | Arranca y para `pomodoroScheduler` junto a los otros dos. |

### `src/shared/`

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `domain/streak.value-object.ts` | Movido desde `streaks/domain/` | `Streak.calculate(dates, today)` sin cambios (D-6). |
| `domain/task-text.constant.ts` | Nuevo | `TITLE_MAX_LENGTH = 200` y `DESCRIPTION_MAX_LENGTH = 1000`, que hoy están en `task.entity.ts` (D-8). |
| `infrastructure/http/task-text.schema.ts` | Nuevo | `daySchema`, `titleSchema`, `descriptionSchema` y `optionalDescriptionSchema`, extraídos de `task.schema.ts` (D-8). |
| `domain/error-code.constant.ts` | Modificado | Ocho códigos nuevos (sección 6), todos con `precedence: 7`; el orden dentro del grupo lo da el orden de comprobación de cada caso de uso (RF-63, D-10). |

### `src/modules/pomodoros/` (nuevo)

| Archivo | Qué hace |
| :--- | :--- |
| `domain/pomodoro.entity.ts` | `Pomodoro`: estado, `startedAt`, `endsAt`, `remainingMs`, `durationMinutes`. Métodos puros con el instante como parámetro: `isActive()`, `isDue(now)`, `remainingSeconds(now)`, `pause(now)`, `resume(now)`, `finish(now, reason)` (calcula `focusedSeconds` y lanza `INVALID_POMODORO_STATE` si el cambio no está permitido, RF-34, RF-61). Constantes `MIN_DURATION_MINUTES`, `MAX_DURATION_MINUTES`, `DEFAULT_DURATION_MINUTES`, `MAX_TASKS_PER_POMODORO`. |
| `domain/pomodoro-task.entity.ts` | `PomodoroTask`: `complete(now)`, `uncomplete()`, `edit(title, description)`, `moveTo(pomodoroId, today)` (fecha pasada → hoy, RF-21), `toSnapshot()` (RF-16). |
| `domain/achievement.value-object.ts` | Catálogo fijo de RF-43 (código, nombre, descripción, meta, tipo de métrica) y `reached(stats)`: códigos cuya meta se alcanza con unas estadísticas dadas (RF-44 a RF-47). |
| `domain/pomodoro.repository.ts` | Puerto de sesiones y tareas (sección 5.1). |
| `domain/achievement.repository.ts` | Puerto de logros: `unlock(userId, codes, at)` (no sobrescribe), `listUnlocked(userId)` y `stats(userId)` (sesiones por tiempo, mejor día, tareas completadas, concentración, días productivos). |
| `domain/user-time-zone.port.ts` | `UserTimeZoneSource.find(userId)`: zona recordada del usuario (D-7). |
| `application/settle-due-pomodoro.use-case.ts` | Asienta la sesión vencida de un usuario (`forUser`) o de un lote (`dueBatch`), con la foto, las tareas en espera, el día local y los logros (5.3). |
| `application/start-pomodoro.use-case.ts` | `POST /pomodoros` (5.4). |
| `application/get-pomodoro.use-case.ts` | `GET /pomodoros/{id}`. |
| `application/list-pomodoro.use-case.ts` | `GET /pomodoros`, paginado. |
| `application/change-pomodoro-status.use-case.ts` | `PATCH /pomodoros/{id}`: pausar, reanudar o terminar (5.5). |
| `application/add-pomodoro-task.use-case.ts` | `POST /pomodoros/{id}/tasks` (5.6). |
| `application/remove-pomodoro-task.use-case.ts` | `DELETE /pomodoros/{id}/tasks/{taskId}` (5.6). |
| `application/list-waiting-pomodoro-task.use-case.ts` | `GET /pomodoro-tasks`, paginado. |
| `application/update-pomodoro-task.use-case.ts` | `PATCH /pomodoro-tasks/{id}`: editar, completar o desmarcar (5.7). |
| `application/delete-pomodoro-task.use-case.ts` | `DELETE /pomodoro-tasks/{id}` (5.7). |
| `application/get-pomodoro-streak.use-case.ts` | `GET /pomodoro-streak` con `Streak.calculate` (5.8). |
| `application/list-pomodoro-achievement.use-case.ts` | `GET /pomodoro-achievements`: catálogo + progreso + desbloqueados (5.9). |
| `application/unlock-pomodoro-achievement.use-case.ts` | Calcula las estadísticas y desbloquea lo alcanzado con el instante del evento; lo llaman asentar, terminar y completar (5.9). |
| `infrastructure/pomodoro.schema.ts` | Zod: cuerpos de `POST /pomodoros`, `PATCH /pomodoros/{id}`, `POST /pomodoros/{id}/tasks` y `PATCH /pomodoro-tasks/{id}` (objetos estrictos), parámetros y paginación. |
| `infrastructure/pomodoro.mapper.ts` | Dominio → recursos `Pomodoro`, `PomodoroTask` y `Achievement` de la spec; fila Prisma ↔ dominio. |
| `infrastructure/pomodoro.controller.ts` | Sesiones: `start`, `list`, `get`, `changeStatus`, `addTasks`, `removeTask`. |
| `infrastructure/pomodoro-task.controller.ts` | Tareas en espera: `listWaiting`, `update`, `remove`. |
| `infrastructure/pomodoro-progress.controller.ts` | `streak` y `achievements`. |
| `infrastructure/pomodoro.routes.ts` | Las 11 rutas: sesión → contexto → JSON → controlador (D-8 de la 001), y `allowPreflight` de cada ruta. |
| `infrastructure/prisma-pomodoro.repository.ts` | Implementa `PomodoroRepository` con transacciones y `SELECT … FOR UPDATE` (D-4). |
| `infrastructure/prisma-achievement.repository.ts` | Implementa `AchievementRepository` con agregados SQL (5.9). |
| `infrastructure/user-time-zone.adapter.ts` | Implementa `UserTimeZoneSource` con la fachada de `alerts` (D-7). |
| `infrastructure/pomodoro.scheduler.ts` | Barrido cada 60 s con `IntervalRunner`, evento de fallo `POMODORO_SETTLE_FAILED` (D-2). |

### Módulos existentes

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `alerts/alert.facade.ts` | Nuevo | Fachada pública de `alerts`: exporta `GetUserTimeZoneUseCase` (D-7). |
| `alerts/application/get-user-time-zone.use-case.ts` | Nuevo | `execute(userId)` → zona recordada o `null`. |
| `alerts/domain/user-time-zone.repository.ts` | Modificado | Añade `find(userId)`. |
| `alerts/infrastructure/prisma-user-time-zone.repository.ts` | Modificado | Implementa `find` por clave primaria. |
| `streaks/domain/streak.value-object.ts` | Movido a `src/shared/domain/` | Los imports de `streaks` cambian; nada más (D-6). |
| `tasks/domain/task.entity.ts` | Modificado | Importa las constantes de longitud de `src/shared/domain/task-text.constant.ts` y las reexporta (D-8). |
| `tasks/infrastructure/task.schema.ts` | Modificado | Usa los schemas de `src/shared/infrastructure/http/task-text.schema.ts` (D-8). |

### `tests/` y documentación

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `tests/support/in-memory-pomodoro.repository.ts` | Nuevo | Fake de `PomodoroRepository` con la misma semántica (una activa, foto, espera). |
| `tests/support/in-memory-achievement.repository.ts` | Nuevo | Fake de `AchievementRepository`. |
| `tests/support/in-memory-user-time-zone.repository.ts` | Modificado | Implementa `find`. |
| `tests/support/test.container.ts` | Modificado | Cablea el módulo con los fakes y el `FakeClock`. |
| `tests/performance/api.perf.test.ts` | Modificado | Mide los endpoints del pomodoro con 10 000 tareas del pomodoro (RNF-01). |
| `sdd/004-pomodoro-sessions/quickstart.md` | Nuevo | Pruebas manuales con `curl` (QS-01…). |
| `sdd/004-pomodoro-sessions/pomodoro-sessions.postman-collection.json` | Nuevo | Colección de Postman de los 11 endpoints, como las de la 001 y la 002. |
| `sdd/004-pomodoro-sessions/tasks.md` | Nuevo | Desglose de este plan, tras su aprobación. |

## 4. Modelo de datos

### `pomodoros`

| Columna | Tipo | Restricciones | Notas |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK, `gen_random_uuid()` | |
| `user_id` | `UUID` | NOT NULL, FK `users` `ON DELETE CASCADE` | Borrar la cuenta borra sus sesiones. |
| `active_user_id` | `UUID` | UNIQUE, NULL | `= user_id` mientras la sesión está en curso o pausada; `NULL` al terminar. Garantiza una sola sesión activa por usuario (RF-12, D-3). |
| `duration_minutes` | `SMALLINT` | NOT NULL, `CHECK 1..120` | RF-09. |
| `status` | `pomodoro_status` | NOT NULL | `running`, `paused`, `finished` (RF-14). |
| `started_at` | `TIMESTAMPTZ(3)` | NOT NULL | |
| `ends_at` | `TIMESTAMPTZ(3)` | NULL | Fin previsto; `NULL` mientras está pausada o terminada (RF-30). |
| `remaining_ms` | `INTEGER` | NULL | Tiempo que queda mientras está pausada (RF-30). |
| `finished_at` | `TIMESTAMPTZ(3)` | NULL | Por tiempo, `= ends_at` (RF-15); a mano, el instante de la petición (RF-32). |
| `finished_on` | `DATE` | NULL | Día local del fin según la zona recordada (RF-40). Base de la racha y de `MARATHON`. |
| `end_reason` | `pomodoro_end_reason` | NULL | `time` o `manual` (RF-33). |
| `focused_seconds` | `INTEGER` | NULL | Duración menos el tiempo restante al terminar, sin pausas (RF-33, RF-47). |
| `tasks_snapshot` | `JSONB` | NULL | Foto al terminar: `[{ id, title, description, date, completed, completedAt }]` (RF-16), sin clave foránea, como `alerts.tasks`. |
| `created_at` | `TIMESTAMPTZ(3)` | NOT NULL, `now()` | |

Índices: `(user_id, started_at DESC, id DESC)` para el listado (RF-18); `(status, ends_at)` para el barrido de vencidas (D-2); `(user_id, end_reason, finished_on)` para la racha y los logros.

### `pomodoro_tasks`

| Columna | Tipo | Restricciones | Notas |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK | |
| `user_id` | `UUID` | NOT NULL, FK `users` `ON DELETE CASCADE` | |
| `pomodoro_id` | `UUID` | NULL, FK `pomodoros` | Sesión activa en la que está, o sesión terminada en la que se completó. `NULL` = en espera (RF-23). |
| `title` | `VARCHAR(200)` | NOT NULL | Ya recortado (RF-53). |
| `description` | `VARCHAR(1000)` | NULL | Ya recortada; vacía → `NULL` (RF-53). |
| `date` | `DATE` | NOT NULL | RF-04, RF-21. |
| `position` | `INTEGER` | NULL | Lugar en la sesión: al añadir, el mayor `position` de la sesión + 1, en el orden de RF-64 (`newTasks` y después `waitingTaskIds`), calculado con la fila de la sesión bloqueada (D-4). `NULL` en espera; quitar y volver a añadir la pone al final (D-12). |
| `completed` | `BOOLEAN` | NOT NULL, `false` | |
| `completed_at` | `TIMESTAMPTZ(3)` | NULL | RF-13. |
| `sequence` | `BIGINT` | UNIQUE, autoincremental | Orden de creación exacto, como `tasks.sequence` (D-24 de la 001). |
| `created_at`, `updated_at` | `TIMESTAMPTZ(3)` | NOT NULL | |

Índices: `(user_id, pomodoro_id, completed, date, sequence)` para las tareas en espera en orden (RF-24); `(pomodoro_id, position)` para las tareas de una sesión en orden (RF-64); `(user_id, completed)` para el progreso de `TASKS_*` (RF-46).

### `pomodoro_achievements`

| Columna | Tipo | Restricciones | Notas |
| :--- | :--- | :--- | :--- |
| `user_id` | `UUID` | PK (con `code`), FK `users` `ON DELETE CASCADE` | |
| `code` | `VARCHAR(32)` | PK (con `user_id`) | Código del catálogo de RF-43. |
| `unlocked_at` | `TIMESTAMPTZ(3)` | NOT NULL | Instante del evento que lo alcanzó (RF-44). Nunca se borra ni se actualiza. |

Solo se guardan los logros conseguidos; el progreso se calcula al leer (D-5).

### Estados de una tarea del pomodoro

| `pomodoro_id` | Sesión | `completed` | Significa |
| :--- | :--- | :--- | :--- |
| `NULL` | — | `false` | En espera (RF-23). Nunca hay una tarea en espera completada (RF-35). |
| Sesión activa | `running`/`paused` | `false`/`true` | En la sesión activa (RF-13, RF-48). |
| Sesión terminada | `finished` | `true` | Completada en esa sesión; parte del historial (RF-35, RF-22, RF-34). |

## 5. Lógica principal

### 5.1 Puerto `PomodoroRepository`

Cada operación que cambia una sesión es atómica en el repositorio Prisma: abre una transacción y bloquea la fila de la sesión con `SELECT 1 FROM "pomodoros" WHERE "id" = ${id}::uuid FOR UPDATE` (plantilla etiquetada, AGENTS.md §8). El puerto expone operaciones de alto nivel (`create`, `findById`, `findActive`, `listPage`, `applyStatusChange`, `finish`, `addTasks`, `removeTask`, `findTask`, `saveTask`, `deleteTask`, `listWaitingPage`, `findDue`), y la lógica de reglas vive en las entidades de `domain/`.

### 5.2 Orden de una petición (RF-63; RF-34 de la 002)

`ROUTE_NOT_FOUND` → sesión y CSRF (middleware de sesión) → `INVALID_CLIENT_TIME` e `INVALID_TIMEZONE` (middleware de contexto, que recuerda la zona) → `VALIDATION_ERROR` (Zod) → **asentar la sesión vencida del usuario** (5.3) → errores de negocio en este orden: `POMODORO_NOT_FOUND`/`POMODORO_TASK_NOT_FOUND`, `INVALID_POMODORO_STATE`, `POMODORO_TASK_LIMIT`, `POMODORO_ALREADY_ACTIVE`/`POMODORO_TASK_IN_SESSION`/`POMODORO_TASK_NOT_IN_SESSION`/`POMODORO_TASK_COMPLETED`, y al final `DAY_CLOSED`. Un id que no es UUID responde el `*_NOT_FOUND` correspondiente, como `TASK_NOT_FOUND` en la 001 (D-10 de la 001).

### 5.3 Asentar una sesión vencida (RF-15, RF-16, RF-23, RF-33, RF-35, RF-40)

Una sesión `running` con `ends_at <= now` está terminada aunque nadie lo haya pedido. `SettleDuePomodoroUseCase`, en una transacción con la fila bloqueada y comprobando de nuevo que sigue `running` y vencida (idempotente):
1. `finished_at = ends_at`, `end_reason = time`, `focused_seconds = duration_minutes × 60`, `remaining_ms = NULL`, `active_user_id = NULL`.
2. `finished_on` = fecha local de `finished_at` en la zona recordada del usuario (`UserTimeZoneSource`; existe siempre, porque empezar una sesión pasa por el middleware que la recuerda, RF-03).
3. `tasks_snapshot` con todas las tareas de la sesión en orden de `position` (RF-64); las pendientes pasan a `pomodoro_id = NULL` (en espera) y las completadas se quedan.
4. Desbloquea logros con `at = finished_at` (5.9).

Se llama al principio de cada caso de uso del pomodoro con el `userId` de la petición, y desde `PomodoroScheduler` cada 60 s para todas las vencidas (`findDue(now, batchSize)`, lotes de `SETTLE_BATCH_SIZE = 100`). Así el estado que ve el usuario siempre es exacto (RNF-02) y la zona usada es la recordada en el momento del fin con un desfase máximo de unos 60 s (R-3).

### 5.4 Empezar una sesión (RF-04 a RF-12, RF-21, RF-49, RF-52, RF-56)

1. Zod valida el cuerpo: `durationMinutes` entero de 1 a 120 (25 por defecto), `newTasks` con `title`/`description`/`date`, `waitingTaskIds` sin repetir, como mucho 20 entre las dos listas (RF-55, RF-56).
2. Asentar (5.3).
3. En la transacción: cada id de `waitingTaskIds` debe existir, ser del usuario y estar en espera → si no, `POMODORO_TASK_NOT_FOUND` (RF-11). Si el usuario tiene una sesión activa → `POMODORO_ALREADY_ACTIVE` (RF-12). Alguna `newTasks[].date` anterior a `today` → `DAY_CLOSED` (RF-05).
4. Inserta la sesión (`running`, `ends_at = now + duración`, `active_user_id = user_id`), las tareas nuevas y mueve las de espera con `moveTo` (fecha pasada → `today`, RF-21).
5. Si dos peticiones simultáneas pasan el paso 3, la segunda choca con el `UNIQUE` de `active_user_id` (Prisma `P2002`) y se traduce a `POMODORO_ALREADY_ACTIVE` (D-3).
6. `201` con la sesión.

### 5.5 Pausar, reanudar y terminar (RF-30 a RF-34, RF-50, RF-60, RF-61)

Tras asentar, con la fila bloqueada, la entidad aplica el cambio:
- `paused` desde `running`: `remaining_ms = ends_at − now`, `ends_at = NULL`.
- `running` desde `paused`: `ends_at = now + remaining_ms`, `remaining_ms = NULL`.
- `finished` desde `running` o `paused`: como 5.3 pero con `finished_at = now`, `end_reason = manual`, `focused_seconds = duración − restante` (redondeado hacia abajo) y `finished_on` con la zona de la petición, que es la recién recordada.
- Cualquier otro cambio, incluido pedir el estado actual → `INVALID_POMODORO_STATE`. Una sesión asentada en el paso previo ya es `finished`, así que `paused` sobre ella responde `INVALID_POMODORO_STATE`.

### 5.6 Añadir y quitar tareas de la sesión activa (RF-25 a RF-29, RF-51, RF-59, RF-62)

- **Añadir:** asentar → `POMODORO_NOT_FOUND` → ids de espera (`POMODORO_TASK_NOT_FOUND`) → sesión terminada (`INVALID_POMODORO_STATE`) → total actual + nuevas > 20 (`POMODORO_TASK_LIMIT`) → fecha pasada (`DAY_CLOSED`) → inserta y mueve.
- **Quitar:** asentar → `POMODORO_NOT_FOUND` → sesión terminada (`INVALID_POMODORO_STATE`) → tarea no está en la sesión (`POMODORO_TASK_NOT_FOUND`) → completada (`POMODORO_TASK_COMPLETED`) → `pomodoro_id = NULL`.

### 5.7 Editar, completar y borrar tareas (RF-13, RF-22, RF-29, RF-36, RF-48, RF-54, RF-57)

- **`PATCH /pomodoro-tasks/{id}`:** asentar → `POMODORO_TASK_NOT_FOUND` → si su sesión está terminada, `INVALID_POMODORO_STATE` → si lleva `completed` y está en espera, `POMODORO_TASK_NOT_IN_SESSION` (la petición entera, sin editar nada) → aplica `edit`, `complete(now)` o `uncomplete()` sin mirar la fecha (RF-57). Completar desbloquea logros con `at = completed_at` (5.9).
- **`DELETE /pomodoro-tasks/{id}`:** asentar → `POMODORO_TASK_NOT_FOUND` → en una sesión terminada, `INVALID_POMODORO_STATE` → en la sesión activa, `POMODORO_TASK_IN_SESSION` → borra. `200` con `data: null`.

### 5.8 Racha del pomodoro (RF-38 a RF-42)

Asentar → `SELECT DISTINCT finished_on … WHERE user_id = $1 AND end_reason = 'time' AND finished_on <= $today ORDER BY 1` → `Streak.calculate(fechas, today)` (D-6). La racha de la 001 no cambia: lee `tasks`, que esta funcionalidad no toca (RF-42).

### 5.9 Logros (RF-19, RF-43 a RF-47)

- **Estadísticas** (`AchievementRepository.stats`), cada una con un agregado SQL sobre índices: sesiones terminadas por tiempo; mayor número de sesiones por tiempo en un mismo `finished_on` (`MARATHON`); tareas con `completed = true` (cada tarea cuenta una vez, RF-46); suma de `focused_seconds` de todas las terminadas (RF-47); días productivos para la mejor racha (RF-45).
- **Desbloquear** (`UnlockPomodoroAchievementUseCase`): tras asentar, terminar o completar, calcula las estadísticas dentro de la misma transacción, pide al catálogo los códigos alcanzados e inserta los que falten con `createMany({ skipDuplicates: true })` y `unlocked_at` = instante del evento. Un logro ya guardado nunca se toca (RF-44).
- **Consultar:** asentar → estadísticas + logros guardados → los 11 del catálogo en orden, con `progress = min(valor, meta)` y `unlocked`/`unlockedAt` de lo guardado (un logro guardado sale conseguido aunque el progreso haya bajado, RF-44).

## 6. Interfaz

Contrato completo en la spec (sección *Contrato de la API*). Todas las rutas: cookie de sesión, `X-CSRF-Token` en `POST`/`PATCH`/`DELETE`, `X-Client-Time` y `X-Timezone`.

| Método y ruta | Entrada | Salida (`data`) | Errores de negocio (por precedencia) |
| :--- | :--- | :--- | :--- |
| `POST /pomodoros` | `{ durationMinutes?, newTasks?, waitingTaskIds? }` | `201`, `Pomodoro` | `POMODORO_TASK_NOT_FOUND`, `POMODORO_ALREADY_ACTIVE`, `DAY_CLOSED` |
| `GET /pomodoros` | `page`, `pageSize` | `200`, página de `Pomodoro` | — |
| `GET /pomodoros/{id}` | — | `200`, `Pomodoro` | `POMODORO_NOT_FOUND` |
| `PATCH /pomodoros/{id}` | `{ status }` | `200`, `Pomodoro` | `POMODORO_NOT_FOUND`, `INVALID_POMODORO_STATE` |
| `POST /pomodoros/{id}/tasks` | `{ newTasks?, waitingTaskIds? }` | `200`, `Pomodoro` | `POMODORO_NOT_FOUND`, `POMODORO_TASK_NOT_FOUND`, `INVALID_POMODORO_STATE`, `POMODORO_TASK_LIMIT`, `DAY_CLOSED` |
| `DELETE /pomodoros/{id}/tasks/{taskId}` | — | `200`, `Pomodoro` | `POMODORO_NOT_FOUND`, `INVALID_POMODORO_STATE`, `POMODORO_TASK_NOT_FOUND`, `POMODORO_TASK_COMPLETED` |
| `GET /pomodoro-tasks` | `page`, `pageSize` | `200`, página de `PomodoroTask` | — |
| `PATCH /pomodoro-tasks/{id}` | `{ title?, description?, completed? }` | `200`, `PomodoroTask` | `POMODORO_TASK_NOT_FOUND`, `INVALID_POMODORO_STATE`, `POMODORO_TASK_NOT_IN_SESSION` |
| `DELETE /pomodoro-tasks/{id}` | — | `200`, `null` | `POMODORO_TASK_NOT_FOUND`, `INVALID_POMODORO_STATE`, `POMODORO_TASK_IN_SESSION` |
| `GET /pomodoro-streak` | — | `200`, `{ current, best }`, como `GET /streak` | — |
| `GET /pomodoro-achievements` | — | `200`, `Achievement[]` | — |

Códigos nuevos en `error-code.constant.ts` (mensajes en español, RNF-03):

| Código | HTTP | `precedence` | Mensaje |
| :--- | :--- | :--- | :--- |
| `POMODORO_NOT_FOUND` | 404 | 7 | La sesión pomodoro no existe. |
| `POMODORO_TASK_NOT_FOUND` | 404 | 7 | La tarea del pomodoro no existe o no está disponible para esta acción. |
| `INVALID_POMODORO_STATE` | 409 | 7 | La sesión pomodoro no permite esta acción en su estado actual. |
| `POMODORO_TASK_LIMIT` | 409 | 7 | Una sesión pomodoro no puede tener más de 20 tareas. |
| `POMODORO_ALREADY_ACTIVE` | 409 | 7 | Ya tienes una sesión pomodoro en curso o pausada. |
| `POMODORO_TASK_IN_SESSION` | 409 | 7 | La tarea está en la sesión activa: quítala de la sesión antes de borrarla. |
| `POMODORO_TASK_NOT_IN_SESSION` | 409 | 7 | La tarea está en espera: inclúyela en una sesión para completarla. |
| `POMODORO_TASK_COMPLETED` | 409 | 7 | La tarea está completada: desmárcala antes de quitarla de la sesión. |

Mensajes de éxito: «Sesión pomodoro iniciada» en `POST /pomodoros` (ejemplo de la spec) y «Operación realizada con éxito» en el resto, como en la 001.

## 7. Decisiones técnicas

| ID | Decisión | Por qué | Alternativas descartadas |
| :--- | :--- | :--- | :--- |
| D-1 | Un módulo `pomodoros` con tres tablas propias, sin tocar `tasks`. | RF-02 exige que las tareas del pomodoro sean independientes; tablas separadas lo garantizan sin filtros en las consultas de la 001 (CE-03). | Reutilizar `tasks` con una columna de tipo (cambiaría consultas de la 001 y arriesgaría CE-03). |
| D-2 | Fin por tiempo calculado con `ends_at` y asentado de forma perezosa en cada petición del usuario **y** en un barrido cada 60 s con `IntervalRunner`. | Lo perezoso hace exacto lo que ve el usuario (RNF-02) sin depender de la frecuencia del barrido; el barrido asienta las sesiones de usuarios que no vuelven a pedir nada, para que el día local use la zona recordada en el momento del fin (RF-40) y los logros queden guardados. `finished_at = ends_at` en los dos casos, así que el resultado no depende de cuándo se asiente. | Un temporizador por sesión en memoria (se pierde al reiniciar y no escala); solo perezoso (el día local usaría la zona de una petición posterior, R-3); solo barrido (el estado se vería con hasta 60 s de retraso). |
| D-3 | `active_user_id` único y nulo para «una sola sesión activa». | PostgreSQL permite varios `NULL` en un `UNIQUE`, y Prisma lo expresa con `@unique` (sin índices parciales que `migrate diff` no conoce y querría borrar). Cierra la carrera de dos `POST /pomodoros` simultáneos. | Índice único parcial `WHERE status <> 'finished'` (Prisma no lo modela y lo vería como deriva); comprobarlo solo en código (carrera). |
| D-4 | Transacción con `SELECT … FOR UPDATE` sobre la fila de la sesión en cada cambio. | Asentar, terminar, completar y añadir pueden coincidir (barrido y petición, dos pestañas); bloquear la sesión los serializa. Mismo patrón que la rotación de sesiones de la 002. | Bloqueo optimista con versión (más reintentos y código); sin bloqueo (foto o logros incoherentes). |
| D-5 | Logros: solo se guardan los conseguidos (`unlocked_at`); el progreso se calcula al leer. | RF-44 exige recordar el instante y no perder nunca un logro, pero el progreso puede bajar (desmarcar una tarea) y es barato de calcular con agregados indexados. | Guardar contadores de progreso (duplica datos que ya están en las tablas y se desincronizan); calcularlo todo al leer, también `unlockedAt` (no se puede: depende de la historia). |
| D-6 | Mover `Streak` de `streaks/domain/` a `src/shared/domain/`. | Las dos rachas usan exactamente el mismo cálculo (RF-41); `src/shared/` puede importarse desde cualquier módulo (excepción del principio V) y evita duplicar código. | Copiarlo en `pomodoros` (duplicación, SonarQube); exponerlo en una fachada de `streaks` (las fachadas exponen casos de uso, no value objects). |
| D-7 | Fachada nueva `alerts/alert.facade.ts` con `GetUserTimeZoneUseCase`, y un puerto `UserTimeZoneSource` en `pomodoros`. | `user_time_zones` es de `alerts` (lo escribe el middleware de contexto a través de `RecordUserTimeZoneUseCase`); leerla por su fachada respeta el principio V, igual que `streaks` con `task.facade.ts`. | Leer la tabla desde el repositorio de `pomodoros` (acopla a la tabla de otro módulo); guardar la zona en cada sesión (no es «la zona recordada» de RF-40 si el usuario la cambia desde otra ruta). |
| D-8 | Extraer las reglas de texto (título, descripción, día) de `tasks` a `src/shared/`. | RF-06 y RF-53 exigen las mismas reglas que la 001; compartirlas evita duplicación y que diverjan. | Copiar los schemas (duplicación); importar `task.schema.ts` desde `pomodoros` (viola el principio V). |
| D-9 | La foto se guarda como JSONB en `pomodoros.tasks_snapshot`. | Mismo patrón que `alerts.tasks` (RF-30 de la 001): se escribe una vez, se lee entera y no necesita claves foráneas, así sobrevive a que las tareas se muevan o se borren. | Tabla de foto por tarea (más filas y joins para un dato inmutable). |
| D-10 | Todos los códigos nuevos con `precedence: 7`; el orden de RF-63 lo da el orden de comprobación en cada caso de uso. | Ya se hace así con `TOO_MANY_ATTEMPTS`/`INVALID_CREDENTIALS` (comentario en `error-code.constant.ts`), y el test de precedencia por grupos sigue valiendo. Los tests HTTP comprueban los pares de RF-63. | Renumerar la precedencia (rompe el test de grupos y los niveles de la 002). |
| D-11 | Tres controladores en el módulo (sesiones, tareas, progreso) y un router. | Mantiene cada controlador pequeño (complejidad y tamaño) con las rutas agrupadas en un solo sitio. | Un controlador con 11 métodos y 11 casos de uso en el constructor. |
| D-12 | El orden de RF-64 se guarda en una columna `position` por sesión, asignada al añadir (mayor + 1) con la sesión bloqueada. | Da un orden total y estable sin depender de relojes: dos tareas de la misma petición nunca empatan, y quitar y volver a añadir la deja al final. | `added_at` con un desempate por orden en la petición (dos columnas para lo mismo); ordenar por `sequence` (no refleja cuándo se añadió a la sesión). |

## 8. Complexity Tracking

### Dependencias

Ninguna nueva.

### Piezas nuevas

| Pieza | Por qué hace falta | Alternativa más simple descartada |
| :--- | :--- | :--- |
| `PomodoroScheduler` | Asentar sesiones de usuarios inactivos con la zona del momento (RF-40) y guardar sus logros (D-2). | Solo asentar al pedir (R-3). |
| Columna `active_user_id` | Una sola sesión activa sin carreras (D-3). | Comprobación en código. |
| Tabla `pomodoro_achievements` | `unlockedAt` permanente (RF-44, D-5). | Calcular todo al leer. |
| Fachada de `alerts` | Leer la zona recordada respetando el principio V (D-7). | Leer la tabla directamente. |

## 9. Riesgos

| ID | Riesgo | Mitigación |
| :--- | :--- | :--- |
| R-1 | Hueco de la spec detectado al planificar: no decía en qué orden van las tareas dentro de una sesión. | **Resuelto (2026-11-08):** el responsable del proyecto eligió el orden en que se añadieron a la sesión, y se añadió a la spec como RF-64 antes de aprobar este plan. Se implementa con `pomodoro_tasks.position` (D-12). |
| R-2 | Una sesión en curso puede seguir apareciendo `running` en la base de datos hasta 60 s tras su fin. | Ningún caso de uso lee una sesión sin asentarla antes (5.2, 5.3), así que nunca llega a la respuesta. Test: `GET /pomodoros/{id}` con el `FakeClock` pasado `ends_at` y sin barrido → `finished`. |
| R-3 | Si el usuario cambia de zona entre el fin de una sesión y el barrido (≤ 60 s), `finished_on` puede usar la zona nueva. | Ventana de como mucho unos 60 s; afecta solo a sesiones que terminan cerca de la medianoche en el momento exacto de un cambio de zona. Riesgo aceptado. |
| R-4 | El barrido y una petición asientan la misma sesión a la vez. | Bloqueo de fila y comprobación de estado dentro de la transacción (D-4): la segunda ve `finished` y no hace nada. Test de integración con dos asentamientos concurrentes. |
| R-5 | Rendimiento de `GET /pomodoro-achievements` con muchos datos (cinco agregados). | Índices de la sección 4; se mide en `api.perf.test.ts` con 10 000 tareas y 1 000 sesiones (RNF-01). |
| R-6 | Mover `Streak` y los schemas de texto rompe algo de la 001. | Refactor sin cambio de expectativas: los tests de `streaks` y `tasks` deben pasar sin tocarlos, salvo las rutas de import. |
| R-7 | `prisma migrate dev` aborta sin terminal interactiva. | Alternativa no interactiva de AGENTS.md §3 (`prisma migrate diff` + `migrate deploy`). |

## 10. Estrategia de tests

Mismos tipos y ubicación que en la 001 y la 002 (subcarpeta `tests/` junto a cada fichero). Los unitarios usan `FakeClock` y los repositorios en memoria.

| Módulo | Test | Qué comprueba | RF / RNF / CE |
| :--- | :--- | :--- | :--- |
| pomodoros | `pomodoro.entity.test.ts` | Pausar, reanudar y terminar desde cada estado; cambios no permitidos e iguales → `INVALID_POMODORO_STATE`; `remainingSeconds`; `isDue`; ejemplo de 25 min pausada 10 a los 5 (fin a los 35, 25 de concentración); fin a mano a los 10 min → 600 s. | RF-14, RF-15, RF-30 a RF-34, RF-60, RF-61 |
| pomodoros | `pomodoro-task.entity.test.ts` | Completar y desmarcar sin mirar la fecha; editar; `moveTo` con fecha pasada → hoy y con fecha futura → igual; foto. | RF-13, RF-16, RF-21, RF-48, RF-57 |
| pomodoros | `achievement.value-object.test.ts` | Catálogo de 11 en orden; metas exactas (9 → no, 10 → sí); `MARATHON` con 4 en el mismo día y no en dos días; `FOCUS_10H` con 36 000 s. | RF-43, RF-45 a RF-47 |
| pomodoros | `settle-due-pomodoro.use-case.test.ts` | Asienta con `finished_at = ends_at`; pendientes a espera; foto; día local en la zona recordada (sesión de las 23:50 que acaba a las 00:15 → día siguiente); idempotente; no toca pausadas. | RF-15, RF-16, RF-23, RF-35, RF-40 |
| pomodoros | `start-pomodoro.use-case.test.ts` | Crea en curso con 25 por defecto; con tareas nuevas y en espera; espera con fecha pasada → hoy; activa → `POMODORO_ALREADY_ACTIVE`; ids ajenos o no en espera → `POMODORO_TASK_NOT_FOUND`; fecha pasada → `DAY_CLOSED` sin crear nada. | RF-04, RF-05, RF-08 a RF-12, RF-21 |
| pomodoros | `get-pomodoro.use-case.test.ts` | Propia, ajena, inexistente; activa con tareas actuales y terminada con su foto; tareas en el orden de RF-64 (nuevas y después en espera; quitar y volver a añadir → al final). | RF-16, RF-17, RF-20, RF-58, RF-64 |
| pomodoros | `list-pomodoro.use-case.test.ts` | Orden del más reciente al más antiguo y paginación. | RF-18 |
| pomodoros | `change-pomodoro-status.use-case.test.ts` | Los tres cambios; terminar a mano deja pendientes en espera y desbloquea logros de concentración; vencida antes de pausar → `INVALID_POMODORO_STATE`. | RF-30 a RF-34, RF-61 |
| pomodoros | `add-pomodoro-task.use-case.test.ts` | Añadir nuevas y en espera; 19 + 2 → `POMODORO_TASK_LIMIT` sin añadir nada; terminada con 18 + 5 → `INVALID_POMODORO_STATE`; fecha pasada → `DAY_CLOSED`; pausada → permitido. | RF-25, RF-27, RF-59, RF-63 |
| pomodoros | `remove-pomodoro-task.use-case.test.ts` | Quitar pasa a espera; última tarea → sesión vacía; completada → `POMODORO_TASK_COMPLETED`; otra sesión → `POMODORO_TASK_NOT_FOUND`; terminada → `INVALID_POMODORO_STATE`. | RF-26 a RF-28, RF-37 |
| pomodoros | `list-waiting-pomodoro-task.use-case.test.ts` | Solo pendientes sin sesión activa, por fecha y creación, paginadas; nunca completadas. | RF-23, RF-24, RF-35 |
| pomodoros | `update-pomodoro-task.use-case.test.ts` | Editar en espera y en la sesión activa (también completada); completar tarea futura; en espera con `completed` → `POMODORO_TASK_NOT_IN_SESSION` sin editar; sesión terminada → `INVALID_POMODORO_STATE`; completar desbloquea `TASKS_10` con `completedAt`. | RF-13, RF-36, RF-48, RF-57, RF-44 |
| pomodoros | `delete-pomodoro-task.use-case.test.ts` | Borra en espera; en sesión activa → `POMODORO_TASK_IN_SESSION`; completada de una terminada → `INVALID_POMODORO_STATE`; dos veces → `POMODORO_TASK_NOT_FOUND`. | RF-22, RF-29, RF-34 |
| pomodoros | `get-pomodoro-streak.use-case.test.ts` | Solo cuentan las terminadas por tiempo; hoy aún no productivo; días distintos por la zona. | RF-38 a RF-41 |
| pomodoros | `list-pomodoro-achievement.use-case.test.ts` | Sin actividad: 11 con `progress: 0`; progreso limitado a la meta; logro guardado sigue conseguido aunque el progreso baje. | RF-19, RF-44 |
| pomodoros | `unlock-pomodoro-achievement.use-case.test.ts` | Desbloquea con el instante del evento; no sobrescribe; `STREAK_3` con la mejor racha. | RF-44, RF-45 |
| pomodoros | `pomodoro.schema.test.ts` | Duración 0, 121, 25.5 y ausente; 21 tareas; ids repetidos; `newTasks` con textos fuera de límites; `status` inválido o con campos extra; añadir sin tareas; `PATCH` de tarea con `date`, vacío o con campos desconocidos. | RF-06, RF-09, RF-10, RF-50, RF-51, RF-54 a RF-56 |
| pomodoros | `pomodoro.routes.test.ts` | Contrato de los 11 endpoints: códigos, sobre, `201`/`200`, `data: null`, aislamiento entre usuarios, cabeceras obligatorias, pares de precedencia de RF-63, `GET /tasks`, `/streak` y `/alerts` sin cambios tras usar el pomodoro. | RF-01 a RF-03, RF-20, RF-63, CE-01 a CE-03, principio VII |
| pomodoros | `prisma-pomodoro.repository.int.test.ts` | Una sola activa (`UNIQUE` de `active_user_id`, `P2002`); bloqueo y asentamiento concurrente; foto JSONB; paginación; cascada al borrar la cuenta. | RF-12, RF-16, RF-23, R-4 |
| pomodoros | `prisma-achievement.repository.int.test.ts` | Agregados correctos; `skipDuplicates` no cambia `unlocked_at`. | RF-44 a RF-47 |
| pomodoros | `pomodoro.scheduler.test.ts` | Asienta en cada pasada y registra los fallos sin parar. | RF-15 |
| alerts | `get-user-time-zone.use-case.test.ts` | Devuelve la zona o `null`. | RF-40 |
| shared | `streak.value-object.test.ts` (movido) | Los casos actuales, sin cambios. | RF-41, D-6 |
| — | `tests/performance/api.perf.test.ts` | p95 < 300 ms en los endpoints del pomodoro con 10 000 tareas del pomodoro. | RNF-01 |

## 11. Trazabilidad

| RF / RNF / CE | Archivo(s) | Test(s) |
| :--- | :--- | :--- |
| RF-01, RF-03, RF-20 | `pomodoro.routes.ts`, repositorios (filtro por `user_id`) | `pomodoro.routes.test.ts` |
| RF-02, RF-42, CE-03 | Tablas propias (D-1) | `pomodoro.routes.test.ts` |
| RF-04 a RF-07, RF-52 a RF-54 | `pomodoro.schema.ts`, `task-text.schema.ts`, `pomodoro-task.entity.ts`, `start-pomodoro`, `add-pomodoro-task`, `update-pomodoro-task` | Tests de schema, entidad y casos de uso |
| RF-08 a RF-12, RF-49, RF-55, RF-56 | `start-pomodoro.use-case.ts`, `pomodoro.schema.ts`, `active_user_id` | `start-pomodoro.use-case.test.ts`, `prisma-pomodoro.repository.int.test.ts` |
| RF-13, RF-35 a RF-37, RF-57 | `pomodoro-task.entity.ts`, `update-pomodoro-task`, `remove-pomodoro-task` | Sus tests |
| RF-14 a RF-16, RF-23, RF-58 | `pomodoro.entity.ts`, `settle-due-pomodoro.use-case.ts`, `pomodoro.scheduler.ts` | `settle-due-pomodoro.use-case.test.ts`, `pomodoro.scheduler.test.ts` |
| RF-17, RF-18 | `get-pomodoro`, `list-pomodoro` | Sus tests |
| RF-64 | `pomodoro_tasks.position`, `prisma-pomodoro.repository.ts`, `settle-due-pomodoro` (foto en orden) | `get-pomodoro.use-case.test.ts`, `prisma-pomodoro.repository.int.test.ts` |
| RF-21, RF-22, RF-24 | `pomodoro-task.entity.ts`, `list-waiting-pomodoro-task`, `delete-pomodoro-task` | Sus tests |
| RF-25 a RF-29, RF-51, RF-59, RF-62 | `add-pomodoro-task`, `remove-pomodoro-task`, `delete-pomodoro-task` | Sus tests |
| RF-30 a RF-34, RF-50, RF-60, RF-61 | `pomodoro.entity.ts`, `change-pomodoro-status.use-case.ts` | Sus tests |
| RF-38 a RF-41 | `get-pomodoro-streak.use-case.ts`, `src/shared/domain/streak.value-object.ts`, `user-time-zone.adapter.ts`, `alert.facade.ts` | `get-pomodoro-streak.use-case.test.ts`, `settle-due-pomodoro.use-case.test.ts` |
| RF-19, RF-43 a RF-47 | `achievement.value-object.ts`, `unlock-pomodoro-achievement`, `list-pomodoro-achievement`, `prisma-achievement.repository.ts` | Sus tests |
| RF-48 | `update-pomodoro-task.use-case.ts` | Su test |
| RF-63 | `error-code.constant.ts`, orden de comprobación de cada caso de uso (5.2) | `pomodoro.routes.test.ts` |
| RNF-01 | Índices (sección 4) | `api.perf.test.ts` |
| RNF-02 | `Clock` del servidor en las entidades y asentamiento (D-2) | `pomodoro.entity.test.ts`, `pomodoro.routes.test.ts` |
| RNF-03 | `error-code.constant.ts`, mensajes de éxito | `pomodoro.routes.test.ts` |
| CE-01, CE-02 | `start-pomodoro`, filtro por usuario | `pomodoro.routes.test.ts` |
