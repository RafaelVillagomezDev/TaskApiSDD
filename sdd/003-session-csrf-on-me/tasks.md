# Tasks: Token CSRF de la sesión en `GET /me`
Spec: `sdd/003-session-csrf-on-me/spec.md` (Aprobada) · Plan: `sdd/003-session-csrf-on-me/plan.md` (Aprobado) · Fecha: 2026-10-29

## Cómo leer este fichero

- **Formato:** `- [ ] T### [P] [Fase] Descripción (RF-xx) — archivo(s)`, con una línea **Verifica** con el comando que da la tarea por terminada.
- **[P]:** se puede hacer en paralelo con las demás tareas [P] de su bloque (archivos distintos y sin dependencias pendientes).
- **Fases:** `[Base]` es la fase común (cifrado, esquema, migración y repositorio); `[H1]` es la historia HU-01 de la spec (P1); `[Rob]` es la fase de robustez y documentación.
- **Dentro de cada bloque con tests:** primero los tests, que **deben fallar** (rojo); después la implementación, que los hace pasar (verde). La extracción del cifrado (T001-T003) es un refactor: sus tests pasan antes y después.
- **Comandos:** todo se ejecuta en Docker (AGENTS.md). Abreviatura: `dce` = `docker compose -f docker-compose.dev.yml exec api`.
- **Requisito previo:** contenedores de desarrollo levantados (`docker compose -f docker-compose.dev.yml up -d`) y SonarQube levantado para poder hacer push (CONSTITUTION.md, principio III).
- Los RF, RNF y CE son los de la spec 003; las decisiones D-xx y los riesgos R-xx, los del plan 003. Cuando se cita la 002 se indica. Las rutas `src/...` y `tests/...` son relativas a la raíz del repositorio; `users/` abrevia `src/modules/users/`.
- **Aviso:** la migración de T005 cierra todas las sesiones de la base de datos de desarrollo (RF-04): hay que volver a iniciar sesión, también en Postman.

---

## Fase 0 — Base

### Cifrado (refactor, D-2)
- [x] T001 [P] [Base] Test del cifrado genérico: ida y vuelta; IV distinto en cada cifrado; clave que no es de 32 bytes → error; texto o etiqueta alterados, versión desconocida y clave distinta → error; el texto cifrado no contiene el original (RNF-04) — `users/infrastructure/tests/aes-gcm-secret-cipher.adapter.test.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/aes-gcm-secret` **falla**.
- [x] T002 [Base] Puerto `SecretCipher` (`seal(plain)`, `open(sealed)`) y adaptador `AesGcmSecretCipher` con el núcleo AES-256-GCM y el formato `v1.<iv>.<cifrado>.<etiqueta>` de `AesGcmGraceCipher` (D-2) — `users/domain/secret-cipher.port.ts`, `users/infrastructure/aes-gcm-secret-cipher.adapter.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/aes-gcm-secret` pasa.
- [x] T003 [Base] `AesGcmGraceCipher` delega en `AesGcmSecretCipher` y solo serializa y valida el JSON de los tokens; nuevo caso de test que abre una copia sellada con el formato `v1` anterior a la extracción (D-2, R-5) — `users/infrastructure/aes-gcm-grace-cipher.adapter.ts`, `users/infrastructure/tests/aes-gcm-grace-cipher.adapter.test.ts`, `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/aes-gcm` y `dce pnpm test users/application/tests/refresh-session` pasan.
  - Hecho (2026-10-29): la copia de referencia (`LEGACY_SEALED`) se selló con el algoritmo de la 002 y se comprobó con el adaptador anterior antes de refactorizar. Los casos genéricos del cifrado (alteraciones, formato y longitud de la clave) pasan al test de `AesGcmSecretCipher`; el del margen de gracia se queda con la ida y vuelta, otra clave, el contenido inesperado y la copia de referencia. `refresh-session.use-case.test.ts` solo cambia cómo construye el adaptador (el constructor recibe ahora un `SecretCipher`).

### Base de datos
- [x] T004 [Base] `Session.csrfTokenSealed String @map("csrf_token_sealed")` con su comentario (plan §4) — `prisma/schema.prisma`
  - Verifica: `dce pnpm exec prisma validate`.
- [x] T005 [Base] Migración: `DELETE FROM "sessions"` con su comentario (RF-04) y `ADD COLUMN "csrf_token_sealed" TEXT NOT NULL`, generada con `prisma migrate diff` (AGENTS.md §3, R-4) — `prisma/migrations/<AAAAMMDDHHMMSS>_session_csrf_sealed/migration.sql`
  - Verifica: `dce pnpm prisma migrate deploy` aplica la migración, `dce pnpm prisma generate` termina sin errores y `dce pnpm exec prisma migrate status` → base de datos al día.
  - Hecho (2026-10-29): `20261029193228_session_csrf_sealed`. Un primer `migrate deploy` en desarrollo se lanzó con el SQL generado aún sin el `DELETE` y PostgreSQL lo rechazó (había sesiones abiertas: es justo R-4/RF-04); no aplicó nada. Se añadió el `DELETE`, se marcó la migración como revertida con `prisma migrate resolve --rolled-back` (solo en desarrollo) y se aplicó bien.

### Repositorio y login
- [x] T006 [P] [Base] Test de integración del repositorio: `create` guarda `csrfTokenSealed`; `findById` lo devuelve; sesión inexistente → `null`; la renovación no lo cambia; la columna rechaza `NULL` (RF-02, RF-04) — `users/infrastructure/tests/prisma-session.repository.int.test.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/prisma-session` **falla**.
- [x] T007 [P] [Base] Test del login: guarda la huella y la copia sellada; la copia se abre con el mismo `csrfToken` de la respuesta y no contiene el token en claro (RF-02, RNF-04) — `users/application/tests/login.use-case.test.ts`
  - Verifica: `dce pnpm test users/application/tests/login` **falla**.
- [x] T008 [Base] `NewSession` y `SessionRecord` con `csrfTokenSealed`; `SessionRepository.findById(sessionId)` (plan §3) — `users/domain/session.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit` solo falla en los ficheros de T009-T011.
- [x] T009 [Base] `create` guarda `csrfTokenSealed`, `toRecord` lo lee y `findById` por clave primaria (RF-02, D-6) — `users/infrastructure/prisma-session.repository.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/prisma-session` pasa.
- [x] T010 [P] [Base] Repositorio en memoria con `csrfTokenSealed` y `findById` — `tests/support/in-memory-session.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit` solo falla en el login.
- [x] T011 [Base] `LoginUseCase` recibe `SecretCipher` y guarda `cipher.seal(csrfToken)`; un único `AesGcmSecretCipher` en los dos contenedores (RF-02, D-4) — `users/application/login.use-case.ts`, `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test users/application/tests/login` pasa y `dce pnpm exec tsc --noEmit` termina sin errores.
  - Hecho (2026-10-29): `csrfTokenSealed` es obligatorio en `NewSession`, así que los tests de la 002 que crean sesiones a mano (`authenticate-session`, `change-password`, `logout`, `purge-expired-auth-data`, `refresh-session` y `prisma-user.repository.int`) añaden `csrfTokenSealed: 'v1.copia-csrf'` a sus datos de prueba, sin cambiar ninguna comprobación. Checkpoint Base: `dce pnpm test` → 62 suites y 749 tests en verde; principio V sin resultados.

### Checkpoint Base
- `dce pnpm test` pasa entero: el comportamiento observable aún no cambia.
- Principio V: `grep -rnE "from ['\"](express|@prisma/client|zod|argon2|node:crypto)" src/modules/users/domain src/modules/users/application` no devuelve resultados.

---

## Fase H1 — Recuperar el token CSRF de mi sesión (HU-01, P1)

### Tests (deben fallar)
- [x] T012 [P] [H1] Test del caso de uso: devuelve el token descifrado de la sesión; sesión inexistente → `INVALID_TOKEN`; copia alterada → error (RF-01, RF-02, D-4) — `users/application/tests/get-session-csrf-token.use-case.test.ts`
  - Verifica: `dce pnpm test users/application/tests/get-session-csrf-token` **falla**.
  - Hecho (2026-10-29): la copia que no se abre se comprueba como rechazo que no es `AppError` (error interno, D-4): el error de `node:crypto` llega de otro contexto de Jest y `toBeInstanceOf(Error)` no sirve.
- [x] T013 [P] [H1] Test del middleware de caché: añade `Cache-Control: no-store` y llama a `next` (RNF-03, D-3) — `src/shared/infrastructure/http/tests/no-store.middleware.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/no-store` **falla**.
- [x] T014 [P] [H1] Tests HTTP de `GET /me`: `200` con `data` de claves exactas `user` y `csrfToken`, igual al del login; igual tras `POST /auth/refresh`; dos sesiones de la misma cuenta → tokens distintos y el de una responde `INVALID_CSRF_TOKEN` en la otra; `Cache-Control: no-store` en el `200` y en `MISSING_TOKEN`; ningún token de acceso ni de refresco en el cuerpo; con el `csrfToken` de `GET /me` y solo las cookies, `POST /tasks` → `201`; `PATCH /me` sigue devolviendo `User` sin `csrfToken`. Se adaptan los tests existentes de `GET /me` a `data.user` (RF-01 a RF-03, RNF-02, RNF-03, CE-01, CE-02) — `users/infrastructure/tests/me.routes.test.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/me.routes` **falla**.
  - Hecho (2026-10-29): las comprobaciones de los tests de la 002 que leían la cuenta en `data` usan un helper `userOf` que lee `data.user`; `PATCH /me` comprueba además que su `data` no tiene `csrfToken` (RF-03).

### Implementación
- [x] T015 [H1] `GetSessionCsrfTokenUseCase.execute(sessionId)`: `findById` → `open(csrfTokenSealed)`; sin sesión → `INVALID_TOKEN` (RF-01, RF-02, D-5) — `users/application/get-session-csrf-token.use-case.ts`
  - Verifica: `dce pnpm test users/application/tests/get-session-csrf-token` pasa.
- [x] T016 [P] [H1] `noStoreMiddleware` (RNF-03, D-3) — `src/shared/infrastructure/http/no-store.middleware.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/no-store` pasa.
- [x] T017 [P] [H1] `toSessionUserResponse(user, csrfToken)` → `{ user, csrfToken }`, y el login lo usa sin cambiar su respuesta (RF-01; RF-24 de la 002) — `users/infrastructure/user.mapper.ts`, `users/infrastructure/auth.controller.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/auth.routes` pasa.
- [x] T018 [H1] `MeController.show` responde `toSessionUserResponse(user, csrfToken)`; ruta `GET /me` con `noStore` antes de `session`; cableado de `GetSessionCsrfTokenUseCase` en los dos contenedores (RF-01 a RF-03, RNF-03) — `users/infrastructure/me.controller.ts`, `users/infrastructure/me.routes.ts`, `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/me.routes` pasa.
  - Hecho (2026-10-29): QS-01 a QS-05 ejecutados a mano contra la API de desarrollo (también `Cache-Control: no-store` en el `401`). Antes hubo que reiniciar `api`: el proceso seguía con el cliente de Prisma anterior a la columna `csrf_token_sealed` de la fase base y el login respondía `INTERNAL_ERROR`; los tests no lo detectan porque cada ejecución arranca un proceso nuevo. QS-06 no se puede repetir en desarrollo, porque la migración ya se aplicó en la fase base.

### Checkpoint H1
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-01** login y `GET /me` → `200` con `data.user` y el mismo `data.csrfToken` del login, y `Cache-Control: no-store`; **QS-02** tras `POST /auth/refresh`, `GET /me` → el mismo `csrfToken`; **QS-03** solo con las cookies, `GET /me` y `POST /tasks` con su `csrfToken` → `201` (CE-01); **QS-04** dos sesiones de la misma cuenta → tokens distintos; **QS-05** `PATCH /me` → `data` es `User`, sin `csrfToken`; **QS-06** con las cookies de una sesión abierta antes de la migración, `GET /me` → `401 INVALID_TOKEN` (RF-04).

---

## Fase R — Robustez y documentación

- [x] T019 [P] [Rob] Rendimiento de `GET /me` con la consulta y el descifrado nuevos, p95 < 300 ms (RNF-01, D-6) — `tests/performance/api.perf.test.ts`
  - Verifica: `dce pnpm test:perf` pasa.
  - Hecho (2026-10-29): `GET /me` ya estaba medido desde la 002 (T118); ahora también comprueba que la respuesta trae el `csrfToken` de la sesión. p95 de 2,2 ms (antes 1,8 ms).
- [x] T020 [P] [Rob] Colección de Postman de la 002: las peticiones `GET /me` comprueban las claves `user` y `csrfToken`, que `csrfToken` es igual a `sessionCsrfToken` y la cabecera `Cache-Control: no-store`; las que leían `data.id` o `data.name` pasan a `data.user` (S-02, R-6) — `sdd/002-user-accounts/user-accounts.postman-collection.json`
  - Verifica: `docker run --rm -v "$PWD/sdd/002-user-accounts":/etc/newman postman/newman:6-alpine run user-accounts.postman-collection.json --env-var baseUrl=http://host.docker.internal:3000` sin fallos.
  - Hecho (2026-10-29): se adaptan "04 Consultar mi cuenta", "07 … cookies renovadas" (mismo token tras renovar), "09 Consultar el nombre nuevo" y "Consultar mi cuenta" de "5. Mi cuenta" (token igual a `myCsrfToken`); `GET /me` sin cookie comprueba también `Cache-Control: no-store`. 68 peticiones y 69 comprobaciones con Newman, sin fallos.
- [x] T021 [P] [Rob] Colección de Postman de la 001: si alguna petición lee `GET /me`, se adapta a `data.user` (S-02) — `sdd/001-taskApiSDD-mvp/mvp-p1.postman-collection.json`
  - Verifica: `docker run --rm -e TZ=Europe/Madrid -v "$PWD/sdd/001-taskApiSDD-mvp":/etc/newman postman/newman:6-alpine run mvp-p1.postman-collection.json --env-var baseUrl=http://host.docker.internal:3000` sin fallos.
  - Hecho (2026-10-29): ninguna petición de la colección de la 001 lee `GET /me`, así que no cambia; Newman la pasa (60 peticiones y 63 comprobaciones, sin fallos).
- [x] T022 [P] [Rob] Guías manuales: los pasos de la 002 con `GET /me` muestran `data: { user, csrfToken }` (incluido el `sed` que extrae el id); guía nueva de la 003 con QS-01 a QS-06 y QS-R (migración en producción, que cierra las sesiones, y `GET /me` con `Cache-Control: no-store`) — `sdd/002-user-accounts/quickstart.md`, `sdd/003-session-csrf-on-me/quickstart.md`
  - Verifica: ejecutar QS-01 a QS-06 a mano.
  - Hecho (2026-10-29): en la guía de la 002 cambian los textos de QS-H2.2 y QS-H5.2; los `sed` que sacan el id de `GET /me` siguen sirviendo porque la respuesta tiene un único `"id"`. La guía de la 003 avisa de reiniciar `api` tras la migración (T018). QS-01 a QS-05 ejecutados tal como están escritos; QS-06 solo se puede ver al migrar una base de datos con sesiones abiertas.
- [x] T023 [Rob] AGENTS.md §3: `SESSION_ENCRYPTION_KEY` cifra también la copia del token CSRF de cada sesión, y cambiarla obliga a cerrar todas las sesiones a la vez (`DELETE FROM sessions`) (D-4, R-2) — `AGENTS.md`
  - Verifica: `grep -n "SESSION_ENCRYPTION_KEY" AGENTS.md` muestra el procedimiento de cambio de clave.
  - Hecho (2026-10-29): procedimiento para cambiar la clave: parar la API, cambiarla, `DELETE FROM sessions` y volver a levantarla.
- [x] T024 [Rob] README: estado de la 003, contrato de `GET /me`, `SESSION_ENCRYPTION_KEY` y su procedimiento de cambio, aviso de que el despliegue cierra las sesiones y estructura de `sdd/003-…` con `tasks.md` y `quickstart.md` (Gobierno 7, R-3) — `README.md`
  - Verifica: `git diff --stat README.md` muestra cambios en el mismo commit que AGENTS.md y `sdd/003-…`.
- [ ] T025 [Rob] Guía QS-R contra producción: `docker compose -f docker-compose.prod.yml run --rm migrate` y `up --build -d`; con la sesión anterior → `INVALID_TOKEN`; tras el login, `GET /me` desde `https://kompitu.yandrydev.cloud` devuelve el `csrfToken` con `Cache-Control: no-store` (RF-04, RNF-03, R-3) — `sdd/003-session-csrf-on-me/quickstart.md`
  - Verifica: ejecutar QS-R a mano.
  - Pendiente (2026-10-29): la sección QS-R está en la guía de la 003. Levantar `docker-compose.prod.yml` queda para el usuario (el permiso de Claude Code lo bloqueó en la 002, T121); al aplicar la migración se cierran todas las sesiones de producción (RF-04).

### Checkpoint Robustez
- `dce pnpm test`, `dce pnpm test:coverage` y `dce pnpm test:perf` pasan; `./scripts/sonar-scan.sh` → quality gate en verde.
- Principio V: `grep -rnE "from ['\"](express|@prisma/client|zod|argon2|node:crypto)" src/modules/*/domain src/modules/*/application src/shared/domain src/shared/application` no devuelve resultados.

---

## Cobertura RF → tareas

| RF / RNF | Tareas |
| :--- | :--- |
| RF-01 | T012, T014, T015, T017, T018 |
| RF-02 | T006, T007, T008, T009, T011, T012, T014, T015, T018 |
| RF-03 | T014, T018 |
| RF-04 | T004, T005, T006, T022, T025 |
| RNF-01 | T019 |
| RNF-02 | T014, T018 |
| RNF-03 | T013, T014, T016, T018, T025 |
| RNF-04 | T001, T002, T007, T011 |

Los cuatro RF y RNF-02 a RNF-04 tienen al menos una tarea de test y una de implementación. RNF-01 (rendimiento) solo tiene tarea de test (T019): lo cumple la decisión D-6 del plan (lectura por clave primaria). RF-04 se comprueba con la restricción `NOT NULL` (T006) y a mano (QS-06 y QS-R), porque el `DELETE` de la migración solo actúa una vez. Los criterios de éxito se comprueban en: CE-01 (T014, QS-03: 2 peticiones hasta crear una tarea) y CE-02 (T014).
