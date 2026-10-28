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
- [ ] T001 [Base] Añadir `argon2` a `dependencies` con versión exacta publicada hace al menos dos semanas y autorizar su script de instalación en `allowBuilds` (D-2, R-14) — `package.json`, `pnpm-workspace.yaml`
  - Verifica: `docker compose -f docker-compose.dev.yml up --build -d -V` y `dce node -e "import('argon2').then((a) => a.hash('x')).then(console.log)"` imprime una cadena que empieza por `$argon2id$`.
- [ ] T002 [Base] Comprobar `argon2` en la imagen de producción, etapa `runtime`; solo si falla, ajustar el Dockerfile tras consultar al usuario (R-14) — `Dockerfile.prod`
  - Verifica: `docker build -f Dockerfile.prod --target runtime -t taskapisdd:argon2-check .` y `docker run --rm --entrypoint node taskapisdd:argon2-check -e "import('argon2').then((a) => a.hash('x')).then(console.log)"` imprime `$argon2id$…`.
- [ ] T003 [P] [Base] Variables `SESSION_ENCRYPTION_KEY=` y `CORS_ORIGIN=` sin valor en la plantilla; en `.env.dev` (no versionado) una clave de `openssl rand -hex 32` y `CORS_ORIGIN=http://localhost:5173`, y en `.env.prod` otra clave y `https://kompitu.yandrydev.cloud` (D-11, RF-35) — `.env.example`
  - Verifica: `grep -E "^(SESSION_ENCRYPTION_KEY|CORS_ORIGIN)=$" .env.example` devuelve 2 líneas.
- [ ] T004 [P] [Base] Test de configuración: clave de 64 hex obligatoria, `CORS_ORIGIN` como URL de origen, error claro si falta o es inválida (D-11) — `src/shared/infrastructure/config/tests/app.config.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/config` **falla**.
- [ ] T005 [Base] Lectura y validación de la configuración con Zod (D-11, RF-35) — `src/shared/infrastructure/config/app.config.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/config` pasa.

### Base de datos
- [ ] T006 [Base] Modelos `User`, `Session`, `RefreshToken`, `CsrfToken`, `LoginAttempt` y `userId` UUID con relación en cascada en `Task`, `Alert`, `AlertPeriodCheck` y `UserTimeZone` (plan §4, D-9) — `prisma/schema.prisma`
  - Verifica: `dce pnpm exec prisma validate`.
- [ ] T007 [Base] Migración con `TRUNCATE` de las tablas de la 001 antes de cambiar el tipo de `user_id`, tablas nuevas, índices y claves foráneas (RF-33, plan §4) — `prisma/migrations/<AAAAMMDDHHMMSS>_user_accounts/migration.sql`
  - Verifica: `dce pnpm prisma migrate deploy` aplica la migración y `dce pnpm prisma generate` termina sin errores.
- [ ] T008 [Base] Tablas nuevas en `truncateTables` y helper `createTestUser(prisma)` para los tests de integración (R-12) — `tests/integration/test-database.helper.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T009 [Base] Test de integración de tareas con usuarios reales creados con `createTestUser` (R-12) — `src/modules/tasks/infrastructure/tests/prisma-task.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/prisma-task` pasa.
- [ ] T010 [P] [Base] Tests de integración de avisos y zonas con usuarios reales (R-12) — `src/modules/alerts/infrastructure/tests/prisma-alert.repository.int.test.ts`, `prisma-user-time-zone.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/alerts/infrastructure/tests/prisma` pasa.
- [ ] T011 [P] [Base] Test de rendimiento con usuarios reales: el usuario de las pruebas y los 10 000 del planificador se crean en `users` (R-12) — `tests/performance/api.perf.test.ts`
  - Verifica: `dce pnpm test:perf` pasa.

### Infraestructura compartida
- [ ] T012 [P] [Base] Test de los códigos de error nuevos: HTTP y mensaje en español de cada uno (RF-34, RNF-02) — `src/shared/infrastructure/http/tests/error-handler.middleware.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/error-handler` **falla**.
- [ ] T013 [Base] Añadir `INVALID_CSRF_TOKEN`, `MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_REFRESH_TOKEN`, `SESSION_EXPIRED`, `TOO_MANY_ATTEMPTS`, `INVALID_CREDENTIALS`, `WRONG_PASSWORD` y `EMAIL_ALREADY_REGISTERED` (RF-34) — `src/shared/domain/error-code.constant.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/error-handler` pasa.
- [ ] T014 [P] [Base] Test del helper de cookies: lectura (varias, ausentes, mal formadas) y atributos al escribir y borrar (D-5, RNF-05) — `src/shared/infrastructure/http/tests/cookie.helper.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/cookie` **falla**.
- [ ] T015 [Base] `readCookie`, `setSessionCookies` y `clearSessionCookies` con `HttpOnly`, `Secure`, `SameSite=Strict`, `Path` y `Max-Age` (D-5, RF-07, RF-15) — `src/shared/infrastructure/http/cookie.helper.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/cookie` pasa.
- [ ] T016 [P] [Base] `SessionContext` y `RequestContext extends SessionContext`, y helper para guardarlo en `res.locals` (plan §3) — `src/shared/application/request-context.type.ts`, `src/shared/infrastructure/http/session-context.helper.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.

### CORS
- [ ] T017 [P] [Base] Test de CORS: cabeceras solo para el origen permitido; petición previa `200` con sobre, métodos y cabeceras; método no registrado, ruta inexistente y otro origen → `ROUTE_NOT_FOUND`; sin `Origin`, sin cambios (RF-35, RF-36) — `src/shared/infrastructure/http/tests/cors.middleware.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/cors` **falla**.
- [ ] T018 [Base] Middleware CORS y `allowPreflight(router, path, methods)` (RF-35, RF-36, D-7) — `src/shared/infrastructure/http/cors.middleware.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/cors` pasa.
- [ ] T019 [Base] El guardián de métodos deja pasar solo la petición previa desde el origen permitido; montar CORS primero en la app (RF-36) — `src/shared/infrastructure/http/allowed-method.middleware.ts`, `src/app.factory.ts`
  - Verifica: `dce pnpm test src/shared` pasa (incluido `OPTIONS` sin preflight → `ROUTE_NOT_FOUND` en `error-handler.middleware.test.ts`).

### Dominio de `users`
- [ ] T020 [P] [Base] Test de la entidad usuario: constantes de longitud, `rename` con recorte y vacío → `null` (RF-05) — `users/domain/tests/user.entity.test.ts`
  - Verifica: `dce pnpm test src/modules/users/domain/tests/user.entity` **falla**.
- [ ] T021 [P] [Base] Test de la entidad sesión: 15 min, 7 días, tope de 30 días con el ejemplo de RF-11 y margen de 30 s (RF-07, RF-11 a RF-13) — `users/domain/tests/session.entity.test.ts`
  - Verifica: `dce pnpm test src/modules/users/domain/tests/session.entity` **falla**.
- [ ] T022 [P] [Base] Test del bloqueo: ejemplo de RF-09 (10:00…10:10 → hasta 10:25), quinto fallo, ventana deslizante y vencimiento (RF-09, RF-10, D-10) — `users/domain/tests/login-throttle.value-object.test.ts`
  - Verifica: `dce pnpm test src/modules/users/domain/tests/login-throttle` **falla**.
- [ ] T023 [Base] Entidad `User` y constantes (RF-05) — `users/domain/user.entity.ts`
  - Verifica: `dce pnpm test src/modules/users/domain/tests/user.entity` pasa.
- [ ] T024 [P] [Base] Entidad `Session` con sus reglas de caducidad y margen (RF-07, RF-11 a RF-13) — `users/domain/session.entity.ts`
  - Verifica: `dce pnpm test src/modules/users/domain/tests/session.entity` pasa.
- [ ] T025 [P] [Base] `LoginThrottle` (RF-09, RF-10, D-10) — `users/domain/login-throttle.value-object.ts`
  - Verifica: `dce pnpm test src/modules/users/domain/tests/login-throttle` pasa.
- [ ] T026 [P] [Base] Puertos `UserRepository` y `CsrfTokenRepository` (plan §3) — `users/domain/user.repository.ts`, `users/domain/csrf-token.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T027 [P] [Base] Puertos `SessionRepository` y `LoginAttemptRepository` (plan §3) — `users/domain/session.repository.ts`, `users/domain/login-attempt.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T028 [P] [Base] Puertos `PasswordHasher`, `TokenService` y `GraceTokenCipher` (D-1, D-2, D-3) — `users/domain/password-hasher.port.ts`, `users/domain/token.port.ts`, `users/domain/grace-token-cipher.port.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T029 [P] [Base] Fakes en memoria de usuarios y tokens CSRF previos — `tests/support/in-memory-user.repository.ts`, `tests/support/in-memory-csrf-token.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T030 [P] [Base] Fakes en memoria de sesiones (con `refresh_tokens` y margen) y de intentos de login — `tests/support/in-memory-session.repository.ts`, `tests/support/in-memory-login-attempt.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T031 [P] [Base] `FakePasswordHasher` rápido para tests unitarios y HTTP (plan §10) — `tests/support/fake-password-hasher.adapter.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.

### Adaptadores criptográficos
- [ ] T032 [P] [Base] Test de Argon2id: cadena `$argon2id$v=19$m=19456,t=2,p=1$…`, verificación correcta e incorrecta, sales distintas, no ASCII, `verifyDummy` siempre `false` (RNF-03, D-2, D-3) — `users/infrastructure/tests/argon2-password-hasher.adapter.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/argon2` **falla**.
- [ ] T033 [P] [Base] Test de tokens: 43 caracteres base64url distintos, huella SHA-256 de 64 hex, `equals` en tiempo constante (RNF-06, D-1) — `users/infrastructure/tests/crypto-token.adapter.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/crypto-token` **falla**.
- [ ] T034 [P] [Base] Test del cifrado del margen: ida y vuelta, IV distinto, texto, etiqueta o clave alterados → error, el texto cifrado no contiene los tokens (RNF-06, D-1) — `users/infrastructure/tests/aes-gcm-grace-cipher.adapter.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/aes-gcm` **falla**.
- [ ] T035 [Base] `PasswordHasher` con Argon2id y hash ficticio calculado al arrancar (D-2, D-3) — `users/infrastructure/argon2-password-hasher.adapter.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/argon2` pasa.
- [ ] T036 [P] [Base] `TokenService` con `randomBytes`, SHA-256 y `timingSafeEqual` (D-1) — `users/infrastructure/crypto-token.adapter.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/crypto-token` pasa.
- [ ] T037 [P] [Base] `GraceTokenCipher` con AES-256-GCM y formato `v1.<iv>.<cifrado>.<etiqueta>` (D-1) — `users/infrastructure/aes-gcm-grace-cipher.adapter.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/aes-gcm` pasa.

### Repositorios Prisma de `users`
- [ ] T038 [P] [Base] Test de integración de usuarios: email único, borrado en cascada de tareas, avisos, comprobaciones, zona y sesiones, y ninguna tarea, aviso ni zona sin cuenta tras migrar (RF-03, RF-29, RF-33, D-9) — `users/infrastructure/tests/prisma-user.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/prisma-user` **falla**.
- [ ] T039 [P] [Base] Test de integración de sesiones: búsqueda por huellas, rotación atómica con dos renovaciones concurrentes, `deleteAllExcept`, limpieza, solo huellas y copia cifrada en la base de datos (RF-11, RF-13, RF-27, RNF-06, D-4) — `users/infrastructure/tests/prisma-session.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/prisma-session` **falla**.
- [ ] T040 [P] [Base] Tests de integración de intentos de login y tokens CSRF previos: guardar, leer, caducar y limpiar (RF-09, RF-22) — `users/infrastructure/tests/prisma-login-attempt.repository.int.test.ts`, `prisma-csrf-token.repository.int.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/prisma-login prisma-csrf` **falla**.
- [ ] T041 [Base] Repositorio de usuarios y mapper fila ↔ `User` ↔ recurso sin `passwordHash` (RF-03, RF-25, RNF-04) — `users/infrastructure/prisma-user.repository.ts`, `users/infrastructure/user.mapper.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/prisma-user` pasa.
- [ ] T042 [Base] Repositorio de sesiones con rotación en transacción y `SELECT … FOR UPDATE` (RF-11, RF-13, D-4) — `users/infrastructure/prisma-session.repository.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/prisma-session` pasa.
- [ ] T043 [P] [Base] Repositorios de intentos de login y tokens CSRF previos (RF-09, RF-22) — `users/infrastructure/prisma-login-attempt.repository.ts`, `users/infrastructure/prisma-csrf-token.repository.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/prisma-login prisma-csrf` pasa.

### Checkpoint Base
- `dce pnpm test` y `dce pnpm test:perf` pasan.
- `dce pnpm exec prisma migrate status` → base de datos al día.
- Principio V: `grep -rnE "from ['\"](express|@prisma/client|zod|argon2|node:crypto)" src/modules/users/domain src/modules/users/application` no devuelve resultados.

---

## Fase H1 — Registrarme (HU-01, P1)

### Tests (deben fallar)
- [ ] T044 [P] [H1] Test del schema de registro: email 254/255, formato, recorte y minúsculas; contraseña 11/12/128/129 sin recortar, con espacios y no ASCII; nombre 100/101, vacío → `null` (RF-02 a RF-05) — `users/infrastructure/tests/user.schema.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` **falla**.
- [ ] T045 [P] [H1] Test de emitir token CSRF previo: guarda solo la huella con caducidad de 30 min (RF-22, RNF-06) — `users/application/tests/issue-csrf-token.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/issue-csrf-token` **falla**.
- [ ] T046 [P] [H1] Test de registro: crea la cuenta sin sesión, guarda la huella y no la contraseña, email repetido con otras mayúsculas → `EMAIL_ALREADY_REGISTERED` (RF-01, RF-03, RF-06, RNF-03) — `users/application/tests/register-user.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/register-user` **falla**.
- [ ] T047 [H1] Test HTTP de `GET /auth/csrf` y `POST /auth/register`: `201` con `User` y sin cookies, `409`, `400` con `details`, sin `X-CSRF-Token` o con token caducado (31 min) o de otro tipo → `INVALID_CSRF_TOKEN`, token reutilizable dentro de los 30 min, ningún cuerpo con la contraseña, petición previa de CORS (RF-01 a RF-06, RF-22, RF-23, RF-36, RNF-04) — `users/infrastructure/tests/auth.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/auth.routes` **falla**.

### Implementación
- [ ] T048 [H1] Schema de registro (RF-02 a RF-05) — `users/infrastructure/user.schema.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` pasa.
- [ ] T049 [P] [H1] Caso de uso emitir token CSRF previo (RF-22) — `users/application/issue-csrf-token.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/issue-csrf-token` pasa.
- [ ] T050 [P] [H1] Caso de uso registro, con `P2002` traducido a `EMAIL_ALREADY_REGISTERED` (RF-01, RF-03, RF-06) — `users/application/register-user.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/register-user` pasa.
- [ ] T051 [H1] Middleware de CSRF previo a la sesión (RF-22, RF-23) — `users/infrastructure/presession-csrf.middleware.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T052 [H1] Controlador y rutas `GET /auth/csrf` y `POST /auth/register`, con sus peticiones previas de CORS (RF-01, RF-06, RF-22, RF-36) — `users/infrastructure/auth.controller.ts`, `users/infrastructure/auth.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T053 [H1] Cablear el módulo `users` (repositorios, adaptadores, router de `/auth`) en los dos contenedores (plan §3) — `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test src/modules/users` pasa entero.
- [ ] T054 [H1] Guía manual: QS-0 (variables nuevas, migración, función `api` con `curl -c/-b` y `X-CSRF-Token`, aviso de Safari, R-2) y QS-H1 — `sdd/002-user-accounts/quickstart.md`
  - Verifica: ejecutar QS-0 y QS-H1 a mano.

### Checkpoint H1
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-H1.1** `GET /auth/csrf` → `200` con `csrfToken`; **QS-H1.2** registrar `ana@example.com` → `201` con el usuario y sin `Set-Cookie`; **QS-H1.3** registrar `" Ana@Example.COM "` → `409 EMAIL_ALREADY_REGISTERED`; **QS-H1.4** contraseña de 11 caracteres → `400 VALIDATION_ERROR`; **QS-H1.5** registro sin `X-CSRF-Token` → `403 INVALID_CSRF_TOKEN`.

---

## Fase H2 — Iniciar y cerrar sesión (HU-02, P1)

`GET /me` (RF-25, de HU-05) se implementa en esta fase porque es la ruta protegida más sencilla y la que usa la prueba independiente de HU-02.

### Tests (deben fallar)
- [ ] T055 [P] [H2] Test del schema de login (RF-02, RF-04) — `users/infrastructure/tests/user.schema.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` **falla**.
- [ ] T056 [P] [H2] Test de login: sesión con caducidades y token CSRF de sesión; email inexistente y contraseña errónea con el mismo error y `verifyDummy`; quinto fallo `INVALID_CREDENTIALS` y sexto `TOO_MANY_ATTEMPTS` aunque sea correcta; login correcto pone el contador a cero; varias sesiones (RF-07 a RF-10, RF-16, RF-24) — `users/application/tests/login.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/login` **falla**.
- [ ] T057 [P] [H2] Test de autenticar la sesión: sin token, desconocido, de generación anterior, de sesión cerrada; caducado → `TOKEN_EXPIRED`; válido → `SessionContext` (RF-17 a RF-20, D-14) — `users/application/tests/authenticate-session.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/authenticate-session` **falla**.
- [ ] T058 [P] [H2] Test del CSRF de sesión: coincide y no coincide (RF-23) — `users/application/tests/verify-session-csrf.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/verify-session-csrf` **falla**.
- [ ] T059 [P] [H2] Test de logout: por token de acceso y, si caducó, por refresh; no toca otras sesiones (RF-15, RF-16) — `users/application/tests/logout.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/logout` **falla**.
- [ ] T060 [P] [H2] Test de consultar el perfil sin contraseña (RF-25) — `users/application/tests/get-profile.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/get-profile` **falla**.
- [ ] T061 [H2] Test HTTP de login y logout: cookies con sus atributos, `{ user, csrfToken }`, `401`/`429`, logout con acceso caducado y refresh válido, logout dos veces, `X-CSRF-Token` sin sesión → error de sesión y con sesión ajena → `INVALID_CSRF_TOKEN` (decisión 19), ningún cuerpo con tokens de sesión (RF-07 a RF-10, RF-15, RF-23, RF-24, RNF-04, RNF-05) — `users/infrastructure/tests/auth.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/auth.routes` **falla**.
- [ ] T062 [H2] Test HTTP de `GET /me`: con sesión → `User`; sin cookie, con token inventado y caducado → `MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`; sin `X-Client-Time` → `200` (RF-17 a RF-20, RF-25, RF-30) — `users/infrastructure/tests/me.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/me.routes` **falla**.

### Implementación
- [ ] T063 [H2] Schema de login (RF-02, RF-04) — `users/infrastructure/user.schema.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` pasa.
- [ ] T064 [H2] Caso de uso login (RF-07 a RF-10, RF-16, RF-24) — `users/application/login.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/login` pasa.
- [ ] T065 [P] [H2] Casos de uso autenticar la sesión y verificar el CSRF de sesión (RF-17 a RF-20, RF-23) — `users/application/authenticate-session.use-case.ts`, `users/application/verify-session-csrf.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/authenticate-session verify-session-csrf` pasa.
- [ ] T066 [P] [H2] Casos de uso logout y consultar el perfil (RF-15, RF-25) — `users/application/logout.use-case.ts`, `users/application/get-profile.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/logout get-profile` pasa.
- [ ] T067 [H2] Middleware de sesión con CSRF en el orden de RF-34 y la decisión 19, y variante de logout que resuelve por el refresh token (RF-17 a RF-20, RF-23, D-6) — `users/infrastructure/session.middleware.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T068 [H2] Controlador y rutas `POST /auth/login` y `POST /auth/logout` con sus peticiones previas (RF-07, RF-15, RF-36) — `users/infrastructure/auth.controller.ts`, `users/infrastructure/auth.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T069 [H2] Controlador y ruta `GET /me` con su petición previa (RF-25, RF-36) — `users/infrastructure/me.controller.ts`, `users/infrastructure/me.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T070 [H2] Cablear el middleware de sesión y el router de `/me`, y helper `signIn(server, email?)` que devuelve `Cookie` y `X-CSRF-Token` — `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test src/modules/users` pasa entero.
- [ ] T071 [H2] Guía manual, sección QS-H2 — `sdd/002-user-accounts/quickstart.md`
  - Verifica: ejecutar QS-H2 a mano.

### Checkpoint H2
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-H2.1** login → `200` con `Set-Cookie: access_token` y `refresh_token` (`HttpOnly; Secure; SameSite=Strict`) y `csrfToken`; **QS-H2.2** `GET /me` con las cookies → `200` con el usuario; **QS-H2.3** contraseña errónea → `401 INVALID_CREDENTIALS`, igual que con un email inexistente; **QS-H2.4** cinco fallos y después la contraseña correcta → `429 TOO_MANY_ATTEMPTS`; **QS-H2.5** logout → `200` y `GET /me` → `401`.

---

## Fase H3 — Mantener la sesión abierta mientras la uso (HU-03, P1)

### Tests (deben fallar)
- [ ] T072 [P] [H3] Test de renovar: rotación con nuevas caducidades; 7 días sin renovar y tope de 30 días → `SESSION_EXPIRED`; rotado a los 10 s → mismos tokens desde la copia cifrada; a los 31 s y de dos generaciones atrás → sesión cerrada e `INVALID_REFRESH_TOKEN`; token inexistente; otras sesiones intactas; CSRF de sesión sin cambios (RF-11 a RF-14, RF-24, CE-04) — `users/application/tests/refresh-session.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/refresh-session` **falla**.
- [ ] T073 [P] [H3] Test de limpieza: borra solo lo caducado, incluidas las copias cifradas de más de 30 s (D-12, R-13) — `users/application/tests/purge-expired-auth-data.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/purge-expired` **falla**.
- [ ] T074 [P] [H3] Test del planificador de limpieza: pasada al arrancar, cada minuto, sin solapamiento, errores registrados (D-12) — `users/infrastructure/tests/auth-cleanup.scheduler.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/auth-cleanup` **falla**.
- [ ] T075 [H3] Test HTTP de `POST /auth/refresh`: acceso caducado → `TOKEN_EXPIRED` → refresh → `200` y la petición funciona; dos renovaciones con 5 s de diferencia; reutilización a los 31 s cierra la sesión; cookies borradas en `INVALID_REFRESH_TOKEN` y `SESSION_EXPIRED`; sin `X-CSRF-Token` → `INVALID_CSRF_TOKEN` (RF-11 a RF-14, RF-20, RF-23) — `users/infrastructure/tests/auth.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/auth.routes` **falla**.

### Implementación
- [ ] T076 [H3] Caso de uso renovar (RF-11 a RF-14, RF-24) — `users/application/refresh-session.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/refresh-session` pasa.
- [ ] T077 [H3] Variante del middleware de sesión para `/auth/refresh`: resuelve por el refresh token y aplica la decisión 19 (RF-14, RF-23, D-6) — `users/infrastructure/session.middleware.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T078 [H3] Controlador y ruta `POST /auth/refresh` con su petición previa (RF-11, RF-36) — `users/infrastructure/auth.controller.ts`, `users/infrastructure/auth.routes.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/auth.routes` pasa.
- [ ] T079 [P] [H3] Caso de uso limpieza y planificador cada minuto (D-12) — `users/application/purge-expired-auth-data.use-case.ts`, `users/infrastructure/auth-cleanup.scheduler.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/purge-expired src/modules/users/infrastructure/tests/auth-cleanup` pasa.
- [ ] T080 [H3] Cablear el planificador de limpieza y arrancarlo y pararlo con el servidor (incluida la recarga en caliente) (D-12) — `src/dependency.container.ts`, `src/server.main.ts`
  - Verifica: `docker compose -f docker-compose.dev.yml restart api` y `docker compose -f docker-compose.dev.yml logs --since 1m api` muestra la pasada inicial de limpieza sin errores.
- [ ] T081 [H3] Guía manual, sección QS-H3 — `sdd/002-user-accounts/quickstart.md`
  - Verifica: ejecutar QS-H3 a mano.

### Checkpoint H3
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-H3.1** `POST /auth/refresh` → `200` con cookies nuevas y el mismo `csrfToken` sigue valiendo; **QS-H3.2** el refresh token anterior antes de 30 s → los mismos tokens; **QS-H3.3** el anterior después de 30 s → `401 INVALID_REFRESH_TOKEN` y `GET /me` → `401 INVALID_TOKEN`; **QS-H3.4** refresh sin cookie → `401 INVALID_REFRESH_TOKEN`.

---

## Fase H4 — Usar mis tareas, racha y avisos con mi sesión (HU-04, P1)

### Tests (deben fallar)
- [ ] T082 [H4] Test del contexto de petición reescrito: sin `X-User-Id`; usa el `SessionContext`; hora y zona como en la 001; recuerda la zona solo con sesión y cabeceras válidas (RF-30 a RF-32) — `src/shared/infrastructure/http/tests/request-context.middleware.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/request-context` **falla**.
- [ ] T083 [H4] Test HTTP de tareas reescrito con `signIn`: mismas comprobaciones de la 001 con cookie y CSRF; `X-User-Id` de otro usuario sin efecto; `X-User-Id` sin cookie → `MISSING_TOKEN`; `POST` sin CSRF → `INVALID_CSRF_TOKEN`; aislamiento entre dos cuentas (RF-17, RF-18, RF-21, RF-23, RF-30, RF-32, CE-02, CE-03) — `src/modules/tasks/infrastructure/tests/task.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/tasks/infrastructure/tests/task.routes` **falla**.
- [ ] T084 [P] [H4] Tests HTTP de racha y avisos reescritos con `signIn`; la zona se recuerda en `/alerts` con sesión válida aunque la petición falle (RF-21, RF-30, RF-31) — `src/modules/streaks/infrastructure/tests/streak.routes.test.ts`, `src/modules/alerts/infrastructure/tests/alert.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/streaks src/modules/alerts` **falla**.
- [ ] T085 [P] [H4] Test del cableado de producción: rutas de `/auth` y `/me` montadas; rutas protegidas sin cookie → `MISSING_TOKEN` (RF-18) — `src/tests/dependency.container.test.ts`
  - Verifica: `dce pnpm test src/tests/dependency.container` **falla**.
- [ ] T086 [P] [H4] Test de errores: `MISSING_USER` ya no existe y la precedencia sigue el orden de RF-34 (RF-32, RF-34) — `src/shared/infrastructure/http/tests/error-handler.middleware.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/error-handler` **falla**.

### Implementación
- [ ] T087 [H4] Contexto de petición sin `X-User-Id`: toma el usuario del `SessionContext`, valida hora y zona y recuerda la zona (RF-30 a RF-32) — `src/shared/infrastructure/http/request-context.middleware.ts`, `src/shared/infrastructure/http/request-header.schema.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/request-context` pasa.
- [ ] T088 [H4] Eliminar `MISSING_USER` y renumerar la precedencia según RF-34 (RF-32, RF-34) — `src/shared/domain/error-code.constant.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/http/tests/error-handler` pasa.
- [ ] T089 [H4] Rutas de tareas con sesión (CSRF en `POST`/`PATCH`/`DELETE`) → contexto → JSON, y sus peticiones previas (RF-17, RF-23, RF-30, RF-36, D-8) — `src/modules/tasks/infrastructure/task.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T090 [P] [H4] Rutas de racha y avisos con sesión → contexto, y sus peticiones previas (RF-17, RF-30, RF-36, D-8) — `src/modules/streaks/infrastructure/streak.routes.ts`, `src/modules/alerts/infrastructure/alert.routes.ts`
  - Verifica: `dce pnpm exec tsc --noEmit`.
- [ ] T091 [H4] Inyectar el middleware de sesión en los routers de `tasks`, `streaks` y `alerts` en los dos contenedores (RF-17, RF-21) — `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test` pasa entero.
- [ ] T092 [H4] Test de rendimiento con sesión: inicia sesión una vez y envía cookie y `X-CSRF-Token` en lugar de `X-User-Id` (RF-17) — `tests/performance/api.perf.test.ts`
  - Verifica: `dce pnpm test:perf` pasa.
- [ ] T093 [H4] Guía de la 001: la función `api` inicia sesión y usa cookies y `X-CSRF-Token`; desaparecen `X-User-Id` y `MISSING_USER` (RF-32) — `sdd/001-taskApiSDD-mvp/quickstart.md`
  - Verifica: ejecutar QS-H1 de la 001 a mano con la nueva función `api`.
- [ ] T094 [H4] Guía manual, sección QS-H4 — `sdd/002-user-accounts/quickstart.md`
  - Verifica: ejecutar QS-H4 a mano.

### Checkpoint H4
- `dce pnpm test` y `dce pnpm test:perf` pasan.
- RF-32: `grep -rni "x-user-id\|MISSING_USER" src tests` no devuelve resultados salvo los tests que comprueban que la cabecera no tiene efecto.
- quickstart.md → **QS-H4.1** con la sesión de Ana, crear y listar tareas → `201` y `200`; **QS-H4.2** `POST /tasks` sin `X-CSRF-Token` → `403 INVALID_CSRF_TOKEN`; **QS-H4.3** `GET /tasks` sin cookie y con `X-User-Id` de Ana → `401 MISSING_TOKEN`; **QS-H4.4** con la sesión de Bea, las tareas de Ana no aparecen y `GET /tasks/{id}` de Ana → `404 TASK_NOT_FOUND`; **QS-H4.5** `GET /tasks` sin `X-Client-Time` → `400 INVALID_CLIENT_TIME`.

---

## Fase H5 — Ver y editar mi perfil (HU-05, P2)

### Tests (deben fallar)
- [ ] T095 [P] [H5] Test del schema de `PATCH /me`: `name` 100/101, recorte, `null` y vacío; `email` u otro campo → error (RF-05, RF-26) — `users/infrastructure/tests/user.schema.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` **falla**.
- [ ] T096 [P] [H5] Test de editar el perfil (RF-05, RF-26) — `users/application/tests/update-profile.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/update-profile` **falla**.
- [ ] T097 [H5] Test HTTP de `PATCH /me`: `200` con el nombre recortado, `"   "` → `null`, `email` → `VALIDATION_ERROR`, sin CSRF → `INVALID_CSRF_TOKEN` (RF-05, RF-23, RF-26) — `users/infrastructure/tests/me.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/me.routes` **falla**.

### Implementación
- [ ] T098 [H5] Schema de `PATCH /me`, `strict` (RF-05, RF-26) — `users/infrastructure/user.schema.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` pasa.
- [ ] T099 [H5] Caso de uso editar el perfil (RF-26) — `users/application/update-profile.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/update-profile` pasa.
- [ ] T100 [H5] Controlador y ruta `PATCH /me` (RF-26) — `users/infrastructure/me.controller.ts`, `users/infrastructure/me.routes.ts`
  - Verifica: `dce pnpm test src/modules/users` pasa entero.
- [ ] T101 [H5] Guía manual, sección QS-H5 — `sdd/002-user-accounts/quickstart.md`
  - Verifica: ejecutar QS-H5 a mano.

### Checkpoint H5
- `dce pnpm test` pasa entero.
- quickstart.md → **QS-H5.1** `PATCH /me` con `"  Ana  "` → `200` con `name: "Ana"`; **QS-H5.2** `GET /me` devuelve "Ana"; **QS-H5.3** `PATCH /me` con `email` → `400 VALIDATION_ERROR`.

---

## Fase H6 — Cambiar mi contraseña (HU-06, P2)

### Tests (deben fallar)
- [ ] T102 [P] [H6] Test del schema de `PATCH /me/password` (RF-04) — `users/infrastructure/tests/user.schema.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` **falla**.
- [ ] T103 [P] [H6] Test de cambiar la contraseña: cambia la huella, cierra las demás sesiones y mantiene la actual; actual errónea → `WRONG_PASSWORD` y cuenta para el bloqueo; bloqueada → `TOO_MANY_ATTEMPTS`; la nueva puede coincidir con la anterior (RF-09, RF-27, RF-28) — `users/application/tests/change-password.use-case.test.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/change-password` **falla**.
- [ ] T104 [H6] Test HTTP de `PATCH /me/password`: `200`; la otra sesión responde `INVALID_TOKEN` y su refresh `INVALID_REFRESH_TOKEN`; login con la anterior falla y con la nueva funciona; 3 logins fallidos + 2 contraseñas actuales erróneas → bloqueo; la sesión abierta sigue funcionando en `/tasks` con la cuenta bloqueada (RF-09, RF-19, RF-27, RF-28) — `users/infrastructure/tests/me.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/me.routes` **falla**.

### Implementación
- [ ] T105 [H6] Schema de `PATCH /me/password` (RF-04) — `users/infrastructure/user.schema.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` pasa.
- [ ] T106 [H6] Caso de uso cambiar la contraseña (RF-09, RF-27, RF-28) — `users/application/change-password.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/change-password` pasa.
- [ ] T107 [H6] Controlador y ruta `PATCH /me/password` (RF-27) — `users/infrastructure/me.controller.ts`, `users/infrastructure/me.routes.ts`
  - Verifica: `dce pnpm test src/modules/users` pasa entero.
- [ ] T108 [H6] Guía manual, sección QS-H6 — `sdd/002-user-accounts/quickstart.md`
  - Verifica: ejecutar QS-H6 a mano.

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
- [ ] T111 [H7] Test HTTP de `DELETE /me`: `200` con cookies borradas; login con ese email → `INVALID_CREDENTIALS`; volver a registrarse con el mismo email → `201` sin datos (RF-28, RF-29) — `users/infrastructure/tests/me.routes.test.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/me.routes` **falla**.

### Implementación
- [ ] T112 [H7] Schema de `DELETE /me` (RF-28) — `users/infrastructure/user.schema.ts`
  - Verifica: `dce pnpm test src/modules/users/infrastructure/tests/user.schema` pasa.
- [ ] T113 [H7] Caso de uso borrar la cuenta (RF-09, RF-28, RF-29) — `users/application/delete-account.use-case.ts`
  - Verifica: `dce pnpm test src/modules/users/application/tests/delete-account` pasa.
- [ ] T114 [H7] Controlador y ruta `DELETE /me` (RF-29) — `users/infrastructure/me.controller.ts`, `users/infrastructure/me.routes.ts`
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
- [ ] T119 [P] [Rob] Colección de Postman con `GET /auth/csrf`, registro y login (cookies de Postman y `csrfToken` en una variable), flujo H1–H6 de la 001 con sesión y errores de sesión y CSRF (RF-17, RF-22, RF-23) — `sdd/001-taskApiSDD-mvp/mvp-p1.postman-collection.json`
  - Verifica: `docker run --rm -e TZ=Europe/Madrid -v "$PWD/sdd/001-taskApiSDD-mvp":/etc/newman postman/newman:6-alpine run mvp-p1.postman-collection.json --env-var baseUrl=http://host.docker.internal:3000` sin fallos.
- [ ] T120 [Rob] AGENTS.md: variables `SESSION_ENCRYPTION_KEY` y `CORS_ORIGIN`, módulo `users` y aviso de Safari en desarrollo (R-2) — `AGENTS.md`
  - Verifica: `grep -c "SESSION_ENCRYPTION_KEY\|CORS_ORIGIN" AGENTS.md` ≥ 2.
- [ ] T121 [Rob] Guía manual, sección QS-R: producción con cookies y CORS (petición previa desde `https://kompitu.yandrydev.cloud` y desde otro origen) y rendimiento — `sdd/002-user-accounts/quickstart.md`
  - Verifica: ejecutar QS-R a mano.

### Checkpoint Robustez
- `dce pnpm test`, `dce pnpm test:coverage` y `dce pnpm test:perf` pasan; `./scripts/sonar-scan.sh` → quality gate en verde.
- Principio V: `grep -rnE "from ['\"](express|@prisma/client|zod|argon2)" src/modules/*/domain src/modules/*/application src/shared/domain src/shared/application` no devuelve resultados.
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
| RF-36 | T017, T018, T019, T047, T052, T068, T069, T078, T089, T090 |
| RNF-01 | T118 |
| RNF-02 | T012, T013 |
| RNF-03 | T032, T035, T046 |
| RNF-04 | T041, T047, T061 |
| RNF-05 | T014, T015, T061 |
| RNF-06 | T033, T034, T036, T037, T039, T045 |

Los 36 RF y RNF-02 a RNF-06 tienen al menos una tarea de test y una de implementación. RNF-01 (rendimiento) solo tiene tarea de test (T118): lo cumplen las decisiones del plan (D-2, índices de la sección 4), como RNF-01 en la 001. Los criterios de éxito se comprueban en: CE-01 (T047, T061, T083: 4 peticiones hasta la primera tarea), CE-02 (T083, T085), CE-03 (T083, T097), CE-04 (T072, T075) y CE-05 (T039, T047, T061).
