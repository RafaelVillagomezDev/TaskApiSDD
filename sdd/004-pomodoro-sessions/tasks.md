# Tasks: Sesiones pomodoro — temporizador con una lista de tareas, racha y logros propios
Spec: `sdd/004-pomodoro-sessions/spec.md` (Aprobada) · Plan: `sdd/004-pomodoro-sessions/plan.md` (Aprobado) · Fecha: 2026-11-08

## Cómo leer este fichero

- **Formato:** `- [ ] T### [P] [Fase] Descripción (RF-xx) — archivo(s)`, con una línea **Verifica** con el comando que da la tarea por terminada.
- **[P]:** se puede hacer en paralelo con las demás tareas [P] de su bloque (archivos distintos y sin dependencias pendientes).
- **Fases:** `[Base]` es la fase común (refactors, fachada de `alerts`, errores, esquema, dominio, repositorio y asentamiento); `[H1]`…`[H6]` son las historias de la spec en orden de prioridad; `[Rob]` es la fase de robustez y documentación.
- **Dentro de cada bloque con tests:** primero los tests, que **deben fallar** (rojo); después la implementación, que los hace pasar (verde). Los refactors T001 y T002 son la excepción: sus tests pasan antes y después.
- **Comandos:** todo se ejecuta en Docker (AGENTS.md). Abreviatura: `dce` = `docker compose -f docker-compose.dev.yml exec api`.
- **Requisito previo:** contenedores de desarrollo levantados (`docker compose -f docker-compose.dev.yml up -d`) y SonarQube levantado para poder hacer push (CONSTITUTION.md, principio III).
- Los RF, RNF y CE son los de la spec 004; las decisiones D-xx y los riesgos R-xx, los del plan 004. Las rutas `src/...` y `tests/...` son relativas a la raíz del repositorio; `pomodoros/` abrevia `src/modules/pomodoros/` y `alerts/`, `streaks/` y `tasks/` sus módulos.

---

## Fase 0 — Base

### Refactors sin cambio observable (principio II, excepción)
- [x] T001 [P] [Base] Mover `Streak` de `streaks/domain/` a `src/shared/domain/streak.value-object.ts` y su test a `src/shared/domain/tests/`; `streaks` importa la nueva ruta (D-6, R-6) — `src/shared/domain/streak.value-object.ts`, `src/shared/domain/tests/streak.value-object.test.ts`, `streaks/application/get-streak.use-case.ts`
  - Verifica: `dce pnpm test streak` pasa sin cambiar ninguna expectativa.
  - Hecho (2026-11-08): `git mv` del fichero y de su test (se borra la carpeta vacía `streaks/domain/tests/`); solo cambian las rutas de import y el comentario de la clase. `dce pnpm test streak` → 3 suites y 25 tests en verde; `tsc --noEmit` sin errores; suite completa → 64 suites y 759 tests en verde.
- [x] T002 [P] [Base] Extraer `TITLE_MAX_LENGTH` y `DESCRIPTION_MAX_LENGTH` a `src/shared/domain/task-text.constant.ts`, y `daySchema`, `titleSchema`, `descriptionSchema` y el de descripción opcional del `PATCH` a `src/shared/infrastructure/http/task-text.schema.ts`; `tasks` los importa (D-8, R-6) — `src/shared/domain/task-text.constant.ts`, `src/shared/infrastructure/http/task-text.schema.ts`, `tasks/domain/task.entity.ts`, `tasks/infrastructure/task.schema.ts`
  - Verifica: `dce pnpm test tasks` pasa sin cambiar ninguna expectativa.
  - Hecho (2026-11-08): el schema de la descripción al editar se llama `editedDescriptionSchema`. Las constantes de longitud solo las usaba el schema, así que se quitan de `task.entity.ts` en lugar de reexportarlas (el plan §3 decía reexportarlas; no hacía falta). `emptyToNull` pasa a ser privada de `task-text.schema.ts`; la copia de `users/infrastructure/user.schema.ts` es anterior y no se toca. `dce pnpm test tasks` → 11 suites y 230 tests en verde; `tsc --noEmit` sin errores; suite completa → 64 suites y 759 tests en verde.

### Fachada de `alerts` (D-7)
- [x] T003 [P] [Base] Test de `GetUserTimeZoneUseCase`: devuelve la zona recordada o `null` (RF-40) — `alerts/application/tests/get-user-time-zone.use-case.test.ts`
  - Verifica: `dce pnpm test alerts/application/tests/get-user-time-zone` **falla**.
  - Hecho (2026-11-08): 3 casos (zona recordada, última zona tras un cambio, sin zona → `null`); falló porque el caso de uso no existía.
- [x] T004 [Base] `UserTimeZoneRepository.find(userId)` en el puerto, en Prisma (por clave primaria) y en memoria; `GetUserTimeZoneUseCase`; fachada `alert.facade.ts` que lo exporta (D-7) — `alerts/domain/user-time-zone.repository.ts`, `alerts/infrastructure/prisma-user-time-zone.repository.ts`, `tests/support/in-memory-user-time-zone.repository.ts`, `alerts/application/get-user-time-zone.use-case.ts`, `alerts/alert.facade.ts`
  - Verifica: `dce pnpm test alerts` pasa.
  - Hecho (2026-11-08): el método del puerto se llama `findTimeZone(userId): Promise<string | null>` y no `find`, porque el repositorio en memoria ya tenía un `find` síncrono de ayuda que usan los tests de `alerts` y no se toca. Nuevo caso en `prisma-user-time-zone.repository.int.test.ts`. `dce pnpm test alerts` → 10 suites y 77 tests en verde; `tsc --noEmit` sin errores; suite completa → 65 suites y 763 tests en verde.

### Errores
- [x] T005 [P] [Base] Ocho códigos nuevos con su HTTP, `precedence: 7` y el mensaje del plan §6; el test del catálogo los incluye en el grupo 7 (RF-63, RNF-03, D-10) — `src/shared/domain/error-code.constant.ts`, `src/shared/infrastructure/http/tests/error-handler.middleware.test.ts`
  - Verifica: `dce pnpm test error-handler` pasa.
  - Hecho (2026-11-08): los 8 códigos, también en el `it.each` de HTTP y mensaje del test de errores. `dce pnpm test error-handler` → 32 tests en verde.

### Base de datos
- [x] T006 [Base] Modelos `Pomodoro`, `PomodoroTask` (con `position`) y `PomodoroAchievement`, enums `PomodoroStatus` y `PomodoroEndReason`, `active_user_id` único y relaciones en `User`, con sus comentarios e índices (plan §4, D-3, D-12) — `prisma/schema.prisma`
  - Verifica: `dce pnpm exec prisma validate`.
  - Hecho (2026-11-08): `prisma format` solo realinea las relaciones de `User`. La FK `pomodoro_tasks.pomodoro_id` es `ON DELETE SET NULL` (las sesiones solo se borran con la cuenta, que borra también sus tareas).
- [x] T007 [Base] Migración generada con `prisma migrate diff` (AGENTS.md §3, R-7), con el `CHECK` de `duration_minutes` entre 1 y 120 añadido a mano — `prisma/migrations/<AAAAMMDDHHMMSS>_pomodoro_sessions/migration.sql`
  - Verifica: `dce pnpm prisma migrate deploy` la aplica, `dce pnpm prisma generate` termina sin errores y `dce pnpm exec prisma migrate status` → base de datos al día.
  - Hecho (2026-11-08): `20261108213045_pomodoro_sessions`, con el `CHECK` de `duration_minutes` añadido a mano; `prisma migrate diff --exit-code` sobre el esquema aplicado no detecta deriva (Prisma no gestiona los `CHECK`).

### Dominio
- [x] T008 [P] [Base] Test de `Pomodoro`: pausar, reanudar y terminar desde cada estado; cambios no permitidos o iguales → `INVALID_POMODORO_STATE`; `remainingSeconds`; `isDue`; 25 min pausada 10 a los 5 → fin a los 35 con 1500 s de concentración; fin a mano a los 10 min → 600 s (RF-14, RF-15, RF-30 a RF-34, RF-60, RF-61) — `pomodoros/domain/tests/pomodoro.entity.test.ts`
  - Verifica: `dce pnpm test pomodoros/domain/tests/pomodoro.entity` **falla**.
  - Hecho (2026-11-08): falló porque la entidad no existía.
- [x] T009 [P] [Base] Test de `PomodoroTask`: completar y desmarcar sin mirar la fecha; editar título y descripción; `moveTo` con fecha pasada → hoy y con fecha futura → igual; `toSnapshot` (RF-13, RF-16, RF-21, RF-48, RF-57) — `pomodoros/domain/tests/pomodoro-task.entity.test.ts`
  - Verifica: `dce pnpm test pomodoros/domain/tests/pomodoro-task` **falla**.
  - Hecho (2026-11-08): falló porque la entidad no existía.
- [x] T010 [Base] Entidad `Pomodoro` con las constantes `MIN_DURATION_MINUTES`, `MAX_DURATION_MINUTES`, `DEFAULT_DURATION_MINUTES` y `MAX_TASKS_PER_POMODORO` (plan §3) — `pomodoros/domain/pomodoro.entity.ts`
  - Verifica: `dce pnpm test pomodoros/domain/tests/pomodoro.entity` pasa.
  - Hecho (2026-11-08): `finishByTime(now, details)` recibe el instante para comprobar que la sesión está vencida (el plan §3 no lo indicaba); `finishManually` rechaza una sesión ya vencida, que se asienta por tiempo. 21 tests en verde.
- [x] T011 [Base] Entidad `PomodoroTask` — `pomodoros/domain/pomodoro-task.entity.ts`
  - Verifica: `dce pnpm test pomodoros/domain/tests/pomodoro-task` pasa.
  - Hecho (2026-11-08): completar una tarea ya completada conserva su `completedAt` original. 13 tests en verde.
- [x] T012 [Base] Puertos `PomodoroRepository` (operaciones del plan §5.1) y `UserTimeZoneSource` — `pomodoros/domain/pomodoro.repository.ts`, `pomodoros/domain/user-time-zone.port.ts`
  - Verifica: `dce pnpm exec tsc --noEmit` termina sin errores.
  - Hecho (2026-11-08): `PomodoroRepository` con una unidad de trabajo transaccional (`transaction(work)`, con `lockPomodoro`, `lockActivePomodoro`, `createPomodoro`, `tasksOf`, `maxPosition`…) más las lecturas sin bloqueo. `findProductiveDates` (racha, §5.8) va en este puerto y no en el de logros.

### Repositorio y zona
- [x] T013 [P] [Base] Test de integración del repositorio: una sola sesión activa (`P2002` en `active_user_id`); dos asentamientos concurrentes dejan una sola foto; foto JSONB en orden de `position`; `position` al añadir y al volver a añadir; tareas en espera paginadas en orden; cascada al borrar la cuenta (RF-12, RF-16, RF-23, RF-24, RF-64, R-4) — `pomodoros/infrastructure/tests/prisma-pomodoro.repository.int.test.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests/prisma-pomodoro` **falla**.
  - Hecho (2026-11-08): 14 casos; `tests/integration/test-database.helper.ts` añade las tres tablas nuevas a las que se pueden vaciar. Falló porque el repositorio no existía.
- [x] T014 [Base] `PrismaPomodoroRepository` con transacciones y `SELECT … FOR UPDATE` por plantilla etiquetada, y el mapeo fila ↔ dominio (D-4, D-9, D-12) — `pomodoros/infrastructure/prisma-pomodoro.repository.ts`, `pomodoros/infrastructure/pomodoro.mapper.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests/prisma-pomodoro` pasa.
  - Hecho (2026-11-08): la foto JSONB se valida con Zod al leerla. Los ids no UUID devuelven `null` o `[]` sin consultar. `createTasks` crea una a una para que `sequence` siga el orden recibido. 14 tests de integración en verde.
- [x] T015 [P] [Base] Repositorio en memoria con la misma semántica (una activa, foto, espera, `position`) — `tests/support/in-memory-pomodoro.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit` termina sin errores.
  - Hecho (2026-11-08): las transacciones deshacen sus cambios si el trabajo falla; `createPomodoro` lanza `POMODORO_ALREADY_ACTIVE` como el índice único.
- [x] T016 [P] [Base] `UserTimeZoneAdapter` sobre la fachada de `alerts` (D-7) — `pomodoros/infrastructure/user-time-zone.adapter.ts`
  - Verifica: `dce pnpm exec tsc --noEmit` termina sin errores.
  - Hecho (2026-11-08).

### Asentamiento y barrido (D-2)
- [x] T017 [P] [Base] Test de `SettleDuePomodoroUseCase`: `finished_at = ends_at`, `end_reason = time`, concentración completa; pendientes a espera y completadas en la sesión; foto en orden; día local en la zona recordada (23:50 + 25 min → día siguiente); idempotente; no toca pausadas ni no vencidas; `dueBatch` por lotes (RF-15, RF-16, RF-23, RF-33, RF-35, RF-40) — `pomodoros/application/tests/settle-due-pomodoro.use-case.test.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/settle-due` **falla**.
  - Hecho (2026-11-08): 9 casos; falló porque el caso de uso no existía.
- [x] T018 [Base] `SettleDuePomodoroUseCase` (`forUser`, `dueBatch` con `SETTLE_BATCH_SIZE = 100`); los logros se añaden en T054 — `pomodoros/application/settle-due-pomodoro.use-case.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/settle-due` pasa.
  - Hecho (2026-11-08): el tamaño del lote se puede pasar al constructor (el test usa 2). Si un lote completo no asienta ninguna sesión, el barrido se detiene para no repetirlo sin fin. Un usuario sin zona recordada (no debería pasar: empezar una sesión la recuerda, RF-03) usa UTC para el día del fin. 9 tests en verde.
- [x] T019 [P] [Base] Test del planificador: asienta en cada pasada y registra `POMODORO_SETTLE_FAILED` sin pararse (RF-15) — `pomodoros/infrastructure/tests/pomodoro.scheduler.test.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests/pomodoro.scheduler` **falla**.
  - Hecho (2026-11-08): 4 casos; falló porque el planificador no existía.
- [x] T020 [Base] `PomodoroScheduler` cada 60 s con `IntervalRunner`; el contenedor lo crea y `server.main.ts` lo arranca y lo para con los demás; el contenedor de test cablea el módulo con los fakes — `pomodoros/infrastructure/pomodoro.scheduler.ts`, `src/dependency.container.ts`, `src/server.main.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests/pomodoro.scheduler` pasa.
  - Hecho (2026-11-08): el barrido solo escribe `POMODORO_SETTLE_COMPLETED` cuando asienta alguna sesión. El contenedor de test expone `pomodoros` y `settlePomodoros`. Tras reiniciar `api`, arranca sin `POMODORO_SETTLE_FAILED` (los fallos anteriores eran de recargas en caliente con el cliente de Prisma sin regenerar). Checkpoint Base: `dce pnpm test` → 70 suites y 835 tests en verde; `tsc --noEmit` sin errores; las dos búsquedas del principio V sin resultados.

### Checkpoint Base
- `dce pnpm test` pasa entero: el comportamiento observable de la 001 a la 003 no cambia.
- Principio V: `grep -rnE "from ['\"](express|@prisma/client|zod)" src/modules/pomodoros/domain src/modules/pomodoros/application` no devuelve resultados, y `grep -rn "modules/\(tasks\|streaks\|users\)\|alerts/\(domain\|application\|infrastructure\)" src/modules/pomodoros` tampoco.

---

## Fase H1 — Empezar una sesión con sus tareas (HU-01 y HU-02, P1)

### Tests (deben fallar)
- [x] T021 [P] [H1] Test del schema de `POST /pomodoros`: duración 0, 121, 25.5 y ausente (25); 21 tareas; ids de espera repetidos; textos de `newTasks` fuera de límites y recortados; campos desconocidos (RF-06, RF-09, RF-10, RF-53, RF-55, RF-56) — `pomodoros/infrastructure/tests/pomodoro.schema.test.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests/pomodoro.schema` **falla**.
  - Hecho (2026-11-08): 20 casos; falló porque el schema no existía.
- [x] T022 [P] [H1] Test de `StartPomodoroUseCase`: crea en curso con `ends_at = now + duración`; sin tareas; con nuevas y en espera en el orden de RF-64; espera con fecha pasada → hoy; activa (también pausada) → `POMODORO_ALREADY_ACTIVE`; id ajeno, borrado o no en espera → `POMODORO_TASK_NOT_FOUND`; fecha pasada → `DAY_CLOSED` sin crear nada; asienta antes una vencida y deja empezar otra (RF-04, RF-05, RF-08 a RF-12, RF-21, RF-52, RF-64) — `pomodoros/application/tests/start-pomodoro.use-case.test.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/start-pomodoro` **falla**.
  - Hecho (2026-11-08): 13 casos, con la precedencia de RF-63 entre los tres errores del caso de uso; falló porque el caso de uso no existía.
- [x] T023 [P] [H1] Test HTTP de `POST /pomodoros`: `201` con el sobre completo y «Sesión pomodoro iniciada»; errores de sesión, CSRF y cabeceras de hora; `VALIDATION_ERROR` con `details`; `DAY_CLOSED`; `POMODORO_ALREADY_ACTIVE`; `POMODORO_TASK_NOT_FOUND` con una tarea de la 001; `GET /tasks` y `GET /streak` sin cambios (RF-01 a RF-03, RF-49, CE-01, CE-03) — `pomodoros/infrastructure/tests/pomodoro.routes.test.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests/pomodoro.routes` **falla**.
  - Hecho (2026-11-08): 14 casos, también la petición sin cuerpo y la previa de CORS; fallaron con 404 porque la ruta no existía. El caso de CE-03 comprueba `GET /streak` con su forma de la 001, `{ current, best }`: la spec 004 decía que `GET /pomodoro-streak` devuelve `{ currentStreak, bestStreak }`, «la misma forma que `GET /streak`», lo que se contradecía; el responsable del proyecto eligió `{ current, best }` y se corrigió la spec y el plan (2026-11-08).

### Implementación
- [x] T024 [H1] Schemas de `POST /pomodoros` y de paginación sobre `task-text.schema.ts` (D-8) — `pomodoros/infrastructure/pomodoro.schema.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests/pomodoro.schema` pasa.
  - Hecho (2026-11-08): objetos estrictos; el límite de 20 tareas se comprueba sobre las dos listas juntas. 20 tests en verde.
- [x] T025 [H1] `StartPomodoroUseCase`, con `P2002` → `POMODORO_ALREADY_ACTIVE` (D-3) — `pomodoros/application/start-pomodoro.use-case.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/start-pomodoro` pasa.
  - Hecho (2026-11-08): devuelve un `PomodoroDetail` (sesión, tareas y tiempo restante) de `application/pomodoro-detail.helper.ts`, que reutilizarán los demás casos de uso de sesiones. 13 tests en verde.
- [x] T026 [H1] Recursos `Pomodoro` y `PomodoroTask` en el mapper (`remainingSeconds`, `completedTasks`, `totalTasks`); `PomodoroController.start`; `pomodoro.routes.ts` con sesión → contexto → JSON → controlador y `allowPreflight`; cableado en los dos contenedores (D-11) — `pomodoros/infrastructure/pomodoro.mapper.ts`, `pomodoros/infrastructure/pomodoro.controller.ts`, `pomodoros/infrastructure/pomodoro.routes.ts`, `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test pomodoros` pasa.
  - Hecho (2026-11-08): sin cuerpo equivale a `{}` (RF-49). `dce pnpm test pomodoros` → 8 suites y 108 tests en verde; `tsc --noEmit` sin errores. Suite completa: 73 suites y 882 tests, con 1 fallo ajeno al pomodoro en `alerts/infrastructure/tests/prisma-alert.repository.int.test.ts`; con permiso del responsable del proyecto se ejecutó ese fichero solo y pasó entero (9 de 9), así que el fallo es intermitente en la ejecución en paralelo; no se pudo ver qué caso falló.

### Checkpoint H1
- `dce pnpm test` pasa entero. A mano (QS-01 de la guía, T058): empezar una sesión con dos tareas para hoy y otra para el mes que viene → `201`; con una tarea de ayer → `DAY_CLOSED`.

---

## Fase H2 — Completar y editar tareas durante la sesión (HU-03, P1)

### Tests (deben fallar)
- [x] T027 [P] [H2] Test del schema de `PATCH /pomodoro-tasks/{id}`: al menos un campo; `date` y campos desconocidos → error; descripción vacía → `null` (RF-06, RF-53, RF-54) — `pomodoros/infrastructure/tests/pomodoro.schema.test.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests/pomodoro.schema` **falla**.
  - Hecho (2026-11-08): 14 casos nuevos; falló porque el schema no existía.
- [x] T028 [P] [H2] Test de `UpdatePomodoroTaskUseCase`: completar (también con fecha futura y en sesión pausada) guarda `completedAt`; desmarcar → `null`; editar en espera y en la sesión activa, también completada; en espera con `completed` → `POMODORO_TASK_NOT_IN_SESSION` sin editar nada; sesión terminada → `INVALID_POMODORO_STATE`; ajena → `POMODORO_TASK_NOT_FOUND` (RF-07, RF-13, RF-34, RF-36, RF-48, RF-57) — `pomodoros/application/tests/update-pomodoro-task.use-case.test.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/update-pomodoro-task` **falla**.
  - Hecho (2026-11-08): 15 casos; falló porque el caso de uso no existía.
- [x] T029 [P] [H2] Test HTTP de `PATCH /pomodoro-tasks/{id}`: `200` con el recurso; los errores anteriores; id no UUID → `POMODORO_TASK_NOT_FOUND` (RF-13, RF-48, RF-54) — `pomodoros/infrastructure/tests/pomodoro.routes.test.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests/pomodoro.routes` **falla**.
  - Hecho (2026-11-08): 8 casos, también una tarea de otra cuenta y `VALIDATION_ERROR` antes que la tarea inexistente; fallaron con 404 porque la ruta no existía.

### Implementación
- [x] T030 [H2] Schema del `PATCH` de tarea, `UpdatePomodoroTaskUseCase` (los logros se añaden en T054), `PomodoroTaskController.update` y su ruta — `pomodoros/infrastructure/pomodoro.schema.ts`, `pomodoros/application/update-pomodoro-task.use-case.ts`, `pomodoros/infrastructure/pomodoro-task.controller.ts`, `pomodoros/infrastructure/pomodoro.routes.ts`, contenedores
  - Verifica: `dce pnpm test pomodoros` pasa.
  - Hecho (2026-11-08): el caso de uso bloquea la sesión de la tarea y la vuelve a leer tras el bloqueo, para no cruzarse con su asentamiento (D-4); devuelve la entidad y el controlador responde el recurso `PomodoroTask` con «Operación realizada con éxito». El schema del `PATCH` era idéntico al de `PATCH /tasks/{id}`, así que pasa a `src/shared/infrastructure/http/task-text.schema.ts` como `taskPatchBodySchema` y lo usan los dos (refactor sin cambio observable, como D-8; los tests de `tasks` pasan sin tocarlos). `dce pnpm test pomodoros` → 9 suites y 144 tests; suite completa → 74 suites y 918 tests en verde; `tsc --noEmit` sin errores.

### Checkpoint H2
- `dce pnpm test` pasa entero.

---

## Fase H3 — Listar y consultar mis sesiones (HU-04, P1)

### Tests (deben fallar)
- [x] T031 [P] [H3] Test de `GetPomodoroUseCase`: propia, ajena e inexistente (`POMODORO_NOT_FOUND`); activa con sus tareas actuales y terminada con su foto aunque las tareas cambien después; orden de RF-64; una vencida se ve terminada sin barrido (RF-16, RF-17, RF-20, RF-58, RF-64, R-2) — `pomodoros/application/tests/get-pomodoro.use-case.test.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/get-pomodoro` **falla**.
  - Hecho (2026-11-08): 7 casos, entre ellos la foto que no cambia aunque la tarea pendiente pase a otra sesión, se renombre y se complete allí; falló porque el caso de uso no existía.
- [x] T032 [P] [H3] Test de `ListPomodorosUseCase`: activas y terminadas, de la más reciente a la más antigua, paginadas (RF-18) — `pomodoros/application/tests/list-pomodoro.use-case.test.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/list-pomodoro` **falla**.
  - Hecho (2026-11-08): 5 casos; falló porque el caso de uso no existía.
- [x] T033 [P] [H3] Test HTTP de `GET /pomodoros` y `GET /pomodoros/{id}`: sobre, paginación, aislamiento entre usuarios, id no UUID → `POMODORO_NOT_FOUND` (RF-01, RF-17, RF-18, RF-20, CE-02) — `pomodoros/infrastructure/tests/pomodoro.routes.test.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests/pomodoro.routes` **falla**.
  - Hecho (2026-11-08): 7 casos, también `pageSize=101` → `VALIDATION_ERROR` y la petición previa de CORS de las dos rutas; fallaron con 404 porque las rutas no existían.

### Implementación
- [x] T034 [H3] `GetPomodoroUseCase`, `ListPomodorosUseCase`, `PomodoroController.get` y `list` y sus rutas — `pomodoros/application/get-pomodoro.use-case.ts`, `pomodoros/application/list-pomodoro.use-case.ts`, `pomodoros/infrastructure/pomodoro.controller.ts`, `pomodoros/infrastructure/pomodoro.routes.ts`, contenedores
  - Verifica: `dce pnpm test pomodoros` pasa.
  - Hecho (2026-11-08): las sesiones terminadas salen con su foto y solo la activa (como mucho una por usuario, RF-12) lee sus tareas actuales. Paginación con `paginationQuerySchema` de `src/shared`. `dce pnpm test pomodoros` → 11 suites y 163 tests; suite completa → 76 suites y 937 tests en verde; `tsc --noEmit` sin errores.

### Checkpoint H3
- `dce pnpm test` pasa entero.

---

## Fase H4 — Pausar, reanudar y terminar la sesión (HU-05, P1)

### Tests (deben fallar)
- [x] T035 [P] [H4] Test de `ChangePomodoroStatusUseCase`: pausar, reanudar con `ends_at` recalculado y terminar a mano desde en curso y pausada (pendientes a espera, foto, `finished_on` con la zona de la petición); mismo estado y sesión terminada → `INVALID_POMODORO_STATE`; vencida antes de pausar → `INVALID_POMODORO_STATE`; pausada durante días sigue pausada (RF-30 a RF-34, RF-50, RF-60, RF-61) — `pomodoros/application/tests/change-pomodoro-status.use-case.test.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/change-pomodoro-status` **falla**.
  - Hecho (2026-11-08): 16 casos; falló porque el caso de uso no existía.
- [x] T036 [P] [H4] Test HTTP de `PATCH /pomodoros/{id}`: `200`; `status` inválido o con campos extra → `VALIDATION_ERROR`; los errores anteriores; con una sesión pausada, `POST /pomodoros` → `POMODORO_ALREADY_ACTIVE` (RF-12, RF-50, RF-61) — `pomodoros/infrastructure/tests/pomodoro.routes.test.ts`, `pomodoros/infrastructure/tests/pomodoro.schema.test.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests` **falla**.
  - Hecho (2026-11-08): 6 casos de schema y 7 HTTP; fallaron porque el schema y la ruta no existían. Dos casos HTTP adelantan el reloj 15 y 60 minutos, más que el token de acceso de la 002 (15 min): el primer intento respondió `TOKEN_EXPIRED`, y se vuelve a iniciar sesión tras adelantar el reloj, como haría el frontend, sin cambiar ninguna expectativa del contrato.

### Implementación
- [x] T037 [H4] Schema del `status`, `ChangePomodoroStatusUseCase` (los logros se añaden en T054), `PomodoroController.changeStatus` y su ruta — `pomodoros/infrastructure/pomodoro.schema.ts`, `pomodoros/application/change-pomodoro-status.use-case.ts`, `pomodoros/infrastructure/pomodoro.controller.ts`, `pomodoros/infrastructure/pomodoro.routes.ts`, contenedores
  - Verifica: `dce pnpm test pomodoros` pasa.
  - Hecho (2026-11-08): el día del fin a mano usa la zona de la petición (la recién recordada, RF-40). Pasar las tareas pendientes a espera al terminar, por tiempo o a mano, pasa a `application/close-pomodoro.helper.ts`, que comparten el asentamiento y este caso de uso. `dce pnpm test pomodoros` → 12 suites y 192 tests; suite completa → 77 suites y 966 tests en verde; `tsc --noEmit` sin errores.

### Checkpoint H4
- `dce pnpm test` pasa entero.

---

## Fase H5 — Tareas en espera: pasar a otra sesión, quitar y borrar (HU-07, P1)

### Tests (deben fallar)
- [x] T038 [P] [H5] Test de `AddPomodoroTaskUseCase`: nuevas y en espera al final, en el orden de RF-64; espera con fecha pasada → hoy; sesión pausada → permitido; 19 + 2 → `POMODORO_TASK_LIMIT` sin añadir nada; terminada con 18 + 5 → `INVALID_POMODORO_STATE`; fecha pasada → `DAY_CLOSED`; sesión ajena → `POMODORO_NOT_FOUND` (RF-04, RF-05, RF-21, RF-25, RF-27, RF-59, RF-63, RF-64) — `pomodoros/application/tests/add-pomodoro-task.use-case.test.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/add-pomodoro-task` **falla**.
  - Hecho (2026-11-08): 9 casos; falló porque el caso de uso no existía. Los cuatro tests de casos de uso de H5 montan el escenario con un fixture común nuevo, `tests/support/pomodoro-use-case.fixture.ts`.
- [x] T039 [P] [H5] Test de `RemovePomodoroTaskUseCase`: pasa a espera; la última deja la sesión vacía; volver a añadirla la pone al final; completada → `POMODORO_TASK_COMPLETED`; no está en la sesión → `POMODORO_TASK_NOT_FOUND`; terminada → `INVALID_POMODORO_STATE` (RF-26 a RF-28, RF-37, RF-64) — `pomodoros/application/tests/remove-pomodoro-task.use-case.test.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/remove-pomodoro-task` **falla**.
  - Hecho (2026-11-08): 9 casos; falló porque el caso de uso no existía. Quitar de una sesión terminada una tarea que ya no está en ella responde `POMODORO_TASK_NOT_FOUND` y no `INVALID_POMODORO_STATE`: el plan §5.6 comprobaba antes la sesión terminada, pero RF-63 de la spec pone `POMODORO_TASK_NOT_FOUND` antes, y manda la spec (principio II).
- [x] T040 [P] [H5] Test de `ListWaitingPomodoroTasksUseCase`: solo pendientes sin sesión activa, por fecha y creación, paginadas; nunca completadas; siguen ahí aunque pasen días (RF-23, RF-24, RF-35) — `pomodoros/application/tests/list-waiting-pomodoro-task.use-case.test.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/list-waiting` **falla**.
  - Hecho (2026-11-08): 5 casos; falló porque el caso de uso no existía.
- [x] T041 [P] [H5] Test de `DeletePomodoroTaskUseCase`: borra en espera; en sesión activa → `POMODORO_TASK_IN_SESSION`; completada de una terminada → `INVALID_POMODORO_STATE`; dos veces → `POMODORO_TASK_NOT_FOUND` (RF-22, RF-29, RF-34) — `pomodoros/application/tests/delete-pomodoro-task.use-case.test.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/delete-pomodoro-task` **falla**.
  - Hecho (2026-11-08): 5 casos; falló porque el caso de uso no existía.
- [x] T042 [P] [H5] Test HTTP de `POST /pomodoros/{id}/tasks` (sin tareas → `VALIDATION_ERROR`), `DELETE /pomodoros/{id}/tasks/{taskId}`, `GET /pomodoro-tasks` y `DELETE /pomodoro-tasks/{id}` (`data: null`) (RF-51, RF-62) — `pomodoros/infrastructure/tests/pomodoro.routes.test.ts`, `pomodoros/infrastructure/tests/pomodoro.schema.test.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests` **falla**.
  - Hecho (2026-11-08): 4 casos de schema y 8 HTTP; fallaron porque el schema y las rutas no existían. El cuerpo de `POST /pomodoros/{id}/tasks` no limita a 20: lo hace el caso de uso con las que ya tiene la sesión (`POMODORO_TASK_LIMIT`, RF-59).

### Implementación
- [x] T043 [H5] `AddPomodoroTaskUseCase` y `RemovePomodoroTaskUseCase`, con `PomodoroController.addTasks` y `removeTask` y sus rutas — `pomodoros/application/add-pomodoro-task.use-case.ts`, `pomodoros/application/remove-pomodoro-task.use-case.ts`, `pomodoros/infrastructure/pomodoro.schema.ts`, `pomodoros/infrastructure/pomodoro.controller.ts`, `pomodoros/infrastructure/pomodoro.routes.ts`, contenedores
  - Verifica: `dce pnpm test pomodoros/application/tests/add-pomodoro-task` y `remove-pomodoro-task` pasan.
  - Hecho (2026-11-08): leer las tareas en espera, añadir al final de una sesión y leer una tarea con su sesión bloqueada pasan a `application/pomodoro-task.helper.ts`, que usan también `POST /pomodoros` y `PATCH /pomodoro-tasks/{id}`; sus tests siguen en verde sin tocarlos. `dce pnpm test pomodoros/application` → 10 suites y 92 tests en verde.
- [x] T044 [H5] `ListWaitingPomodoroTasksUseCase` y `DeletePomodoroTaskUseCase`, con `PomodoroTaskController.listWaiting` y `remove` y sus rutas — `pomodoros/application/list-waiting-pomodoro-task.use-case.ts`, `pomodoros/application/delete-pomodoro-task.use-case.ts`, `pomodoros/infrastructure/pomodoro-task.controller.ts`, `pomodoros/infrastructure/pomodoro.routes.ts`, contenedores
  - Verifica: `dce pnpm test pomodoros` pasa.
  - Hecho (2026-11-08): `GET /pomodoro-tasks` y `DELETE /pomodoro-tasks/{id}` (`data: null`), con su petición previa de CORS. `dce pnpm test pomodoros` → 16 suites y 233 tests; suite completa → 81 suites y 1007 tests en verde; `tsc --noEmit` sin errores.

### Checkpoint H5
- `dce pnpm test` pasa entero. Los 9 endpoints de sesiones y tareas responden según el contrato.

---

## Fase H6 — Racha y logros del pomodoro (HU-06, P2)

### Tests (deben fallar)
- [x] T045 [P] [H6] Test del catálogo: 11 logros en orden; metas exactas (9 → no, 10 → sí); `MARATHON` con 4 el mismo día y no en dos; `FOCUS_10H` en minutos, meta 600 (RF-43, RF-45 a RF-47, RF-65) — `pomodoros/domain/tests/achievement.value-object.test.ts`
  - Verifica: `dce pnpm test pomodoros/domain/tests/achievement` **falla**.
  - Hecho (2026-11-09): 9 casos; falló porque el catálogo no existía. Antes de escribirlo se detectó que la spec no decía la unidad de `FOCUS_10H`: el responsable del proyecto eligió minutos (meta 600) y se añadió RF-65.
- [x] T046 [P] [H6] Test de `GetPomodoroStreakUseCase` (devuelve `{ current, best }`, como `GET /streak`): solo cuentan las terminadas por tiempo; hoy aún no productivo; ayer y anteayer → 2; días según `finished_on` (RF-38 a RF-41) — `pomodoros/application/tests/get-pomodoro-streak.use-case.test.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/get-pomodoro-streak` **falla**.
  - Hecho (2026-11-09): 8 casos, entre ellos que una sesión asentada pasada la medianoche cuenta para el día local de su fin; falló porque el caso de uso no existía.
- [x] T047 [P] [H6] Test de `UnlockPomodoroAchievementUseCase`: desbloquea con el instante del evento; no sobrescribe; `STREAK_3` con la mejor racha (RF-44, RF-45) — `pomodoros/application/tests/unlock-pomodoro-achievement.use-case.test.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/unlock` **falla**.
  - Hecho (2026-11-09): 4 casos; falló porque el caso de uso no existía.
- [x] T048 [P] [H6] Test de `ListPomodoroAchievementsUseCase`: sin actividad, 11 con `progress: 0`; progreso limitado a la meta; un logro guardado sigue conseguido aunque el progreso baje (RF-19, RF-44) — `pomodoros/application/tests/list-pomodoro-achievement.use-case.test.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/list-pomodoro-achievement` **falla**.
  - Hecho (2026-11-09): 4 casos, también que completar y desmarcar la misma tarea varias veces cuenta una sola (RF-46); falló porque el caso de uso no existía.
- [x] T049 [P] [H6] Test de integración del repositorio de logros: agregados correctos; `skipDuplicates` no cambia `unlocked_at` (RF-44 a RF-47) — `pomodoros/infrastructure/tests/prisma-achievement.repository.int.test.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests/prisma-achievement` **falla**.
  - Hecho (2026-11-09): 7 casos; falló porque el repositorio no existía. En la suite completa chocó con `prisma-pomodoro.repository.int.test.ts`, porque los dos vaciaban `pomodoros` y `pomodoro_tasks` y se ejecutan en paralelo: con permiso del responsable del proyecto, este fichero solo vacía `pomodoro_achievements`, y el de sesiones deja de vaciar tablas y su caso de `findDue` (que recorre todos los usuarios) mira solo sus dos usuarios.
- [x] T050 [P] [H6] Test HTTP de `GET /pomodoro-streak` y `GET /pomodoro-achievements`; tras sesiones del pomodoro, `GET /streak` y `GET /alerts` no cambian (RF-19, RF-41, RF-42, CE-03) — `pomodoros/infrastructure/tests/pomodoro.routes.test.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests/pomodoro.routes` **falla**.
  - Hecho (2026-11-09): 6 casos HTTP, también que `GET /streak` y `GET /alerts` no cambian tras una sesión con una tarea completada; fallaron con 404 porque las rutas no existían.

### Implementación
- [x] T051 [H6] Catálogo `Achievement` y puerto `AchievementRepository` — `pomodoros/domain/achievement.value-object.ts`, `pomodoros/domain/achievement.repository.ts`
  - Verifica: `dce pnpm test pomodoros/domain/tests/achievement` pasa.
  - Hecho (2026-11-09): `achievement.value-object.ts` con el catálogo, `achievementProgress`, `reachedAchievements` y `metricsFromStats` (mejor racha con `Streak` de `src/shared`, concentración en minutos enteros, RF-65). La unidad de trabajo del repositorio del pomodoro expone `achievements` para desbloquear dentro de la misma transacción.
- [x] T052 [H6] `PrismaAchievementRepository` con agregados SQL y su fake en memoria (D-5) — `pomodoros/infrastructure/prisma-achievement.repository.ts`, `tests/support/in-memory-achievement.repository.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests/prisma-achievement` pasa.
  - Hecho (2026-11-09): funciona con el cliente de Prisma o con una transacción. El fake en memoria no es un fichero aparte (`in-memory-achievement.repository.ts` del plan): lo da `InMemoryPomodoroRepository.achievements`, porque las estadísticas salen de sus sesiones y tareas. 7 tests de integración en verde.
- [x] T053 [H6] `UnlockPomodoroAchievementUseCase` — `pomodoros/application/unlock-pomodoro-achievement.use-case.ts`
  - Verifica: `dce pnpm test pomodoros/application/tests/unlock` pasa.
  - Hecho (2026-11-09): sin dependencias propias; recibe la unidad de trabajo de la transacción del evento.
- [x] T054 [H6] Desbloqueo dentro de la transacción al asentar (`at = finished_at`), al terminar a mano y al completar una tarea (`at = completed_at`); los tests de T017, T028 y T035 ganan un caso de logro cada uno (RF-44, plan §5.9) — `pomodoros/application/settle-due-pomodoro.use-case.ts`, `pomodoros/application/change-pomodoro-status.use-case.ts`, `pomodoros/application/update-pomodoro-task.use-case.ts`, sus tests, contenedores
  - Verifica: `dce pnpm test pomodoros/application` pasa.
  - Hecho (2026-11-09): los tres casos de uso reciben `UnlockPomodoroAchievementUseCase` por defecto en el constructor. Los casos de logro de los tests de asentar (1), completar (2) y terminar a mano (2) se añadieron después de integrar el desbloqueo y pasaron a la primera, sin ver antes el rojo.
- [x] T055 [H6] `GetPomodoroStreakUseCase` con `Streak.calculate` (D-6), `ListPomodoroAchievementsUseCase`, `PomodoroProgressController` y sus rutas (D-11) — `pomodoros/application/get-pomodoro-streak.use-case.ts`, `pomodoros/application/list-pomodoro-achievement.use-case.ts`, `pomodoros/infrastructure/pomodoro-progress.controller.ts`, `pomodoros/infrastructure/pomodoro.routes.ts`, contenedores
  - Verifica: `dce pnpm test pomodoros` pasa.
  - Hecho (2026-11-09): `GET /pomodoro-streak` responde `{ current, best }`, como `GET /streak`, y `GET /pomodoro-achievements` los 11 logros sin paginar. `dce pnpm test pomodoros` → 21 suites y 276 tests; suite completa → 86 suites y 1050 tests en verde; `tsc --noEmit` sin errores; las búsquedas del principio V, sin resultados.

### Checkpoint H6
- `dce pnpm test` pasa entero. Los 11 endpoints responden según el contrato.

---

## Fase de robustez

- [ ] T056 [Rob] Batería de precedencia por pares de RF-63 en las rutas del pomodoro: sesión terminada con 18 + 5 → `INVALID_POMODORO_STATE`; 19 + 2 con una de ayer → `POMODORO_TASK_LIMIT`; sesión inexistente y cuerpo inválido → `VALIDATION_ERROR`; CSRF y sesión antes que todo (RF-63; RF-34 de la 002) — `pomodoros/infrastructure/tests/pomodoro.routes.test.ts`
  - Verifica: `dce pnpm test pomodoros/infrastructure/tests/pomodoro.routes` pasa.
- [ ] T057 [Rob] Rendimiento: p95 < 300 ms en los endpoints del pomodoro con 10 000 tareas del pomodoro y 1 000 sesiones, y una pasada del barrido (RNF-01, R-5) — `tests/performance/api.perf.test.ts`
  - Verifica: `dce pnpm test:perf` pasa.
- [ ] T058 [P] [Rob] Guía manual con `curl` QS-01… (empezar, completar, pausar, terminar, tareas en espera, racha y logros) — `sdd/004-pomodoro-sessions/quickstart.md`
  - Verifica: ejecutar la guía a mano contra desarrollo.
- [ ] T059 [P] [Rob] Colección de Postman de los 11 endpoints con sus comprobaciones, como las de la 001 y la 002 — `sdd/004-pomodoro-sessions/pomodoro-sessions.postman-collection.json`
  - Verifica: la colección se ejecuta entera contra desarrollo sin fallos.
- [ ] T060 [P] [Rob] AGENTS.md §2: módulo `pomodoros` (004) en la lista de módulos — `AGENTS.md`
  - Verifica: `grep -n "pomodoros" AGENTS.md`.
- [ ] T061 [Rob] README: estado de la 004, endpoints, reglas de negocio del pomodoro, modelo de datos y estructura de `sdd/004-…` con `tasks.md`, `quickstart.md` y la colección (Gobierno 7) — `README.md`
  - Verifica: `git diff --stat README.md` muestra cambios en el mismo commit que AGENTS.md y `sdd/004-…`.

### Checkpoint Robustez
- `dce pnpm test`, `dce pnpm test:coverage` y `dce pnpm test:perf` pasan; `./scripts/sonar-scan.sh` → quality gate en verde.
- Principio V: `grep -rnE "from ['\"](express|@prisma/client|zod)" src/modules/*/domain src/modules/*/application src/shared/domain src/shared/application` no devuelve resultados.

---

## Cobertura RF → tareas

| RF / RNF / CE | Tareas |
| :--- | :--- |
| RF-01 a RF-03 | T023, T026, T033 |
| RF-04, RF-05, RF-52 | T022, T025, T038, T043 |
| RF-06, RF-53, RF-54 | T002, T021, T024, T027, T030 |
| RF-07, RF-11 | T022, T025, T028, T030 |
| RF-08 a RF-10, RF-49, RF-55, RF-56 | T021 a T026 |
| RF-12 | T013, T014, T022, T025, T036 |
| RF-13, RF-36, RF-48, RF-57 | T009, T011, T028 a T030 |
| RF-14, RF-15, RF-60 | T008, T010, T017 a T020, T035 |
| RF-16, RF-23, RF-35, RF-58 | T013, T014, T017, T018, T031, T034 |
| RF-17, RF-18, RF-20 | T031 a T034 |
| RF-19, RF-43 a RF-47 | T045, T047 a T049, T051 a T055 |
| RF-21, RF-24 | T009, T011, T022, T038, T040, T043, T044 |
| RF-22, RF-29, RF-34 | T008, T010, T041, T044 |
| RF-25 a RF-28, RF-37, RF-51, RF-59, RF-62 | T038, T039, T042, T043 |
| RF-30 a RF-33, RF-50, RF-61 | T008, T010, T035 a T037 |
| RF-38 a RF-42 | T001, T003, T004, T016, T046, T050, T055 |
| RF-63 | T005, T056 |
| RF-64 | T013, T014, T022, T031, T038, T039 |
| RNF-01 | T057 |
| RNF-02 | T008, T010, T031 |
| RNF-03 | T005, T023 |
| CE-01 | T023 |
| CE-02 | T033 |
| CE-03 | T023, T050 |

Los 64 RF tienen al menos una tarea de test y una de implementación. RNF-01 (rendimiento) solo tiene tarea de test (T057): lo cumplen los índices del plan §4.
