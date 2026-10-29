# Tasks: Cuentas de usuario — registro, sesiones con cookies, CSRF y gestión de la cuenta
Spec: `sdd/002-user-accounts/spec.md` (Aprobada) · Plan: `sdd/002-user-accounts/plan.md` (Aprobado) · Fecha: 2026-10-28

## Cómo leer este fichero

- **Formato:** `- [ ] T### [P] [Fase] Descripción (RF-xx) — archivo(s)`, con una línea **Verifica** con el comando que da la tarea por terminada.
- **[P]:** se puede hacer en paralelo con las demás tareas [P] de su bloque (archivos distintos y sin dependencias pendientes).
- **Fases:** `[Base]` es la fase común; `[H1]` a `[H7]` son las historias HU-01 a HU-07 de la spec en orden de prioridad (P1: H1–H4, P2: H5–H6, P3: H7); `[Rob]` es la fase de robustez.
- **Dentro de cada historia:** primero los tests, que **deben fallar** (rojo); después la implementación, que los hace pasar (verde).
- **Comandos:** todo se ejecuta en Docker (AGENTS.md). Abreviatura: `dce` = `docker compose -f docker-compose.dev.yml exec api`.
- **Requisito previo:** contenedores de desarrollo levantados (`docker compose -f docker-compose.dev.yml up -d`) y SonarQube levantado para poder hacer push (CONSTITUTION.md, principio III).
- Los RF, RNF y CE son los de la spec 002; las decisiones D-xx y los riesgos R-xx, los del plan 002. Las rutas `src/...` y `tests/...` son relativas a la raíz del repositorio; `users/` abrevia `src/modules/users/`.
- **Aviso:** la migración de T007 vacía las tareas, avisos y zonas de desarrollo (RF-33) y exige que `user_id` sea un UUID de una cuenta. Entre T007 y el final de H4, la API de desarrollo solo funciona enviando en `X-User-Id` el UUID de un usuario creado en la base de datos.

---

## Fase 0 — Base

### Dependencia y configuración
- [x] T001 [Base] Añadir `argon2` a `dependencies` con versión exacta publicada hace al menos dos semanas y autorizar su script de instalación en `allowBuilds` (D-2, R-14) — `package.json`, `pnpm-workspace.yaml`
  - Verifica: `docker compose -f docker-compose.dev.yml up --build -d -V` y `dce node -e "import('argon2').then((a) => a.hash('x')).then(console.log)"` imprime una cadena que empieza por `$argon2id$`.
  - Hecho (2026-10-28): `argon2` 0.45.1, publicada el 2026-07-21 (la 1.0.0 es una alfa).
- [x] T002 [Base] Comprobar `argon2` en la imagen de producción, etapa `runtime`; solo si falla, ajustar el Dockerfile tras consultar al usuario (R-14) — `Dockerfile.prod`
  - Verifica: `docker build -f Dockerfile.prod --target runtime -t taskapisdd:argon2-check .` y `docker run --rm --entrypoint node taskapisdd:argon2-check -e "import('argon2').then((a) => a.hash('x')).then(console.log)"` imprime `$argon2id$…`.
  - Hecho (2026-10-28): funciona sin tocar `Dockerfile.prod`; hay binario precompilado para Alpine (R-14 descartado).
- [x] T003 [P] [Base] Variables `SESSION_ENCRYPTION_KEY=` y `CORS_ORIGIN=` sin valor en la plantilla; en `.env.dev` (no versionado) una clave de `openssl rand -hex 32` y `CORS_ORIGIN=http://localhost:5173`, y en `.env.prod` otra clave y `https://kompitu.yandrydev.cloud` (D-11, RF-35) — `.env.example`
  - Verifica: `grep -E "^(SESSION_ENCRYPTION_KEY|CORS_ORIGIN)=$" .env.example` devuelve 2 líneas.
- [x] T004 [P] [Base] Test de configuración: clave de 64 hex obligatoria, `CORS_ORIGIN` como URL de origen, error claro si falta o es inválida (D-11) — `src/shared/infrastructure/config/tests/app.config.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/config` **falla**.
- [x] T005 [Base] Lectura y validación de la configuración con Zod (D-11, RF-35) — `src/shared/infrastructure/config/app.config.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/config` pasa.

### Base de datos
- [x] T006 [Base] Modelos `User`, `Session`, `RefreshToken`, `CsrfToken`, `LoginAttempt` y `userId` UUID con relación en cascada en `Task`, `Alert`, `AlertPeriodCheck` y `UserTimeZone` (plan §4, D-9) — `prisma/schema.prisma`
  - Verifica: `dce pnpm exec prisma validate`.
- [x] T007 [Base] Migración con `TRUNCATE` de las tablas de la 001 antes de cambiar el tipo de `user_id`, tablas nuevas, índices y claves foráneas (RF-33, plan §4) — `prisma/migrations/<AAAAMMDDHHMMSS>_user_accounts/migration.sql`
  - Verifica: `dce pnpm prisma migrate deploy` aplica la migración y `dce pnpm prisma generate` termina sin errores.
- [x] T008 [Base] Tablas nuevas en `truncateTables` y helper `createTestUser(prisma)` para los tests de integración (R-12) — `tests/integration/test-database.helper.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
  - Hecho (2026-10-28): `users` no se vacía por fichero (las claves foráneas en cascada borrarían los datos de los demás ficheros en paralelo); `tests/integration/global.setup.ts` vacía `users` y los tokens una sola vez por ejecución y cada fichero crea sus cuentas con `createTestUser`.
- [x] T009 [Base] Test de integración de tareas con usuarios reales creados con `createTestUser` (R-12) — `src/modules/tasks/infrastructure/tests/prisma-task.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/prisma-task` pasa.
- [x] T010 [P] [Base] Tests de integración de avisos y zonas con usuarios reales (R-12) — `src/modules/alerts/infrastructure/tests/prisma-alert.repository.int.test.ts`, `prisma-user-time-zone.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/alerts/infrastructure/tests/prisma` pasa.
  - Hecho (2026-10-28): al pasar `user_id` a `UUID`, las tres consultas SQL a mano de la 001 fallaban (`uuid = text`); se añadió `::uuid` en `prisma-alert.repository.ts`, `prisma-user-time-zone.repository.ts` y `prisma-task.repository.ts` (aprobado por el usuario).
- [x] T011 [P] [Base] Test de rendimiento con usuarios reales: el usuario de las pruebas y los 10 000 del planificador se crean en `users` (R-12) — `tests/performance/api.perf.test.ts`
  - Verifica: `dce pnpm test:perf` pasa.

### Infraestructura compartida
- [x] T012 [P] [Base] Test de los códigos de error nuevos: HTTP y mensaje en español de cada uno (RF-34, RNF-02) — `src/shared/infrastructure/http/tests/error-handler.middleware.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/error-handler` **falla**.
- [x] T013 [Base] Añadir `INVALID_CSRF_TOKEN`, `MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_REFRESH_TOKEN`, `SESSION_EXPIRED`, `TOO_MANY_ATTEMPTS`, `INVALID_CREDENTIALS`, `WRONG_PASSWORD` y `EMAIL_ALREADY_REGISTERED` (RF-34) — `src/shared/domain/error-code.constant.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/error-handler` pasa.
  - Hecho (2026-10-28): la precedencia ya sigue la numeración de RF-34; `MISSING_USER` se queda en el nivel de sesión hasta T088.
- [x] T014 [P] [Base] Test del helper de cookies: lectura (varias, ausentes, mal formadas) y atributos al escribir y borrar (D-5, RNF-05) — `src/shared/infrastructure/http/tests/cookie.helper.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/cookie` **falla**.
- [x] T015 [Base] `readCookie`, `setSessionCookies` y `clearSessionCookies` con `HttpOnly`, `Secure`, `SameSite=Strict`, `Path` y `Max-Age` (D-5, RF-07, RF-15) — `src/shared/infrastructure/http/cookie.helper.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/cookie` pasa.
- [x] T016 [P] [Base] `SessionContext` y `RequestContext extends SessionContext`, y helper para guardarlo en `res.locals` (plan §3) — `src/shared/application/request-context.type.ts`, `src/shared/infrastructure/http/session-context.helper.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
  - Hecho (2026-10-28): `RequestContext` todavía no extiende `SessionContext` (el contexto de la 001 no tiene sesión hasta H4); se unifican en T087.

### CORS
- [x] T017 [P] [Base] Test de CORS: cabeceras solo para el origen permitido; petición previa `200` con sobre, métodos y cabeceras; método no registrado, ruta inexistente y otro origen → `ROUTE_NOT_FOUND`; sin `Origin`, sin cambios (RF-35, RF-36) — `src/shared/infrastructure/http/tests/cors.middleware.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/cors` **falla**.
- [x] T018 [Base] Middleware CORS y `allowPreflight(router, path, methods)` (RF-35, RF-36, D-7) — `src/shared/infrastructure/http/cors.middleware.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/cors` pasa.
- [x] T019 [Base] El guardián de métodos deja pasar solo la petición previa desde el origen permitido; montar CORS primero en la app (RF-36) — `src/shared/infrastructure/http/allowed-method.middleware.ts`, `src/app.factory.ts`
  - Verifica: `dce pnpm test src/shared` pasa (incluido `OPTIONS` sin preflight → `ROUTE_NOT_FOUND` en `error-handler.middleware.test.ts`).
  - Hecho (2026-10-28): `createApp` recibe `corsOrigin` (opcional); el contenedor real lo conecta con `app.config.ts` en T053.

### Dominio de `users`
- [x] T020 [P] [Base] Test de la entidad usuario: constantes de longitud, `rename` con recorte y vacío → `null` (RF-05) — `users/domain/tests/user.entity.test.ts`
  - Verifica: `dce pnpm test src/modules/users/domain/tests/user.entity` **falla**.
- [x] T021 [P] [Base] Test de la entidad sesión: 15 min, 7 días, tope de 30 días con el ejemplo de RF-11 y margen de 30 s (RF-07, RF-11 a RF-13) — `users/domain/tests/session.entity.test.ts`
  - Verifica: `dce pnpm test src/modules/users/domain/tests/session.entity` **falla**.
- [x] T022 [P] [Base] Test del bloqueo: ejemplo de RF-09 (10:00…10:10 → hasta 10:25), quinto fallo, ventana deslizante y vencimiento (RF-09, RF-10, D-10) — `users/domain/tests/login-throttle.value-object.test.ts`
  - Verifica: `dce pnpm test src/modules/users/domain/tests/login-throttle` **falla**.
- [x] T023 [Base] Entidad `User` y constantes (RF-05) — `users/domain/user.entity.ts`
  - Verifica: `dce pnpm test src/modules/users/domain/tests/user.entity` pasa.
- [x] T024 [P] [Base] Entidad `Session` con sus reglas de caducidad y margen (RF-07, RF-11 a RF-13) — `users/domain/session.entity.ts`
  - Verifica: `dce pnpm test src/modules/users/domain/tests/session.entity` pasa.
- [x] T025 [P] [Base] `LoginThrottle` (RF-09, RF-10, D-10) — `users/domain/login-throttle.value-object.ts`
  - Verifica: `dce pnpm test src/modules/users/domain/tests/login-throttle` pasa.
- [x] T026 [P] [Base] Puertos `UserRepository` y `CsrfTokenRepository` (plan §3) — `users/domain/user.repository.ts`, `users/domain/csrf-token.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T027 [P] [Base] Puertos `SessionRepository` y `LoginAttemptRepository` (plan §3) — `users/domain/session.repository.ts`, `users/domain/login-attempt.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
  - Hecho (2026-10-28): la renovación atómica se expone como `withRefreshTokenLocked(hash, work)` con una `RefreshUnitOfWork` (`rotate`, `close`), igual que `claimPeriod` en los avisos; el registro de un refresh token incluye su `tokenHash`.
- [x] T028 [P] [Base] Puertos `PasswordHasher`, `TokenService` y `GraceTokenCipher` (D-1, D-2, D-3) — `users/domain/password-hasher.port.ts`, `users/domain/token.port.ts`, `users/domain/grace-token-cipher.port.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T029 [P] [Base] Fakes en memoria de usuarios y tokens CSRF previos — `tests/support/in-memory-user.repository.ts`, `tests/support/in-memory-csrf-token.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T030 [P] [Base] Fakes en memoria de sesiones (con `refresh_tokens` y margen) y de intentos de login — `tests/support/in-memory-session.repository.ts`, `tests/support/in-memory-login-attempt.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T031 [P] [Base] `FakePasswordHasher` rápido para tests unitarios y HTTP (plan §10) — `tests/support/fake-password-hasher.adapter.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.

### Adaptadores criptográficos
- [x] T032 [P] [Base] Test de Argon2id: cadena `$argon2id$v=19$m=19456,p=1,t=2$…`, verificación correcta e incorrecta, sales distintas, no ASCII, `verifyDummy` siempre `false` (RNF-03, D-2, D-3) — `users/infrastructure/tests/argon2-password-hasher.adapter.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/argon2` **falla**.
- [x] T033 [P] [Base] Test de tokens: 43 caracteres base64url distintos, huella SHA-256 de 64 hex, `equals` en tiempo constante (RNF-06, D-1) — `users/infrastructure/tests/crypto-token.adapter.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/crypto-token` **falla**.
- [x] T034 [P] [Base] Test del cifrado del margen: ida y vuelta, IV distinto, texto, etiqueta o clave alterados → error, el texto cifrado no contiene los tokens (RNF-06, D-1) — `users/infrastructure/tests/aes-gcm-grace-cipher.adapter.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/aes-gcm` **falla**.
- [x] T035 [Base] `PasswordHasher` con Argon2id y hash ficticio calculado al arrancar (D-2, D-3) — `users/infrastructure/argon2-password-hasher.adapter.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/argon2` pasa.
- [x] T036 [P] [Base] `TokenService` con `randomBytes`, SHA-256 y `timingSafeEqual` (D-1) — `users/infrastructure/crypto-token.adapter.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/crypto-token` pasa.
- [x] T037 [P] [Base] `GraceTokenCipher` con AES-256-GCM y formato `v1.<iv>.<cifrado>.<etiqueta>` (D-1) — `users/infrastructure/aes-gcm-grace-cipher.adapter.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/aes-gcm` pasa.
  - Hecho (2026-10-28): la librería escribe los parámetros como `m=19456,p=1,t=2`; corregido el orden en el test, el plan y `schema.prisma`. El test de alteración del cifrado se hizo determinista (cambiar el último carácter base64url podía tocar solo bits de relleno). Ambos cambios aprobados por el usuario.

### Repositorios Prisma de `users`
- [x] T038 [P] [Base] Test de integración de usuarios: email único, borrado en cascada de tareas, avisos, comprobaciones, zona y sesiones, y ninguna tarea, aviso ni zona sin cuenta tras migrar (RF-03, RF-29, RF-33, D-9) — `users/infrastructure/tests/prisma-user.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/prisma-user` **falla**.
- [x] T039 [P] [Base] Test de integración de sesiones: búsqueda por huellas, rotación atómica con dos renovaciones concurrentes, `deleteAllExcept`, limpieza, solo huellas y copia cifrada en la base de datos (RF-11, RF-13, RF-27, RNF-06, D-4) — `users/infrastructure/tests/prisma-session.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/prisma-session` **falla**.
- [x] T040 [P] [Base] Tests de integración de intentos de login y tokens CSRF previos: guardar, leer, caducar y limpiar (RF-09, RF-22) — `users/infrastructure/tests/prisma-login-attempt.repository.int.test.ts`, `prisma-csrf-token.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/prisma-login prisma-csrf` **falla**.
- [x] T041 [Base] Repositorio de usuarios y mapper fila ↔ `User` ↔ recurso sin `passwordHash` (RF-03, RF-25, RNF-04) — `users/infrastructure/prisma-user.repository.ts`, `users/infrastructure/user.mapper.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/prisma-user` pasa.
- [x] T042 [Base] Repositorio de sesiones con rotación en transacción y `SELECT … FOR UPDATE` (RF-11, RF-13, D-4) — `users/infrastructure/prisma-session.repository.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/prisma-session` pasa.
- [x] T043 [P] [Base] Repositorios de intentos de login y tokens CSRF previos (RF-09, RF-22) — `users/infrastructure/prisma-login-attempt.repository.ts`, `users/infrastructure/prisma-csrf-token.repository.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/prisma-login prisma-csrf` pasa.

### Checkpoint Base
- `dce pnpm test` y `dce pnpm test:perf` pasan.
- `dce pnpm exec prisma migrate status` → base de datos al día.
- Principio V: `grep -rnE "from ['\"](express|@prisma/client|zod|argon2|node:crypto)" src/modules/users/domain src/modules/users/application` no devuelve resultados.

---

## Fase H1 — Registrarme (HU-01, P1)

### Tests (deben fallar)
- [x] T044 [P] [H1] Test del schema de registro: email 254/255, formato, recorte y minúsculas; contraseña 11/12/128/129 sin recortar, con espacios y no ASCII; nombre 100/101, vacío → `null` (RF-02 a RF-05) — `users/infrastructure/tests/user.schema.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` **falla**.
- [x] T045 [P] [H1] Test de emitir token CSRF previo: guarda solo la huella con caducidad de 30 min (RF-22, RNF-06) — `users/application/tests/issue-csrf-token.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/issue-csrf-token` **falla**.
- [x] T046 [P] [H1] Test de registro: crea la cuenta sin sesión, guarda la huella y no la contraseña, email repetido con otras mayúsculas → `EMAIL_ALREADY_REGISTERED` (RF-01, RF-03, RF-06, RNF-03) — `users/application/tests/register-user.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/register-user` **falla**.
- [x] T047 [H1] Test HTTP de `GET /auth/csrf` y `POST /auth/register`: `201` con `User` y sin cookies, `409`, `400` con `details`, sin `X-CSRF-Token` o con token caducado (31 min) → `INVALID_CSRF_TOKEN`, token reutilizable dentro de los 30 min, ningún cuerpo con la contraseña, petición previa de CORS (RF-01 a RF-06, RF-22, RF-23, RF-36, RNF-04) — `users/infrastructure/tests/auth.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/auth.routes` **falla**.
  - Nota (2026-10-28): el caso del token CSRF de otro tipo pasa a T061, porque antes de H2 no existen tokens CSRF de sesión.

### Implementación
- [x] T048 [H1] Schema de registro (RF-02 a RF-05) — `users/infrastructure/user.schema.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` pasa.
- [x] T049 [P] [H1] Caso de uso emitir token CSRF previo (RF-22) — `users/application/issue-csrf-token.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/issue-csrf-token` pasa.
- [x] T050 [P] [H1] Caso de uso registro, con `P2002` traducido a `EMAIL_ALREADY_REGISTERED` (RF-01, RF-03, RF-06) — `users/application/register-user.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/register-user` pasa.
- [x] T051 [H1] Middleware de CSRF previo a la sesión (RF-22, RF-23) — `users/infrastructure/presession-csrf.middleware.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T052 [H1] Controlador y rutas `GET /auth/csrf` y `POST /auth/register`, con sus peticiones previas de CORS (RF-01, RF-06, RF-22, RF-36) — `users/infrastructure/auth.controller.ts`, `users/infrastructure/auth.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T053 [H1] Cablear el módulo `users` (repositorios, adaptadores, router de `/auth`) en los dos contenedores (plan §3) — `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test src/modules/users` pasa entero.
- [x] T054 [H1] Guía manual: QS-0 (variables nuevas, migración, función `api` con `curl -c/-b` y `X-CSRF-Token`, aviso de Safari, R-2) y QS-H1 — `sdd/002-user-accounts/quickstart.md`
  - Verifica: ejecutar QS-0 y QS-H1 a mano.

### Checkpoint H1
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-H1.1** `GET /auth/csrf` → `200` con `csrfToken`; **QS-H1.2** registrar `ana@example.com` → `201` con el usuario y sin `Set-Cookie`; **QS-H1.3** registrar `" Ana@Example.COM "` → `409 EMAIL_ALREADY_REGISTERED`; **QS-H1.4** contraseña de 11 caracteres → `400 VALIDATION_ERROR`; **QS-H1.5** registro sin `X-CSRF-Token` → `403 INVALID_CSRF_TOKEN`.

---

## Fase H2 — Iniciar y cerrar sesión (HU-02, P1)

`GET /me` (RF-25, de HU-05) se implementa en esta fase porque es la ruta protegida más sencilla y la que usa la prueba independiente de HU-02.

### Tests (deben fallar)
- [x] T055 [P] [H2] Test del schema de login (RF-02, RF-04) — `users/infrastructure/tests/user.schema.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` **falla**.
- [x] T056 [P] [H2] Test de login: sesión con caducidades y token CSRF de sesión; email inexistente y contraseña errónea con el mismo error y `verifyDummy`; quinto fallo `INVALID_CREDENTIALS` y sexto `TOO_MANY_ATTEMPTS` aunque sea correcta; login correcto pone el contador a cero; varias sesiones (RF-07 a RF-10, RF-16, RF-24) — `users/application/tests/login.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/login` **falla**.
- [x] T057 [P] [H2] Test de autenticar la sesión: sin token, desconocido, de generación anterior, de sesión cerrada; caducado → `TOKEN_EXPIRED`; válido → `SessionContext` (RF-17 a RF-20, D-14) — `users/application/tests/authenticate-session.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/authenticate-session` **falla**.
- [x] T058 [P] [H2] Test del CSRF de sesión: coincide y no coincide (RF-23) — `users/application/tests/verify-session-csrf.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/verify-session-csrf` **falla**.
- [x] T059 [P] [H2] Test de logout: por token de acceso y, si caducó, por refresh; no toca otras sesiones (RF-15, RF-16) — `users/application/tests/logout.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/logout` **falla**.
- [x] T060 [P] [H2] Test de consultar el perfil sin contraseña (RF-25) — `users/application/tests/get-profile.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/get-profile` **falla**.
- [x] T061 [H2] Test HTTP de login y logout: cookies con sus atributos, `{ user, csrfToken }`, `401`/`429`, logout con acceso caducado y refresh válido, logout dos veces, `X-CSRF-Token` sin sesión → error de sesión y con sesión ajena → `INVALID_CSRF_TOKEN` (decisión 19), tokens CSRF cruzados (el de sesión en registro o login y el previo en logout con sesión → `INVALID_CSRF_TOKEN`), ningún cuerpo con tokens de sesión (RF-07 a RF-10, RF-15, RF-23, RF-24, RNF-04, RNF-05) — `users/infrastructure/tests/auth.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/auth.routes` **falla**.
  - Hecho (2026-10-28): `signIn` registra la cuenta con el nombre «Ana» y la contraseña `TEST_PASSWORD`; `cookiesFrom(response)` convierte los `Set-Cookie` en la cabecera `Cookie`.
- [x] T062 [H2] Test HTTP de `GET /me`: con sesión → `User`; sin cookie, con token inventado y caducado → `MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`; sin `X-Client-Time` → `200` (RF-17 a RF-20, RF-25, RF-30) — `users/infrastructure/tests/me.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/me.routes` **falla**.

### Implementación
- [x] T063 [H2] Schema de login (RF-02, RF-04) — `users/infrastructure/user.schema.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` pasa.
- [x] T064 [H2] Caso de uso login (RF-07 a RF-10, RF-16, RF-24) — `users/application/login.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/login` pasa.
- [x] T065 [P] [H2] Casos de uso autenticar la sesión y verificar el CSRF de sesión (RF-17 a RF-20, RF-23) — `users/application/authenticate-session.use-case.ts`, `users/application/verify-session-csrf.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/authenticate-session verify-session-csrf` pasa.
- [x] T066 [P] [H2] Casos de uso logout y consultar el perfil (RF-15, RF-25) — `users/application/logout.use-case.ts`, `users/application/get-profile.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/logout get-profile` pasa.
- [x] T067 [H2] Middleware de sesión con CSRF en el orden de RF-34 y la decisión 19, y variante de logout que resuelve por el refresh token (RF-17 a RF-20, RF-23, D-6) — `users/infrastructure/session.middleware.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
  - Hecho (2026-10-28): el middleware cubre las rutas protegidas; el logout no usa una variante del middleware: su controlador exige la cabecera con `requireCsrfHeader` (exportado por `session.middleware.ts`) y `LogoutUseCase` resuelve la sesión por el token de acceso o el refresh token vigente y compara el CSRF. Así lo prueban sus tests unitarios (T059) y el orden de RF-34 se mantiene.
- [x] T068 [H2] Controlador y rutas `POST /auth/login` y `POST /auth/logout` con sus peticiones previas (RF-07, RF-15, RF-36) — `users/infrastructure/auth.controller.ts`, `users/infrastructure/auth.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
  - Hecho (2026-10-28): las cookies del login duran exactamente 15 min y 7 días porque su `Max-Age` se calcula desde el instante del login (`session.createdAt`); con el reloj leído en el controlador salía 899.
- [x] T069 [H2] Controlador y ruta `GET /me` con su petición previa (RF-25, RF-36) — `users/infrastructure/me.controller.ts`, `users/infrastructure/me.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T070 [H2] Cablear el middleware de sesión y el router de `/me`, y helper `signIn(server, email?)` que devuelve `Cookie` y `X-CSRF-Token` — `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test src/modules/users` pasa entero.
- [x] T071 [H2] Guía manual, sección QS-H2 — `sdd/002-user-accounts/quickstart.md`
  - Verifica: ejecutar QS-H2 a mano.
  - Hecho (2026-10-28): QS-H2.5 va antes que QS-H2.4, que bloquea la cuenta 15 minutos; ejecutado a mano contra la API de desarrollo.

### Checkpoint H2
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-H2.1** login → `200` con `Set-Cookie: access_token` y `refresh_token` (`HttpOnly; Secure; SameSite=Strict`) y `csrfToken`; **QS-H2.2** `GET /me` con las cookies → `200` con el usuario; **QS-H2.3** contraseña errónea → `401 INVALID_CREDENTIALS`, igual que con un email inexistente; **QS-H2.4** cinco fallos y después la contraseña correcta → `429 TOO_MANY_ATTEMPTS`; **QS-H2.5** logout → `200` y `GET /me` → `401`.

---

## Fase H3 — Mantener la sesión abierta mientras la uso (HU-03, P1)

### Tests (deben fallar)
- [x] T072 [P] [H3] Test de renovar: rotación con nuevas caducidades; 7 días sin renovar y tope de 30 días → `SESSION_EXPIRED`; rotado a los 10 s → mismos tokens desde la copia cifrada; a los 31 s y de dos generaciones atrás → sesión cerrada e `INVALID_REFRESH_TOKEN`; token inexistente; otras sesiones intactas; CSRF de sesión sin cambios (RF-11 a RF-14, RF-24, CE-04) — `users/application/tests/refresh-session.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/refresh-session` **falla**.
- [x] T073 [P] [H3] Test de limpieza: borra solo lo caducado, incluidas las copias cifradas de más de 30 s (D-12, R-13) — `users/application/tests/purge-expired-auth-data.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/purge-expired` **falla**.
- [x] T074 [P] [H3] Test del planificador de limpieza: pasada al arrancar, cada minuto, sin solapamiento, errores registrados (D-12) — `users/infrastructure/tests/auth-cleanup.scheduler.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/auth-cleanup` **falla**.
- [x] T075 [H3] Test HTTP de `POST /auth/refresh`: acceso caducado → `TOKEN_EXPIRED` → refresh → `200` y la petición funciona; dos renovaciones con 5 s de diferencia; reutilización a los 31 s cierra la sesión; cookies borradas en `INVALID_REFRESH_TOKEN` y `SESSION_EXPIRED`; sin `X-CSRF-Token` → `INVALID_CSRF_TOKEN` (RF-11 a RF-14, RF-20, RF-23) — `users/infrastructure/tests/auth.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/auth.routes` **falla**.

### Implementación
- [x] T076 [H3] Caso de uso renovar (RF-11 a RF-14, RF-24) — `users/application/refresh-session.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/refresh-session` pasa.
  - Hecho (2026-10-28): dentro de la transacción de `withRefreshTokenLocked` el caso de uso no lanza errores, porque un error la desharía y con ella el cierre de la sesión (RF-12, RF-13): devuelve el resultado y lanza el error al terminar. Una copia cifrada que no se puede abrir (clave cambiada) cuenta como reutilización (R-4).
- [x] T077 [H3] Variante del middleware de sesión para `/auth/refresh`: resuelve por el refresh token y aplica la decisión 19 (RF-14, RF-23, D-6) — `users/infrastructure/session.middleware.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
  - Hecho (2026-10-28): como el logout (T067), sin variante del middleware: el controlador exige `X-CSRF-Token` con `requireCsrfHeader` y `RefreshSessionUseCase` compara el CSRF con la sesión del refresh token dentro de la transacción (plan §5.3, paso 3).
- [x] T078 [H3] Controlador y ruta `POST /auth/refresh` con su petición previa (RF-11, RF-36) — `users/infrastructure/auth.controller.ts`, `users/infrastructure/auth.routes.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/auth.routes` pasa.
- [x] T079 [P] [H3] Caso de uso limpieza y planificador cada minuto (D-12) — `users/application/purge-expired-auth-data.use-case.ts`, `users/infrastructure/auth-cleanup.scheduler.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/purge-expired src/modules/users/infrastructure/tests/auth-cleanup` pasa.
  - Hecho (2026-10-28): el planificador de limpieza habría repetido casi entero `AlertScheduler` (AGENTS.md §8, sin bloques duplicados): lo común (arrancar, parar, no solapar y registrar el fallo) se extrajo a `src/shared/infrastructure/scheduling/interval-runner.ts`, con su test, y lo usan los dos planificadores; los tests de `AlertScheduler` no cambian. Solo se registra la pasada inicial (`AUTH_CLEANUP_COMPLETED`) y los fallos (`AUTH_CLEANUP_FAILED`).
- [x] T080 [H3] Cablear el planificador de limpieza y arrancarlo y pararlo con el servidor (incluida la recarga en caliente) (D-12) — `src/dependency.container.ts`, `src/server.main.ts`
  - Verifica: `docker compose -f docker-compose.dev.yml restart api` y `docker compose -f docker-compose.dev.yml logs --since 1m api` muestra la pasada inicial de limpieza sin errores.
  - Hecho (2026-10-28): tras reiniciar `api`, el log muestra `AUTH_CLEANUP_COMPLETED` sin errores; `server.main.ts` para los dos planificadores al cerrar y en la recarga en caliente.
- [x] T081 [H3] Guía manual, sección QS-H3 — `sdd/002-user-accounts/quickstart.md`
  - Verifica: ejecutar QS-H3 a mano.
  - Hecho (2026-10-28): ejecutado a mano contra la API de desarrollo, incluida la espera de 31 s de QS-H3.3.

### Checkpoint H3
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-H3.1** `POST /auth/refresh` → `200` con cookies nuevas y el mismo `csrfToken` sigue valiendo; **QS-H3.2** el refresh token anterior antes de 30 s → los mismos tokens; **QS-H3.3** el anterior después de 30 s → `401 INVALID_REFRESH_TOKEN` y `GET /me` → `401 INVALID_TOKEN`; **QS-H3.4** refresh sin cookie → `401 INVALID_REFRESH_TOKEN`.

---

## Fase H4 — Usar mis tareas, racha y avisos con mi sesión (HU-04, P1)

### Tests (deben fallar)
- [x] T082 [H4] Test del contexto de petición reescrito: sin `X-User-Id`; usa el `SessionContext`; hora y zona como en la 001; recuerda la zona solo con sesión y cabeceras válidas (RF-30 a RF-32) — `src/shared/infrastructure/http/tests/request-context.middleware.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/request-context` **falla**.
- [x] T083 [H4] Test HTTP de tareas reescrito con `signIn`: mismas comprobaciones de la 001 con cookie y CSRF; `X-User-Id` de otro usuario sin efecto; `X-User-Id` sin cookie → `MISSING_TOKEN`; `POST` sin CSRF → `INVALID_CSRF_TOKEN`; aislamiento entre dos cuentas (RF-17, RF-18, RF-21, RF-23, RF-30, RF-32, CE-02, CE-03) — `src/modules/tasks/infrastructure/tests/task.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/task.routes` **falla**.
  - Hecho (2026-10-29): en la batería por pares el nivel de usuario (`MISSING_USER`) pasa a ser el de sesión (sin cookie y con `X-CSRF-Token` → `MISSING_TOKEN`), con los niveles renumerados según RF-34; el nivel CSRF y los pares de la decisión 19 quedan para T116. Además: CE-01 de la 002 (cuatro peticiones hasta la primera tarea), `TOKEN_EXPIRED` y renovación, token CSRF previo en `POST /tasks` y peticiones previas de `/tasks` y `/tasks/{id}`.
- [x] T084 [P] [H4] Tests HTTP de racha y avisos reescritos con `signIn`; la zona se recuerda en `/alerts` con sesión válida aunque la petición falle (RF-21, RF-30, RF-31) — `src/modules/streaks/infrastructure/tests/streak.routes.test.ts`, `src/modules/alerts/infrastructure/tests/alert.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/streaks src/modules/alerts` **falla**.
  - Hecho (2026-10-29): `runAlertPassAt22` adelanta el reloj diez horas y el token de acceso dura 15 minutos, así que los tests de avisos vuelven a iniciar sesión tras la pasada (`nightHeaders`).
- [x] T085 [P] [H4] Test del cableado de producción: rutas de `/auth` y `/me` montadas; rutas protegidas sin cookie → `MISSING_TOKEN` (RF-18) — `src/tests/dependency.container.test.ts`
  - Verifica: `dce pnpm test src/tests/dependency.container` **falla**.
- [x] T086 [P] [H4] Test de errores: `MISSING_USER` ya no existe y la precedencia sigue el orden de RF-34 (RF-32, RF-34) — `src/shared/infrastructure/http/tests/error-handler.middleware.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/error-handler` **falla**.

### Implementación
- [x] T087 [H4] Contexto de petición sin `X-User-Id`: toma el usuario del `SessionContext`, valida hora y zona y recuerda la zona (RF-30 a RF-32) — `src/shared/infrastructure/http/request-context.middleware.ts`, `src/shared/infrastructure/http/request-header.schema.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/request-context` pasa.
  - Hecho (2026-10-29): `RequestContext extends SessionContext` (cierra la nota de T016), así que los tests de los casos de uso de la 001 llevan `sessionId`. Sin `SessionContext` el middleware falla como error de montaje (`INTERNAL_ERROR`), no como error del cliente.
- [x] T088 [H4] Eliminar `MISSING_USER` y renumerar la precedencia según RF-34 (RF-32, RF-34) — `src/shared/domain/error-code.constant.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/error-handler` pasa.
  - Hecho (2026-10-29): cierra la nota de T013; el test comprueba el orden completo de RF-34 sobre `ERROR_CODES`.
- [x] T089 [H4] Rutas de tareas con sesión (CSRF en `POST`/`PATCH`/`DELETE`) → contexto → JSON, y sus peticiones previas (RF-17, RF-23, RF-30, RF-36, D-8) — `src/modules/tasks/infrastructure/task.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T090 [P] [H4] Rutas de racha y avisos con sesión → contexto, y sus peticiones previas (RF-17, RF-30, RF-36, D-8) — `src/modules/streaks/infrastructure/streak.routes.ts`, `src/modules/alerts/infrastructure/alert.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [x] T091 [H4] Inyectar el middleware de sesión en los routers de `tasks`, `streaks` y `alerts` en los dos contenedores (RF-17, RF-21) — `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test` pasa entero.
  - Hecho (2026-10-29): en los dos contenedores la sesión se crea antes que los routers de la 001. `clientHeaders` deja de enviar `X-User-Id` y `userIdOf(container, email?)` da el id de una cuenta para sembrar datos en los repositorios en memoria.
- [x] T092 [H4] Test de rendimiento con sesión: inicia sesión una vez y envía cookie y `X-CSRF-Token` en lugar de `X-User-Id` (RF-17) — `tests/performance/api.perf.test.ts`
  - Verifica: `dce pnpm test:perf` pasa.
  - Hecho (2026-10-29): el test registra la cuenta e inicia sesión por HTTP con Argon2id real; p95 de 2,0 a 4,8 ms por endpoint y pasada del planificador de 10,8 s.
- [x] T093 [H4] Guía de la 001: la función `api` inicia sesión y usa cookies y `X-CSRF-Token`; desaparecen `X-User-Id` y `MISSING_USER` (RF-32) — `sdd/001-taskApiSDD-mvp/quickstart.md`
  - Verifica: ejecutar QS-H1 de la 001 a mano con la nueva función `api`.
  - Hecho (2026-10-29): `signin <nombre>` crea la cuenta si no existe, inicia sesión y deja en `USER_ID` su UUID para los `INSERT` de `psql`; QS-H6.5 crea en la base de datos la cuenta sin zona. La colección de Postman de la 001 sigue pendiente de T119 (avisado en la guía y el README). QS-H1 ejecutado a mano con la nueva función.
- [x] T094 [H4] Guía manual, sección QS-H4 — `sdd/002-user-accounts/quickstart.md`
  - Verifica: ejecutar QS-H4 a mano.
  - Hecho (2026-10-29): ejecutado a mano contra la API de desarrollo con las cuentas de Ana y Bea.

### Checkpoint H4
- `dce pnpm test` y `dce pnpm test:perf` pasan.
- RF-32: `grep -rni "x-user-id\|MISSING_USER" src tests` no devuelve resultados salvo los tests que comprueban que la cabecera no tiene efecto.
- quickstart.md → **QS-H4.1** con la sesión de Ana, crear y listar tareas → `201` y `200`; **QS-H4.2** `POST /tasks` sin `X-CSRF-Token` → `403 INVALID_CSRF_TOKEN`; **QS-H4.3** `GET /tasks` sin cookie y con `X-User-Id` de Ana → `401 MISSING_TOKEN`; **QS-H4.4** con la sesión de Bea, las tareas de Ana no aparecen y `GET /tasks/{id}` de Ana → `404 TASK_NOT_FOUND`; **QS-H4.5** `GET /tasks` sin `X-Client-Time` → `400 INVALID_CLIENT_TIME`.

---

## Fase H5 — Ver y editar mi perfil (HU-05, P2)

### Tests (deben fallar)
- [x] T095 [P] [H5] Test del schema de `PATCH /me`: `name` 100/101, recorte, `null` y vacío; `email` u otro campo → error (RF-05, RF-26) — `users/infrastructure/tests/user.schema.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` **falla**.
- [x] T096 [P] [H5] Test de editar el perfil (RF-05, RF-26) — `users/application/tests/update-profile.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/update-profile` **falla**.
- [x] T097 [H5] Test HTTP de `PATCH /me`: `200` con el nombre recortado, `"   "` → `null`, `email` → `VALIDATION_ERROR`, sin CSRF → `INVALID_CSRF_TOKEN`, petición previa de CORS de `PATCH /me` → `200` (RF-05, RF-23, RF-26, RF-36) — `users/infrastructure/tests/me.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/me.routes` **falla**.

### Implementación
- [x] T098 [H5] Schema de `PATCH /me`, `strict` (RF-05, RF-26) — `users/infrastructure/user.schema.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` pasa.
  - Hecho (2026-10-29): `name` es obligatorio y admite `null`, como dice el contrato; un campo desconocido, incluido `email`, aparece en `details` con `field: "body"`, igual que en el `PATCH /tasks` de la 001 (el helper compartido no cambia).
- [x] T099 [H5] Caso de uso editar el perfil (RF-26) — `users/application/update-profile.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/update-profile` pasa.
- [x] T100 [H5] Controlador y ruta `PATCH /me`, y `PATCH` en la petición previa de `/me` (RF-26, RF-36) — `users/infrastructure/me.controller.ts`, `users/infrastructure/me.routes.ts`
  - Verifica: `dce pnpm test src/modules/users` pasa entero.
  - Hecho (2026-10-29): `PATCH /me` encadena sesión → JSON → controlador, así que `TOKEN_EXPIRED` gana a un cuerpo con `email` (ejemplo de RF-34); la petición previa de `/me` pasa a `GET, PATCH` (RF-36).
- [x] T101 [H5] Guía manual, sección QS-H5 — `sdd/002-user-accounts/quickstart.md`
  - Verifica: ejecutar QS-H5 a mano.
  - Hecho (2026-10-29): ejecutado a mano contra la API de desarrollo.

### Checkpoint H5
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-H5.1** `PATCH /me` con `"  Ana  "` → `200` con `name: "Ana"`; **QS-H5.2** `GET /me` devuelve "Ana"; **QS-H5.3** `PATCH /me` con `email` → `400 VALIDATION_ERROR`.

---

## Fase H6 — Cambiar mi contraseña (HU-06, P2)

### Tests (deben fallar)
- [x] T102 [P] [H6] Test del schema de `PATCH /me/password` (RF-04) — `users/infrastructure/tests/user.schema.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` **falla**.
- [x] T103 [P] [H6] Test de cambiar la contraseña: cambia la huella, cierra las demás sesiones y mantiene la actual; actual errónea → `WRONG_PASSWORD` y cuenta para el bloqueo; bloqueada → `TOO_MANY_ATTEMPTS`; la nueva puede coincidir con la anterior (RF-09, RF-27, RF-28) — `users/application/tests/change-password.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/change-password` **falla**.
- [x] T104 [H6] Test HTTP de `PATCH /me/password`: `200`; la otra sesión responde `INVALID_TOKEN` y su refresh `INVALID_REFRESH_TOKEN`; login con la anterior falla y con la nueva funciona; 3 logins fallidos + 2 contraseñas actuales erróneas → bloqueo; la sesión abierta sigue funcionando en `/tasks` con la cuenta bloqueada; petición previa de CORS de `PATCH /me/password` → `200` (RF-09, RF-19, RF-27, RF-28, RF-36) — `users/infrastructure/tests/me.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/me.routes` **falla**.

### Implementación
- [x] T105 [H6] Schema de `PATCH /me/password` (RF-04) — `users/infrastructure/user.schema.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` pasa.
  - Hecho (2026-10-29): `currentPassword` solo tiene que llegar, con el tope de 128 caracteres para no derivar textos enormes con Argon2id; `newPassword` cumple RF-04. Ninguna se recorta.
- [x] T106 [H6] Caso de uso cambiar la contraseña (RF-09, RF-27, RF-28) — `users/application/change-password.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/change-password` pasa.
  - Hecho (2026-10-29): la comprobación de la contraseña con el bloqueo se extrajo a `users/application/confirm-password.use-case.ts`, con su test, porque `DELETE /me` (T113) la repite tal cual (AGENTS.md §8, sin bloques duplicados). Los fallos cuentan por el email de la cuenta (plan §5.7).
- [x] T107 [H6] Controlador y ruta `PATCH /me/password` con su petición previa (RF-27, RF-36) — `users/infrastructure/me.controller.ts`, `users/infrastructure/me.routes.ts`
  - Verifica: `dce pnpm test src/modules/users` pasa entero.
  - Hecho (2026-10-29): `PATCH /me/password` encadena sesión → JSON → controlador, y el controlador valida el cuerpo antes de comprobar el bloqueo, así que `VALIDATION_ERROR` gana a `TOO_MANY_ATTEMPTS` (RF-34); petición previa de `/me/password` con `PATCH` (RF-36).
- [x] T108 [H6] Guía manual, sección QS-H6 — `sdd/002-user-accounts/quickstart.md`
  - Verifica: ejecutar QS-H6 a mano.
  - Hecho (2026-10-29): ejecutado a mano contra la API de desarrollo con dos sesiones de la misma cuenta.

### Checkpoint H6
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-H6.1** con dos sesiones (dos ficheros de cookies), cambiar la contraseña desde una → `200`; **QS-H6.2** la otra → `GET /me` → `401 INVALID_TOKEN`; **QS-H6.3** login con la contraseña anterior → `401 INVALID_CREDENTIALS`, con la nueva → `200`; **QS-H6.4** contraseña actual errónea → `403 WRONG_PASSWORD`.

---

## Fase H7 — Borrar mi cuenta (HU-07, P3)

### Tests (deben fallar)
- [ ] T109 [P] [H7] Test del schema de `DELETE /me` (RF-28) — `users/infrastructure/tests/user.schema.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` **falla**.
- [ ] T110 [P] [H7] Test de borrar la cuenta: borra la cuenta y el registro de bloqueo; contraseña errónea → `WRONG_PASSWORD`, cuenta intacta y fallo contado (RF-09, RF-28, RF-29) — `users/application/tests/delete-account.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/delete-account` **falla**.
- [ ] T111 [H7] Test HTTP de `DELETE /me`: `200` con cookies borradas; login con ese email → `INVALID_CREDENTIALS`; volver a registrarse con el mismo email → `201` sin datos; petición previa de CORS de `DELETE /me` → `200` (RF-28, RF-29, RF-36) — `users/infrastructure/tests/me.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/me.routes` **falla**.

### Implementación
- [ ] T112 [H7] Schema de `DELETE /me` (RF-28) — `users/infrastructure/user.schema.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` pasa.
- [ ] T113 [H7] Caso de uso borrar la cuenta (RF-09, RF-28, RF-29) — `users/application/delete-account.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/delete-account` pasa.
- [ ] T114 [H7] Controlador y ruta `DELETE /me`, y `DELETE` en la petición previa de `/me` (RF-29, RF-36) — `users/infrastructure/me.controller.ts`, `users/infrastructure/me.routes.ts`
  - Verifica: `dce pnpm test src/modules/users` pasa entero.
- [ ] T115 [H7] Guía manual, sección QS-H7 — `sdd/002-user-accounts/quickstart.md`
  - Verifica: ejecutar QS-H7 a mano.

### Checkpoint H7
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-H7.1** con una tarea creada, `DELETE /me` con la contraseña → `200` y cookies borradas; **QS-H7.2** en la base de datos no quedan filas de ese usuario en `users`, `tasks`, `sessions` ni `user_time_zones`; **QS-H7.3** login → `401 INVALID_CREDENTIALS`; **QS-H7.4** contraseña errónea → `403 WRONG_PASSWORD` y la cuenta sigue.

---

## Fase R — Robustez

- [ ] T116 [Rob] Batería de precedencia por pares reescrita con los niveles de RF-34 (ruta, CSRF, sesión, hora, zona, validación, tarea, día), incluida la excepción de la decisión 19 (RF-34, R-8) — `src/modules/tasks/infrastructure/tests/task.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/task.routes` pasa.
- [ ] T117 [P] [Rob] Casos de precedencia de `/auth` y `/me`: login bloqueado con contraseña errónea → `TOO_MANY_ATTEMPTS`; `PATCH /me` con `email` y acceso caducado → `TOKEN_EXPIRED`; `PATCH /me/password` bloqueado y sin `newPassword` → `VALIDATION_ERROR` (RF-34) — `users/infrastructure/tests/auth.routes.test.ts`, `users/infrastructure/tests/me.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests` pasa.
- [ ] T118 [P] [Rob] Rendimiento de registro, login, refresh, `GET /me` y `PATCH /me/password` con p95 < 300 ms (RNF-01, R-1) — `tests/performance/api.perf.test.ts`
  - Verifica: `dce pnpm test:perf` pasa.
- [x] T119 [P] [Rob] Colección de Postman con `GET /auth/csrf`, registro y login (cookies de Postman y `csrfToken` en una variable), flujo H1–H6 de la 001 con sesión y errores de sesión y CSRF (RF-17, RF-22, RF-23) — `sdd/001-taskApiSDD-mvp/mvp-p1.postman-collection.json`
  - Verifica: `docker run --rm -e TZ=Europe/Madrid -v "$PWD/sdd/001-taskApiSDD-mvp":/etc/newman postman/newman:6-alpine run mvp-p1.postman-collection.json --env-var baseUrl=http://host.docker.internal:3000` sin fallos.
  - Hecho (2026-10-29): 60 peticiones y 66 comprobaciones con Newman, sin fallos. El flujo pide el token previo, registra una cuenta nueva y entra con ella; las peticiones de la 001 envían su cookie y su token CSRF; "2. Errores" añade una segunda cuenta (en lugar de `X-User-Id: otro-usuario`) y los errores de sesión y CSRF (`MISSING_TOKEN`, también con `X-User-Id`; `INVALID_TOKEN`; `INVALID_CSRF_TOKEN` sin cabecera y con el token previo; decisión 19); "3. Mis tareas" entra con `myEmail` y `myPassword`. Las cookies no las gestiona el almacén de Postman, como decía la tarea, sino variables enviadas en la cabecera `Cookie` con `disableCookies` en cada petición (también en la colección de la 002): Newman no reenvía cookies `Secure` por http a `host.docker.internal`, y así Postman no mezcla las cookies guardadas con las de cada cuenta.
  - Nota (2026-10-28): a petición del usuario, la 002 tiene además su propia colección, `sdd/002-user-accounts/user-accounts.postman-collection.json`, creada tras H1 (token CSRF previo, registro, errores y CORS: 12 peticiones y 12 comprobaciones con Newman, sin fallos) ampliada tras H2 (login, `GET /me`, logout, sus errores y peticiones previas: 26 peticiones y 28 comprobaciones, sin fallos) tras H3 (renovación, margen de gracia, sus errores y la petición previa: 33 peticiones y 35 comprobaciones, sin fallos; la reutilización a los 31 s queda en los tests y en QS-H3.3) tras H5 (cambiar y consultar el nombre, el email rechazado dentro del flujo porque necesita sesión, sus errores y la petición previa: 39 peticiones y 41 comprobaciones, sin fallos) y tras H6 (segunda sesión, cambio de contraseña, la otra sesión cerrada, login con la anterior y con la nueva, contraseña actual errónea, sus errores y la petición previa: 49 peticiones y 51 comprobaciones, sin fallos). Las cookies se guardan en la variable `sessionCookie` y se envían en la cabecera `Cookie`, porque Newman no reenvía cookies `Secure` por http a `host.docker.internal`. Se amplía en cada historia.
- [ ] T120 [Rob] AGENTS.md: variables `SESSION_ENCRYPTION_KEY` y `CORS_ORIGIN`, módulo `users` y aviso de Safari en desarrollo (R-2) — `AGENTS.md`
  - Verifica: `grep -c "SESSION_ENCRYPTION_KEY\|CORS_ORIGIN" AGENTS.md` ≥ 2.
- [ ] T121 [Rob] Guía manual, sección QS-R: producción con cookies y CORS (petición previa desde `https://kompitu.yandrydev.cloud` y desde otro origen) y rendimiento — `sdd/002-user-accounts/quickstart.md`
  - Verifica: ejecutar QS-R a mano.

### Checkpoint Robustez
- `dce pnpm test`, `dce pnpm test:coverage` y `dce pnpm test:perf` pasan; `./scripts/sonar-scan.sh` → quality gate en verde.
- Principio V: `grep -rnE "from ['\"](express|@prisma/client|zod|argon2|node:crypto)" src/modules/*/domain src/modules/*/application src/shared/domain src/shared/application` no devuelve resultados.
- quickstart.md → **QS-R.1** `docker compose -f docker-compose.prod.yml run --rm migrate`; **QS-R.2** `docker compose -f docker-compose.prod.yml up --build -d`; **QS-R.3** `OPTIONS /auth/login` con `Origin: https://kompitu.yandrydev.cloud` → `200` con las cabeceras CORS, y con `Origin: https://otra-web.com` → `404 ROUTE_NOT_FOUND`; **QS-R.4** QS-H1 y QS-H2 contra producción; **QS-R.5** `dce pnpm test:perf` y revisar los p95.

---

## Cobertura RF → tareas

| RF | Tareas |
| :--- | :--- |
| RF-01 | T046, T047, T050, T052 |
| RF-02 | T044, T047, T048, T055, T063 |
| RF-03 | T038, T041, T044, T046, T048, T050 |
| RF-04 | T044, T048, T055, T063, T102, T105 |
| RF-05 | T020, T023, T044, T048, T095, T096, T097, T098 |
| RF-06 | T046, T047, T050, T052 |
| RF-07 | T015, T021, T024, T056, T061, T064, T068 |
| RF-08 | T056, T061, T064 |
| RF-09 | T022, T025, T040, T043, T056, T061, T064, T103, T104, T106, T110, T113 |
| RF-10 | T022, T025, T056, T064 |
| RF-11 | T021, T024, T039, T042, T072, T075, T076, T078 |
| RF-12 | T021, T024, T072, T075, T076 |
| RF-13 | T021, T024, T039, T042, T072, T075, T076 |
| RF-14 | T072, T075, T076, T077 |
| RF-15 | T015, T059, T061, T066, T068 |
| RF-16 | T056, T059, T064 |
| RF-17 | T057, T062, T065, T067, T083, T089, T090, T091, T092 |
| RF-18 | T057, T062, T065, T067, T083, T085 |
| RF-19 | T057, T062, T065, T067, T104 |
| RF-20 | T057, T062, T065, T067, T075 |
| RF-21 | T083, T084, T091 |
| RF-22 | T040, T043, T045, T047, T049, T051, T052 |
| RF-23 | T047, T051, T058, T061, T065, T067, T075, T077, T083, T089, T097 |
| RF-24 | T056, T061, T064, T072, T076 |
| RF-25 | T041, T060, T062, T066, T069 |
| RF-26 | T095, T096, T097, T098, T099, T100 |
| RF-27 | T039, T103, T104, T106, T107 |
| RF-28 | T103, T104, T106, T109, T110, T111, T112, T113 |
| RF-29 | T038, T110, T111, T113, T114 |
| RF-30 | T062, T082, T083, T084, T087, T089, T090 |
| RF-31 | T082, T084, T087 |
| RF-32 | T082, T083, T086, T087, T088, T093 |
| RF-33 | T007, T038 |
| RF-34 | T012, T013, T086, T088, T116, T117 |
| RF-35 | T003, T004, T005, T017, T018 |
| RF-36 | T017, T018, T019, T047, T052, T068, T069, T078, T089, T090, T097, T100, T104, T107, T111, T114 |
| RNF-01 | T118 |
| RNF-02 | T012, T013 |
| RNF-03 | T032, T035, T046 |
| RNF-04 | T041, T047, T061 |
| RNF-05 | T014, T015, T061 |
| RNF-06 | T033, T034, T036, T037, T039, T045 |

Los 36 RF y RNF-02 a RNF-06 tienen al menos una tarea de test y una de implementación. RNF-01 (rendimiento) solo tiene tarea de test (T118): lo cumplen las decisiones del plan (D-2, índices de la sección 4), como RNF-01 en la 001. Los criterios de éxito se comprueban en: CE-01 (T047, T061, T083: 4 peticiones hasta la primera tarea), CE-02 (T083, T085), CE-03 (T083, T097), CE-04 (T072, T075) y CE-05 (T039, T047, T061).
