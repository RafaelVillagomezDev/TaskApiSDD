# Tasks: Protección frente a bots con Cloudflare Turnstile en el login y el registro
Spec: `sdd/005-turnstile-bot-protection/spec.md` (Aprobada) · Plan: `sdd/005-turnstile-bot-protection/plan.md` (Aprobado) · Fecha: 2026-11-15

## Cómo leer este fichero

- **Formato:** `- [ ] T### [P] [Fase] Descripción (RF-xx) — archivo(s)`, con una línea **Verifica** con el comando que da la tarea por terminada.
- **[P]:** se puede hacer en paralelo con las demás tareas [P] de su bloque (archivos distintos y sin dependencias pendientes).
- **Fases:**
  - `[Base]`: la fase común (configuración, errores, esquema, dominio, adaptadores y el caso de uso de verificación).
  - `[H1]`, `[H2]` y `[H3]`: las historias HU-01 (login), HU-02 (registro) y HU-03 (despliegue sin cortar el acceso), todas P1.
  - `[Rob]`: la fase de robustez y documentación.
- **Dentro de cada bloque con tests:** primero los tests, que **deben fallar** (rojo); después la implementación, que los hace pasar (verde).
- **Comandos:** todo se ejecuta en Docker (AGENTS.md). Abreviatura: `dce` = `docker compose -f docker-compose.dev.yml exec api`.
- **Requisitos previos:**
  - Contenedores de desarrollo levantados (`docker compose -f docker-compose.dev.yml up -d`).
  - SonarQube levantado, para poder hacer push (CONSTITUTION.md, principio III).
  - **Antes de T002**, `.env.dev` con `TURNSTILE_SECRET=1x0000000000000000000000000000000AA`, `TURNSTILE_ALLOWED_HOSTNAMES=example.com,localhost` y `TURNSTILE_ENFORCE=true`; después hay que reiniciar `api`. Sin ellas, la API no arranca y `dependency.container.test.ts` falla (R-1). Las añade el usuario: los `.env.*` no se leen ni se escriben desde Claude Code.
- **Referencias:**
  - Los RF, RNF y CE son los de la spec 005, y las decisiones D-xx y los riesgos R-xx, los del plan 005. Cuando se cita la 002 se indica.
  - Las rutas `src/...` y `tests/...` son relativas a la raíz del repositorio; `users/` abrevia `src/modules/users/`.
- **Nunca** se escribe la clave secreta real en un fichero versionado, un test o un comentario (RNF-02). En los tests se usa la clave de prueba o un texto inventado.

---

## Fase 0 — Base

### Configuración (RF-18, RF-19, D-7)
- [x] T001 [P] [Base] Tests de la configuración:
  - Faltan o están vacías `TURNSTILE_SECRET`, `TURNSTILE_ALLOWED_HOSTNAMES` o `TURNSTILE_ENFORCE` → error que nombra la variable sin mostrar su valor.
  - La lista se recorta, se pasa a minúsculas y descarta los elementos vacíos; una lista solo con comas → error.
  - `TURNSTILE_ENFORCE` distinta de `true`/`false` → error.
  - `usesTestSecret` vale `true` con cada una de las tres claves de prueba y `false` con otra.
  - Con `NODE_ENV=production`: `localhost`, `127.0.0.1`, `::1` o `[::1]` en la lista → error; una clave de prueba → error.
  - Fuera de producción, se aceptan los dos casos anteriores.

  (RF-18, RF-19, RNF-02, RNF-05) — `src/shared/infrastructure/config/tests/app.config.test.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/config` **falla**.
  - Hecho (2026-11-15): 24 casos nuevos en un `describe` de Turnstile; en rojo antes de T002.
- [x] T002 [Base] `loadAppConfig` lee y valida las tres variables y `NODE_ENV` (plan 5.4). `AppConfig.turnstile` lleva `{ secret, allowedHostnames, enforce, usesTestSecret }`, y las claves de prueba van en una constante con nombre (RF-18, RF-19, D-7) — `src/shared/infrastructure/config/app.config.ts`
  - Verifica: `dce pnpm test src/shared/infrastructure/config` pasa.
  - Hecho (2026-11-15): las claves de prueba se exportan como `TURNSTILE_TEST_SECRETS`; los problemas de producción se comprueban después del schema y nombran solo la variable. 36 tests en verde.
- [x] T003 [P] [Base] `.env.example` con las tres variables sin valor y su comentario (principio IV) — `.env.example`
  - Verifica: `grep -n TURNSTILE .env.example` muestra las tres sin valor.
  - Hecho (2026-11-15): sustituye un bloque añadido a mano con formato no válido (líneas con `- ` y un `#CLOUDFLARE_API_TOKEN` que la API no usa).

### Errores (RF-14, D-9)
- [x] T004 [P] [Base] `TURNSTILE_FAILED` (`403`) y `TURNSTILE_UNAVAILABLE` (`503`) en el orden 7, con los mensajes de la spec. Los errores de negocio pasan al 8 y `DAY_CLOSED`/`DAY_NOT_STARTED` al 9. El test del catálogo incluye el nivel nuevo y los dos códigos en el `it.each` de HTTP y mensaje (RF-14, D-9) — `src/shared/domain/error-code.constant.ts`, `src/shared/infrastructure/http/tests/error-handler.middleware.test.ts`
  - Verifica: `dce pnpm test error-handler` pasa.
  - Hecho (2026-11-15): los mensajes llevan punto final, como el resto del catálogo. Al implementarlo se corrigen en la spec los ejemplos de `403` y `503`, que ponían `message` fuera de `error` (principio VII); sin cambio de comportamiento. 34 tests en verde.

### Base de datos (RF-20 a RF-23)
- [x] T005 [Base] Modelo `TurnstileToken` (`token_hash CHAR(64)` PK y `expires_at TIMESTAMPTZ(3)` con índice), con su comentario (plan §4) — `prisma/schema.prisma`
  - Verifica: `dce pnpm exec prisma validate`.
- [x] T006 [Base] Migración generada con `prisma migrate diff`: tabla `turnstile_tokens` e índice, con su comentario (AGENTS.md §3, R-6) — `prisma/migrations/<AAAAMMDDHHMMSS>_turnstile_tokens/migration.sql`
  - Verifica: `dce pnpm prisma migrate deploy`, `dce pnpm prisma generate` y `dce pnpm exec prisma migrate status` → base de datos al día. Reiniciar `api` para que use el cliente nuevo (lección de T018 de la 003).
  - Hecho (2026-11-15): `20261115173912_turnstile_tokens`, con un comentario antepuesto al SQL generado. `turnstile_tokens` se añade a la lista de tablas de `tests/integration/test-database.helper.ts`.

### Dominio (D-2, D-10)
- [x] T007 [P] [Base] Test de `TurnstileVerdict`, con una tabla de casos para cada fila del plan 5.3 en su orden:
  - `unreachable`, 5xx e `internal-error` → `retry`.
  - 4xx, `bad-request`, `missing-input-secret` e `invalid-input-secret` → `unavailable`, aunque `success` sea `false`.
  - `success: false` con `invalid-input-response`, `timeout-or-duplicate`, sin códigos o con un código desconocido → `failed`.
  - Host fuera de la lista → `failed`; el host en mayúsculas se acepta si está en la lista.
  - Con la acción comprobada: acción distinta o ausente → `failed`. Sin comprobarla → `passed`.
  - Todo correcto → `passed`.

  (RF-05 a RF-08, RF-06b, RF-25, RF-26, RF-28, RF-29) — `users/domain/tests/turnstile-verdict.value-object.test.ts`
  - Verifica: `dce pnpm test users/domain/tests/turnstile-verdict` **falla**.
- [x] T008 [Base] Puertos `TurnstileVerifier` (con el tipo `SiteverifyOutcome`) y `TurnstileTokenRepository`; regla `TurnstileVerdict` con las constantes `TURNSTILE_TOKEN_TTL_MS`, `TURNSTILE_TOTAL_TIMEOUT_MS`, `TURNSTILE_FIRST_ATTEMPT_TIMEOUT_MS` y `TURNSTILE_TOKEN_MAX_LENGTH`; `TokenService.randomUuid()` en el puerto y en `CryptoTokenService` (D-2, D-8, D-10) — `users/domain/turnstile-verifier.port.ts`, `users/domain/turnstile-token.repository.ts`, `users/domain/turnstile-verdict.value-object.ts`, `users/domain/token.port.ts`, `users/infrastructure/crypto-token.adapter.ts`
  - Verifica: `dce pnpm test users/domain/tests/turnstile-verdict` pasa y `dce pnpm exec tsc --noEmit` termina sin errores. El test de `crypto-token.adapter` comprueba que `randomUuid()` devuelve UUID v4 distintos.
  - Hecho (2026-11-15): `TurnstileVerdict.evaluate` es estático; `SiteverifyOutcome` lleva `hostname` y `action` como `null` cuando Cloudflare no los envía. 32 tests en verde con el de `crypto-token.adapter`.

### Adaptadores
- [x] T009 [P] [Base] Test de integración del repositorio:
  - Primera reserva → `true`; segunda del mismo hash → `false`.
  - 20 reservas simultáneas del mismo hash → exactamente una `true`.
  - Una fila caducada se puede volver a reservar.
  - `deleteExpired` borra solo las caducadas.

  (RF-20 a RF-23, RF-31, CE-04, D-3) — `users/infrastructure/tests/prisma-turnstile-token.repository.int.test.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/prisma-turnstile-token` **falla**.
- [x] T010 [Base] `PrismaTurnstileTokenRepository`: `reserve` con `$executeRaw` en plantilla etiquetada (`INSERT … ON CONFLICT … DO UPDATE … WHERE expires_at <= now`; `true` si afecta a 1 fila) y `deleteExpired` con `deleteMany` (D-3) — `users/infrastructure/prisma-turnstile-token.repository.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/prisma-turnstile-token` pasa.
  - Hecho (2026-11-15): 5 tests de integración en verde, incluidas 20 reservas simultáneas con una sola válida.
- [x] T011 [P] [Base] Test del adaptador de Cloudflare, con `fetch` sustituido por un doble del test:
  - `POST` a la URL de siteverify, con un cuerpo `x-www-form-urlencoded` que lleva `secret`, `response` e `idempotency_key` y no lleva `remoteip`.
  - Se pasa una señal de cancelación con el tiempo recibido.
  - Respuesta válida → `answered`, con `hostname`, `action` y `errorCodes`.
  - 4xx/5xx → `http-error`.
  - JSON ilegible o que no cumple el schema → `unreachable`.
  - Excepción de `fetch` o tiempo agotado → `unreachable`.
  - Nunca lanza, y ningún `console.*` recibe la clave ni el token.

  (RF-24, RNF-02, RNF-03, D-4, D-5) — `users/infrastructure/tests/cloudflare-turnstile-verifier.adapter.test.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/cloudflare-turnstile` **falla**.
- [x] T012 [Base] `CloudflareTurnstileVerifier` con `fetch` nativo, `AbortSignal.timeout` y el schema Zod de la respuesta. La URL va en una constante con nombre y la clave en el constructor (D-4, D-5) — `users/infrastructure/cloudflare-turnstile-verifier.adapter.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/cloudflare-turnstile` pasa.
  - Hecho (2026-11-15): `fetch` se inyecta por el constructor (por defecto, el global) para sustituirlo en el test; la URL se exporta como `SITEVERIFY_URL`. El test usa `import.meta.jest`, como el resto del proyecto (ESM). 15 tests en verde.
- [x] T013 [P] [Base] Dobles de test: verificador simulado (cola de resultados; por defecto `success: true` con la acción pedida y host `example.com`; cuenta las llamadas y guarda los tokens, las claves de idempotencia y los tiempos recibidos) y repositorio en memoria con la semántica de D-3 — `tests/support/fake-turnstile-verifier.adapter.ts`, `tests/support/in-memory-turnstile-token.repository.ts`
  - Verifica: `dce pnpm exec tsc --noEmit` termina sin errores.
  - Hecho (2026-11-15): el simulado deduce la acción del prefijo del token (`login:…`, `register:…`; helper `turnstileTokenFor`) y un token sin prefijo no lleva acción, como con las claves de prueba. Tiene `respondWith`, `rejectNext` y `reset`.

### Caso de uso de verificación (RF-09, RF-09b, RF-20 a RF-26, RF-28 a RF-33)
- [x] T014 [Base] Test de `VerifyTurnstileUseCase`, con el verificador simulado, el repositorio en memoria y `FakeClock`:
  - Éxito.
  - Token repetido → `TURNSTILE_FAILED` sin consultar a Cloudflare.
  - La reserva se hace antes de consultar y no se libera tras un rechazo, un `503` ni un éxito.
  - Con clave de prueba, el mismo token dos veces → dos consultas, ninguna reserva y la acción sin comprobar.
  - Un reintento con la misma clave de idempotencia tras `unreachable`, `5xx` o `internal-error`; el veredicto del reintento es el definitivo, y un segundo `retry` → `TURNSTILE_UNAVAILABLE`.
  - Sin reintento con `invalid-input-secret`, `bad-request` o un rechazo del token.
  - 3 s de tiempo máximo en el primer intento y el tiempo restante hasta 5 s en el segundo; sin reintento si no queda tiempo.
  - Aviso `TURNSTILE_MISCONFIGURED` solo con los códigos de error, sin la clave, el token ni la clave de idempotencia.
  - Dos peticiones → claves de idempotencia distintas.

  (RF-09, RF-09b, RF-20 a RF-26, RF-28 a RF-30, RF-33, RNF-02, RNF-03, RNF-06, CE-04) — `users/application/tests/verify-turnstile.use-case.test.ts`
  - Verifica: `dce pnpm test users/application/tests/verify-turnstile` **falla**.
- [x] T015 [Base] `VerifyTurnstileUseCase.execute({ token, action })` según el plan 5.2. Si su complejidad cognitiva pasa de 15, se extraen funciones con nombre (AGENTS.md §8) — `users/application/verify-turnstile.use-case.ts`
  - Verifica: `dce pnpm test users/application/tests/verify-turnstile` pasa.
  - Hecho (2026-11-15): 26 tests en verde.

### Limpieza (RF-31, D-6)
- [x] T016 [Base] `PurgeExpiredAuthDataUseCase` recibe `TurnstileTokenRepository` y llama a `deleteExpired(now)`. Su test comprueba que borra las huellas caducadas y conserva las vigentes. Cableado en los dos contenedores (RF-31, D-6) — `users/application/purge-expired-auth-data.use-case.ts`, `users/application/tests/purge-expired-auth-data.use-case.test.ts`, `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test users/application/tests/purge-expired` pasa.
  - Hecho (2026-11-15): el contenedor de tests no construye la limpieza, así que solo cambia `dependency.container.ts`. Checkpoint Base: `dce pnpm test` → 90 suites y 1163 tests en verde; principio V sin resultados.

### Checkpoint Base
- `dce pnpm test` pasa entero: el comportamiento observable aún no cambia, porque nadie llama a la verificación.
- Principio V: `grep -rnE "from ['\"](express|@prisma/client|zod|argon2|node:crypto)" src/modules/users/domain src/modules/users/application` no devuelve resultados.

---

## Fase H1 — Iniciar sesión demostrando que soy una persona (HU-01, P1)

### Tests (deben fallar)
- [x] T017 [P] [H1] Test de los schemas: `turnstileToken` de 1 y de 2048 caracteres se acepta; vacío, de 2049 caracteres, numérico o `null` → error; ausente → error con `turnstileRequired: true`. Los campos desconocidos se siguen ignorando. Se adaptan los casos existentes a `createAuthBodySchemas` (RF-01, RF-02, RF-17) — `users/infrastructure/tests/user.schema.test.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/user.schema` **falla**.
  - Hecho (2026-11-15): los casos existentes usan los schemas del modo opcional, que aceptan los mismos cuerpos que la 002; los nuevos recorren los dos modos y las dos rutas. 63 tests en verde tras T020.
- [x] T018 [P] [H1] Test del login con token:
  - Token rechazado → `TURNSTILE_FAILED` sin leer el bloqueo, sin registrar un fallo, sin comprobar la contraseña y sin abrir sesión.
  - Mismo error con un email existente y con uno inexistente.
  - Tras 10 rechazos contra un email, el login correcto con token válido entra.
  - Token válido y email bloqueado → `TOO_MANY_ATTEMPTS`; token válido y contraseña incorrecta → `INVALID_CREDENTIALS`, que sí cuenta.
  - `TURNSTILE_UNAVAILABLE` tampoco cuenta.
  - Se verifica con la acción `login`.

  (RF-03, RF-10 a RF-13, CE-02) — `users/application/tests/login.use-case.test.ts`
  - Verifica: `dce pnpm test users/application/tests/login` **falla**.
  - Hecho (2026-11-15): 10 casos nuevos con el caso de uso real de verificación, el verificador simulado y el repositorio en memoria. 21 tests en verde tras T021.
- [x] T019 [H1] Tests HTTP de `POST /auth/login`:
  - Con token válido → `200` sin cambios en la respuesta.
  - `403 TURNSTILE_FAILED` y `503 TURNSTILE_UNAVAILABLE` con el sobre de error, y cuerpo idéntico entre motivos de rechazo.
  - Token repetido → `403`.
  - Token ausente en modo obligatorio, vacío o de 2049 caracteres → `400 VALIDATION_ERROR`, sin consultar a Cloudflare.
  - Precedencia por pares: sin `X-CSRF-Token` y con token rechazado → `INVALID_CSRF_TOKEN`; email mal formado y token rechazado → `VALIDATION_ERROR`; email bloqueado y token rechazado → `TURNSTILE_FAILED`.
  - Dos logins seguidos con tokens distintos → dos sesiones.

  `signIn` y el contenedor de tests envían un token distinto en cada petición, con opciones `turnstile: { enforce, testSecret }` (por defecto: obligatorio y clave real), y exponen el verificador simulado (R-7). (RF-01 a RF-03, RF-05 a RF-14, RF-21, RF-27, RF-32, CE-01) — `users/infrastructure/tests/auth.routes.test.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/auth.routes` **falla** solo en los casos nuevos.
  - Hecho (2026-11-15): `withTurnstileToken` (en `test.container.ts`) añade un token único si el cuerpo no trae el campo; lo usan los helpers de `auth.routes`, `me.routes` (login directo) y `task.routes` (CE-01 de la 002). `createTestContainer` acepta `{ turnstile: { enforce, testSecret } }` y expone `turnstileVerifier` y `turnstileTokens`. Incluye ya el caso de RF-33 con clave de prueba.

### Implementación
- [x] T020 [H1] `createAuthBodySchemas({ turnstileRequired })` con `turnstileToken` (`z.string().min(1).max(TURNSTILE_TOKEN_MAX_LENGTH)`, obligatorio u opcional) y sin pasar a `strictObject` (RF-01, RF-02, RF-17, D-11) — `users/infrastructure/user.schema.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/user.schema` pasa.
- [x] T021 [H1] `LoginInput.turnstileToken?`; si llega, `verifyTurnstile.execute({ token, action: 'login' })` es lo primero que hace `LoginUseCase` (RF-03, RF-10 a RF-13, D-1) — `users/application/login.use-case.ts`
  - Verifica: `dce pnpm test users/application/tests/login` pasa.
- [x] T022 [H1] `AuthController` recibe los schemas en el constructor y pasa `turnstileToken` al login. Cableado en los dos contenedores: `CloudflareTurnstileVerifier(config.turnstile.secret)`, `PrismaTurnstileTokenRepository`, `VerifyTurnstileUseCase` con los hosts y `checkReplayAndAction = !usesTestSecret`, y schemas con `turnstileRequired = config.turnstile.enforce` (RF-15 a RF-17, RF-33, D-11) — `users/infrastructure/auth.controller.ts`, `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/auth.routes` y `dce pnpm test src/tests/dependency.container` pasan.
  - Hecho (2026-11-15): `AuthController` recibe `AuthBodySchemas` como último parámetro; el registro ya valida `turnstileToken` con el schema, pero aún no lo verifica (T025). Checkpoint H1: `dce pnpm test` → 90 suites y 1207 tests en verde. QS-01 y QS-04 ejecutados a mano contra la API de desarrollo con la clave `1x…AA` y Cloudflare real: dos logins con el token ficticio → `200` y `200`; sin token → `400 VALIDATION_ERROR` en `turnstileToken`. QS-02 y QS-03 quedan para la guía (T031): necesitan cambiar la clave en `.env.dev`.

### Checkpoint H1
- `dce pnpm test` pasa entero.
- quickstart.md:
  - **QS-01:** con `TURNSTILE_SECRET=1x…AA`, login con `XXXX.DUMMY.TOKEN.XXXX` → `200`, y repetirlo → `200` (RF-33).
  - **QS-02:** con `2x…AA` → `403 TURNSTILE_FAILED`, y el login correcto posterior con `1x…AA` entra (RF-12).
  - **QS-03:** con `3x…AA` → `403 TURNSTILE_FAILED` (RF-08).
  - **QS-04:** sin `turnstileToken` y `TURNSTILE_ENFORCE=true` → `400 VALIDATION_ERROR` (RF-17).

---

## Fase H2 — Registrarme demostrando que soy una persona (HU-02, P1)

### Tests (deben fallar)
- [ ] T023 [P] [H2] Test del registro con token: token rechazado y email ya registrado → `TURNSTILE_FAILED`, sin buscar el email ni crear la cuenta; con token válido, crea la cuenta; se verifica con la acción `register` (RF-04, RF-10, RF-13, CE-01) — `users/application/tests/register-user.use-case.test.ts`
  - Verifica: `dce pnpm test users/application/tests/register-user` **falla**.
- [ ] T024 [H2] Tests HTTP de `POST /auth/register`:
  - Con token válido → `201` sin cambios en la respuesta.
  - Token rechazado y email existente → `403 TURNSTILE_FAILED`.
  - Token ya usado en un login → `403` sin consultar a Cloudflare.
  - Dos registros simultáneos con el mismo token → una sola consulta a Cloudflare.
  - Precedencia por pares con `VALIDATION_ERROR` y `EMAIL_ALREADY_REGISTERED`.
  - Campo desconocido → se ignora y el token se verifica.
  - Con token válido y email existente → `409 EMAIL_ALREADY_REGISTERED`, y reintentar con un token nuevo → `409` (RF-27).

  (RF-01, RF-02, RF-04 a RF-11, RF-13, RF-14, RF-20, RF-21, RF-27, RF-32, CE-04) — `users/infrastructure/tests/auth.routes.test.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/auth.routes` **falla** solo en los casos nuevos.

### Implementación
- [ ] T025 [H2] `RegisterUserInput.turnstileToken?`; si llega, `RegisterUserUseCase` verifica con la acción `register` antes de `findByEmail`. `AuthController.register` pasa el token; cableado en los dos contenedores (RF-04, RF-10, RF-13, D-1) — `users/application/register-user.use-case.ts`, `users/infrastructure/auth.controller.ts`, `src/dependency.container.ts`, `tests/support/test.container.ts`
  - Verifica: `dce pnpm test users/application/tests/register-user` y `dce pnpm test users/infrastructure/tests/auth.routes` pasan.

### Checkpoint H2
- `dce pnpm test` pasa entero.
- quickstart.md:
  - **QS-05:** registro con el token ficticio y `1x…AA` → `201`; con `2x…AA` y un email ya registrado → `403 TURNSTILE_FAILED`, no `409` (RF-13).

---

## Fase H3 — Desplegar sin cortar el acceso (HU-03, P1)

### Tests (deben fallar)
- [ ] T026 [H3] Tests HTTP del modo opcional (contenedor con `enforce: false`):
  - Login y registro sin `turnstileToken` → como en la 002 (`200` y `201`), sin consultar a Cloudflare.
  - Con token rechazado → `403 TURNSTILE_FAILED`, sin procesarse como si no hubiera token.
  - Con token válido → `200`.
  - Sin token y con la contraseña incorrecta → `INVALID_CREDENTIALS`, que sí cuenta para el bloqueo.

  (RF-15, RF-16, CE-03) — `users/infrastructure/tests/auth.routes.test.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/auth.routes` **falla** solo en los casos nuevos, o pasa directamente si T020 a T025 ya cubren el modo opcional. En ese caso se anota aquí.

### Implementación
- [ ] T027 [H3] Ajustes que pidan los tests de T026 en los schemas o los casos de uso (RF-15, RF-16) — `users/infrastructure/user.schema.ts`, `users/application/login.use-case.ts`, `users/application/register-user.use-case.ts`
  - Verifica: `dce pnpm test users/infrastructure/tests/auth.routes` pasa.

### Checkpoint H3
- `dce pnpm test` pasa entero.
- quickstart.md:
  - **QS-06:** con `TURNSTILE_ENFORCE=false` y `api` reiniciado, login sin token → `200`, y con el token ficticio y `2x…AA` → `403`.
  - **QS-07:** API sin `TURNSTILE_ENFORCE` → no arranca y el log nombra la variable (RF-18, D-7).

---

## Fase R — Robustez y documentación

- [ ] T028 [P] [Rob] Rendimiento: login y registro medidos con un token distinto por petición y el verificador simulado, p95 < 300 ms (RNF-01) — `tests/performance/api.perf.test.ts`
  - Verifica: `dce pnpm test:perf` pasa.
- [ ] T029 [P] [Rob] Colecciones de Postman de la 001, la 002 y la 004: login y registro envían `"turnstileToken": "XXXX.DUMMY.TOKEN.XXXX"` (S-01, RF-33, R-7) — `sdd/001-taskApiSDD-mvp/mvp-p1.postman-collection.json`, `sdd/002-user-accounts/user-accounts.postman-collection.json`, `sdd/004-pomodoro-sessions/pomodoro-sessions.postman-collection.json`
  - Verifica: con `TURNSTILE_SECRET=1x…AA` y `TURNSTILE_ENFORCE=true`, Newman sobre las tres colecciones (comandos del README) sin fallos.
- [ ] T030 [P] [Rob] Colección de Postman de la 005: flujo (registro y login con el token ficticio, y repetirlos) y errores (`turnstileToken` vacío, de 2049 caracteres, numérico y ausente → `VALIDATION_ERROR`, y precedencia de CSRF) (RF-01, RF-02, RF-17, RF-33) — `sdd/005-turnstile-bot-protection/turnstile-bot-protection.postman-collection.json`
  - Verifica: `docker run --rm -v "$PWD/sdd/005-turnstile-bot-protection":/etc/newman postman/newman:6-alpine run turnstile-bot-protection.postman-collection.json --env-var baseUrl=http://host.docker.internal:3000` sin fallos.
- [ ] T031 [P] [Rob] Guía manual con QS-01 a QS-07 y QS-R. Explica cómo cambiar de clave de prueba (editar `.env.dev` y reiniciar `api`) y cómo simular Cloudflare inaccesible (QS-08: una clave de prueba con la red del contenedor cortada → `503`, si es viable; si no, se anota que lo cubren los tests) — `sdd/005-turnstile-bot-protection/quickstart.md`
  - Verifica: ejecutar QS-01 a QS-07 a mano.
- [ ] T032 [Rob] AGENTS.md §3, *Configuración inicial*: las tres variables nuevas, sus valores de desarrollo y producción, que la API no arranca sin ellas, que la clave real va solo en `.env.prod` y el orden de despliegue de S-06 (R-1, R-2) — `AGENTS.md`
  - Verifica: `grep -n "TURNSTILE" AGENTS.md` muestra las tres variables y el orden de despliegue.
- [ ] T033 [Rob] README:
  - Estado de la 005.
  - Cuerpo de `POST /auth/login` y `POST /auth/register` con `turnstileToken`.
  - Códigos de error nuevos y precedencia actualizada.
  - Variables de entorno en la puesta en marcha.
  - Postman con la clave de prueba.
  - Estructura de `sdd/005-…` con `tasks.md`, `quickstart.md` y la colección.

  (Gobierno 7) — `README.md`
  - Verifica: `git diff --stat README.md` muestra cambios en el mismo commit que AGENTS.md y `sdd/005-…`.
- [ ] T034 [Rob] Guía QS-R contra producción, con la clave real solo en `.env.prod`:
  1. `run --rm migrate` y `up --build -d` con `TURNSTILE_ENFORCE=false`. La API no arranca si `.env.prod` tiene una clave de prueba o `localhost` (RF-19).
  2. Con el frontend desplegado en `https://kompitu.yandrydev.cloud`, el login con el widget → `200`, y un token reenviado → `403`.
  3. Se pasa a `TURNSTILE_ENFORCE=true`, se reinicia la API y el login sin token → `400`.

  (RF-06, RF-07, RF-19, S-06, R-2, R-4, R-5) — `sdd/005-turnstile-bot-protection/quickstart.md`
  - Verifica: ejecutar QS-R a mano. Queda para el usuario, como QS-R de la 002 y la 003.

### Checkpoint Robustez
- `dce pnpm test`, `dce pnpm test:coverage` y `dce pnpm test:perf` pasan; `./scripts/sonar-scan.sh` → quality gate en verde.
- Principio V: `grep -rnE "from ['\"](express|@prisma/client|zod|argon2|node:crypto)" src/modules/*/domain src/modules/*/application src/shared/domain src/shared/application` no devuelve resultados.
- RNF-02: `git grep -n TURNSTILE_SECRET=` solo muestra `.env.example` sin valor y las claves de prueba documentadas; la clave real no aparece en ningún fichero versionado (revisión del diff antes del commit).

---

## Cobertura RF → tareas

| RF / RNF | Tareas |
| :--- | :--- |
| RF-01, RF-02 | T017, T019, T020, T024, T030 |
| RF-03 | T018, T019, T021 |
| RF-04 | T023, T024, T025 |
| RF-05 a RF-08, RF-06b | T007, T008, T019, T024 |
| RF-09, RF-28, RF-29 | T007, T014, T015, T019 |
| RF-09b | T014, T015 |
| RF-10, RF-11 | T018, T019, T023, T024 |
| RF-12 | T018, T021 |
| RF-13 | T018, T021, T023, T025 |
| RF-14 | T004, T019, T024 |
| RF-15, RF-16 | T026, T027 |
| RF-17 | T017, T019, T020, T022 |
| RF-18, RF-19 | T001, T002, T034 |
| RF-20 a RF-23, RF-30 | T009, T010, T014, T015, T024 |
| RF-24 a RF-26 | T011, T012, T014, T015 |
| RF-27, RF-32 | T019, T024 |
| RF-31 | T009, T010, T016 |
| RF-33 | T014, T015, T022, T029 |
| RNF-01 | T028 |
| RNF-02 | T001, T011, T014, Checkpoint Robustez |
| RNF-03 | T011, T014 |
| RNF-04 | T013 y todos los tests con el verificador simulado |
| RNF-05 | T001, T002 |
| RNF-06 | T008, T014 |

Todos los RF y RNF tienen al menos una tarea de test y una de implementación, salvo RNF-01 (rendimiento), que solo tiene tarea de test (T028), y RNF-04, que es una condición de todos los tests.

Los criterios de éxito se comprueban así:
- **CE-01:** T019, T023 y T024.
- **CE-02:** T018.
- **CE-03:** T026 y QS-R.
- **CE-04:** T009, T014 y T024.
