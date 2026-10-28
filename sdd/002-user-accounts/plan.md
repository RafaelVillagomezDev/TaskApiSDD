# Plan: Cuentas de usuario — registro, sesiones con cookies, CSRF y gestión de la cuenta
Spec: `sdd/002-user-accounts/spec.md` (Aprobada) · Estado: Aprobado · Fecha: 2026-10-28

Los RF, RNF, CE y S de este plan son los de la spec 002; cuando se cita la 001 se indica («RF-31 de la 001»). Las decisiones de este plan se numeran D-1, D-2… dentro de la 002.

## 1. Resumen técnico

Un módulo vertical nuevo, `users`, gestiona cuentas, sesiones, tokens CSRF y bloqueos con la misma arquitectura hexagonal de la 001, sobre cinco tablas nuevas en PostgreSQL y con una sola dependencia nueva, `argon2`: las contraseñas se derivan con Argon2id, los tokens son aleatorios (`crypto.randomBytes`) y en la base de datos solo se guardan sus huellas SHA-256, salvo una copia cifrada con AES-256-GCM de los tokens recién renovados que vive 30 segundos para el margen de gracia. Un único middleware de sesión, inyectado por el contenedor en los routers de `tasks`, `streaks`, `alerts` y `users`, comprueba el CSRF y la sesión en el orden de RF-34 y sustituye a la validación de `X-User-Id`, que desaparece junto con `MISSING_USER`. Un middleware CORS global atiende las peticiones previas del navegador para el origen del frontend configurado por entorno, y la migración vacía los datos de la 001 y enlaza todas las tablas con `users` mediante claves foráneas en cascada, de modo que borrar una cuenta borra todo lo suyo.

## 2. Comprobación constitucional

**Excepciones usadas:**
- Principio IV: la migración de esta funcionalidad vacía con `TRUNCATE` las tablas de la 001 (`tasks`, `alerts`, `alert_period_checks`, `user_time_zones`), como exige RF-33. No es un cambio de esquema fuera de migraciones ni la edición de una migración aplicada: es una migración nueva y versionada. La 001 nunca se desplegó con usuarios reales.
- Principio VII: las respuestas a `HEAD` siguen sin cuerpo, como en la 001.

| Principio | Cómo lo cumple este plan | Estado |
| :--- | :--- | :--- |
| **I. Stack cerrado** | Una sola dependencia nueva, `argon2` (runtime), para derivar las contraseñas con Argon2id; está justificada en la sección 8 con la alternativa sin dependencia (`crypto.scrypt`) descartada por escrito, y la eligió el usuario (2026-10-28). No solapa con el stack de AGENTS.md. El resto, sin dependencias: tokens con `crypto.randomBytes`, `crypto.createHash` y `crypto.timingSafeEqual`; copia temporal cifrada con `crypto.createCipheriv('aes-256-gcm')` (todo `node:crypto`); cookies escritas con `res.cookie` de Express y leídas con un helper propio de 15 líneas (sin `cookie-parser`); CORS con un middleware propio (sin `cors`). Las alternativas con dependencia se descartan en la sección 8. | ✅ |
| **II. Sin spec no hay cambio** | Todo el comportamiento sale de la spec 002 aprobada, que declara qué requisitos de la 001 sustituye (sección *Relación con la funcionalidad 001*). La única duda de comportamiento detectada al planificar (CSRF sin sesión con la que compararlo) se preguntó y está en la spec como decisión 19 (RF-23). Las demás decisiones de este plan son técnicas (sección 7). | ✅ |
| **III. Tests y calidad** | Cada `*.use-case.ts` y cada fichero de `domain/` con lógica (`session.entity.ts`, `login-throttle.value-object.ts`, `user.entity.ts`) tiene su test (sección 10). Los tests HTTP de la 001 se reescriben para usar sesión y CSRF. El quality gate de SonarQube se mantiene: el código sigue las reglas de AGENTS.md §8 (sin `Math.random`, comparaciones de secretos con `timingSafeEqual`, SQL solo con Prisma o plantillas etiquetadas, sin secretos en el código). | ✅ |
| **IV. Migraciones y secretos** | Una migración nueva crea `users`, `sessions`, `refresh_tokens`, `csrf_tokens` y `login_attempts`, vacía los datos de la 001 (excepción declarada arriba) y convierte `user_id` en `UUID` con clave foránea. Dos variables nuevas, `SESSION_ENCRYPTION_KEY` (secreta) y `CORS_ORIGIN`, solo en `.env.dev`/`.env.prod`; `.env.example` los lista sin valor. | ✅ |
| **V. Separación hexagonal** | `users/domain/` solo importa `src/shared/domain`; `argon2`, la generación de tokens y el cifrado viven tras los puertos `PasswordHasher`, `TokenService` y `GraceTokenCipher`, implementados en `infrastructure/`. Las entradas (cuerpos, cookies, cabeceras) se validan con Zod en `infrastructure/`. Ningún módulo importa a otro: los routers de `tasks`, `streaks` y `alerts` reciben el middleware de sesión como parámetro desde el contenedor, igual que ya reciben el de contexto, y el usuario les llega en `RequestContext` (`src/shared/`). El borrado en cascada lo hace la base de datos (D-9), sin que `users` llame a otros módulos. | ✅ |
| **VI. Clarificar antes de suponer** | La spec está *Aprobada* y sin marcas `[NEEDS CLARIFICATION]`. La duda detectada al planificar se preguntó (decisión 19). | ✅ |
| **VII. Formato de respuesta único** | Todas las respuestas nuevas usan el sobre: éxitos con `sendSuccess` (incluido `data: null` en logout, refresh, cambio de contraseña y borrado de cuenta) y errores con el middleware de errores. La petición previa de CORS (`OPTIONS`) responde `200` con el sobre de éxito (RF-36), no `204`. Las cookies y las cabeceras CORS viajan en cabeceras, sin cambiar el cuerpo. | ✅ |

## 3. Estructura de archivos

### Raíz y configuración

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `prisma/schema.prisma` | Modifica | Modelos `User`, `Session`, `RefreshToken`, `CsrfToken`, `LoginAttempt`; `userId` de `Task`, `Alert`, `AlertPeriodCheck` y `UserTimeZone` pasa a `@db.Uuid` con relación a `User` y `onDelete: Cascade` (sección 4). |
| `prisma/migrations/<AAAAMMDDHHMMSS>_user_accounts/migration.sql` | Crea | `TRUNCATE` de las tablas de la 001 (RF-33), tablas nuevas, cambio de tipo de `user_id` y claves foráneas. Generada con `prisma migrate diff` y revisada a mano para añadir el `TRUNCATE` antes del cambio de tipo. |
| `package.json`, `pnpm-lock.yaml` | Modifica | Añade `argon2` a `dependencies` con versión exacta, publicada hace al menos dos semanas (D-2). |
| `pnpm-workspace.yaml` | Modifica | Autoriza el script de instalación de `argon2` en `allowBuilds`, que coloca su binario precompilado (R-14). |
| `.env.example` | Modifica | Añade `SESSION_ENCRYPTION_KEY=` y `CORS_ORIGIN=` sin valor. |
| `.env.dev`, `.env.prod` | Modifica (no versionados) | `SESSION_ENCRYPTION_KEY` (64 caracteres hexadecimales aleatorios = clave AES de 256 bits, distinta en cada entorno); `CORS_ORIGIN=http://localhost:5173` en desarrollo y `https://kompitu.yandrydev.cloud` en producción. |

### `src/` (raíz)

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `src/app.factory.ts` | Modifica | Monta `cors.middleware` antes del guardián de métodos. |
| `src/dependency.container.ts` | Modifica | Lee la configuración (`app.config.ts`), crea los repositorios, adaptadores y casos de uso de `users`, los middlewares de sesión y CSRF, el router de `users` y el planificador de limpieza; inyecta el middleware de sesión en los routers de `tasks`, `streaks` y `alerts`. |
| `src/server.main.ts` | Modifica | Arranca y para también el planificador de limpieza (D-12). |

### `src/shared/`

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `domain/error-code.constant.ts` | Modifica | Elimina `MISSING_USER`; añade `INVALID_CSRF_TOKEN`, `MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_REFRESH_TOKEN`, `SESSION_EXPIRED`, `TOO_MANY_ATTEMPTS`, `INVALID_CREDENTIALS`, `WRONG_PASSWORD` y `EMAIL_ALREADY_REGISTERED` con el orden de RF-34 (sección 6). |
| `application/request-context.type.ts` | Modifica | `SessionContext { userId, sessionId }` y `RequestContext extends SessionContext { today, timeZone }`. |
| `infrastructure/config/app.config.ts` | Crea | Lee y valida con Zod `SESSION_ENCRYPTION_KEY` (exactamente 64 caracteres hex) y `CORS_ORIGIN` (URL de origen); falla al arrancar si faltan. |
| `infrastructure/http/cookie.helper.ts` | Crea | `readCookie(req, name)` (parsea la cabecera `Cookie`), `setSessionCookies(res, tokens)` y `clearSessionCookies(res)` con los atributos de la spec (D-5). |
| `infrastructure/http/session-context.helper.ts` | Crea | `setSessionContext(res, ctx)` / `getSessionContext(res)` sobre `res.locals`, para que el middleware de sesión de `users` y el de contexto de `shared` se comuniquen sin importarse. |
| `infrastructure/http/cors.middleware.ts` | Crea | Para el origen permitido añade `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true` y `Vary: Origin`; exporta `allowPreflight(router, path, methods)`, que registra en cada ruta la respuesta `200` con el sobre a la petición previa (RF-35, RF-36, D-7). |
| `infrastructure/http/allowed-method.middleware.ts` | Modifica | Deja pasar `OPTIONS` solo si es una petición previa de CORS desde el origen permitido; cualquier otro `OPTIONS` sigue siendo `ROUTE_NOT_FOUND` (RF-36). |
| `infrastructure/http/request-context.middleware.ts` | Modifica | Deja de leer `X-User-Id`: toma `userId` y `sessionId` del `SessionContext`, valida hora y zona como en la 001 y, si son válidas, recuerda la zona (RF-30, RF-31). Pasa a usarse solo en `/tasks`, `/streak` y `/alerts`. |
| `infrastructure/http/request-header.schema.ts` | Modifica | Elimina el schema de `X-User-Id` (RF-32). |

### `src/modules/users/` (nuevo)

| Archivo | Qué hace |
| :--- | :--- |
| `domain/user.entity.ts` | `User { id, email, name, passwordHash, createdAt }` con `rename(name)` y `changePasswordHash(hash)`. Exporta `EMAIL_MAX_LENGTH = 254`, `PASSWORD_MIN_LENGTH = 12`, `PASSWORD_MAX_LENGTH = 128`, `NAME_MAX_LENGTH = 100`. |
| `domain/session.entity.ts` | `Session { id, userId, generation, accessExpiresAt, refreshExpiresAt, expiresAt, rotatedAt }` y sus reglas puras: `isAccessExpired(now)`, `isRefreshUsable(now)`, `rotate(now)` (nuevas caducidades con el tope de 30 días), `isWithinGrace(rotatedAt, now)`. Exporta `ACCESS_TOKEN_TTL_MS`, `REFRESH_TOKEN_TTL_MS`, `SESSION_MAX_AGE_MS`, `REFRESH_GRACE_MS`. |
| `domain/login-throttle.value-object.ts` | Ventana deslizante de RF-09: `isLocked(now)`, `registerFailure(now)` y `MAX_FAILURES = 5`, `WINDOW_MS = LOCK_MS = 15 min`. Lógica pura. |
| `domain/user.repository.ts` | Puerto `UserRepository`: `create`, `findById`, `findByEmail`, `updateName`, `updatePasswordHash`, `delete`. |
| `domain/session.repository.ts` | Puerto `SessionRepository`: `create`, `findByAccessTokenHash`, `findByRefreshTokenHash` (vigente o rotado, con su huella, generación y `rotatedAt`), `withRefreshTokenLocked(hash, work)` que ejecuta la renovación en una transacción con una `RefreshUnitOfWork` (`rotate`, `close`) (D-4), `delete`, `deleteAllExcept(userId, sessionId)`, `deleteExpired(now)` y `clearGraceTokens(cutoff)`. |
| `domain/login-attempt.repository.ts` | Puerto `LoginAttemptRepository`: `find(email)`, `save(email, throttle)`, `clear(email)`, `deleteStale(now)`. |
| `domain/csrf-token.repository.ts` | Puerto `CsrfTokenRepository` (tokens previos a la sesión): `save(hash, expiresAt)`, `isValid(hash, now)`, `deleteExpired(now)`. |
| `domain/password-hasher.port.ts` | Puerto `PasswordHasher`: `hash(password)`, `verify(password, stored)`, `verifyDummy(password)` (D-3). |
| `domain/token.port.ts` | Puerto `TokenService`: `randomToken()` (32 bytes aleatorios en base64url), `fingerprint(token)` (SHA-256 hex) y `equals(a, b)` (tiempo constante). |
| `domain/grace-token-cipher.port.ts` | Puerto `GraceTokenCipher`: `seal({ accessToken, refreshToken })` → texto cifrado y `open(sealed)` → los tokens, para el margen de gracia (D-1). |
| `application/issue-csrf-token.use-case.ts` | Genera y guarda un token CSRF previo a la sesión de 30 minutos (RF-22). |
| `application/register-user.use-case.ts` | Registra la cuenta sin abrir sesión (RF-01 a RF-06). |
| `application/login.use-case.ts` | Bloqueo, credenciales, apertura de sesión y token CSRF de sesión (RF-07 a RF-10, RF-16, RF-24). |
| `application/refresh-session.use-case.ts` | Rotación, margen de gracia, reutilización y caducidades (RF-11 a RF-14). |
| `application/logout.use-case.ts` | Cierra la sesión del token de acceso o, si caducó, del refresh token (RF-15). |
| `application/authenticate-session.use-case.ts` | Resuelve el token de acceso en `SessionContext` o lanza `MISSING_TOKEN`/`INVALID_TOKEN`/`TOKEN_EXPIRED` (RF-17 a RF-20). |
| `application/verify-session-csrf.use-case.ts` | Compara el token CSRF de la cabecera con el de la sesión (RF-23, decisión 19). |
| `application/get-profile.use-case.ts` | Devuelve el perfil (RF-25). |
| `application/update-profile.use-case.ts` | Cambia el nombre (RF-05, RF-26). |
| `application/change-password.use-case.ts` | Verifica la actual con bloqueo, cambia la contraseña y cierra las demás sesiones (RF-09, RF-27, RF-28). |
| `application/delete-account.use-case.ts` | Verifica la contraseña con bloqueo y borra la cuenta (RF-09, RF-28, RF-29). |
| `application/purge-expired-auth-data.use-case.ts` | Borra las copias cifradas de más de 30 s, los tokens CSRF previos caducados, las sesiones caducadas y los bloqueos vencidos (D-12). |
| `infrastructure/argon2-password-hasher.adapter.ts` | Implementa `PasswordHasher` con el paquete `argon2` en modo Argon2id (D-2); el hash ficticio de `verifyDummy` se calcula la primera vez que hace falta y se reutiliza, fuera del constructor (D-3; regla S7059 de SonarQube). |
| `infrastructure/crypto-token.adapter.ts` | Implementa `TokenService` con `crypto.randomBytes`, SHA-256 y `timingSafeEqual` (D-1). |
| `infrastructure/aes-gcm-grace-cipher.adapter.ts` | Implementa `GraceTokenCipher` con AES-256-GCM y `SESSION_ENCRYPTION_KEY`, con un IV aleatorio de 12 bytes por cifrado (D-1). |
| `infrastructure/prisma-user.repository.ts`, `prisma-session.repository.ts`, `prisma-login-attempt.repository.ts`, `prisma-csrf-token.repository.ts` | Implementan los puertos con Prisma; la rotación usa una transacción con `SELECT … FOR UPDATE` (D-4). |
| `infrastructure/user.mapper.ts` | Fila Prisma ↔ `User` ↔ recurso `User` del contrato (sin `passwordHash`). |
| `infrastructure/user.schema.ts` | Schemas Zod: registro, login, `PATCH /me` (`strict`), `PATCH /me/password` y `DELETE /me` (RF-02 a RF-05, RF-26). |
| `infrastructure/session.middleware.ts` | `createSessionMiddleware({ csrf })`: en `POST`/`PATCH`/`DELETE` comprueba primero el CSRF de sesión y después la sesión, en el orden de RF-34 y la decisión 19; deja el `SessionContext`. Variante para `/auth/refresh` y `/auth/logout` que resuelve la sesión por el refresh token (D-6). |
| `infrastructure/presession-csrf.middleware.ts` | Exige el token CSRF previo a la sesión en registro y login (RF-22, RF-23). |
| `infrastructure/auth.controller.ts`, `auth.routes.ts` | `GET /auth/csrf`, `POST /auth/register`, `/login`, `/refresh`, `/logout`, con sus peticiones previas de CORS. |
| `infrastructure/me.controller.ts`, `me.routes.ts` | `GET`/`PATCH`/`DELETE /me` y `PATCH /me/password`. |
| `infrastructure/auth-cleanup.scheduler.ts` | Ejecuta `PurgeExpiredAuthDataUseCase` al arrancar y cada minuto, sin solapar pasadas (D-12). |

### Módulos de la 001

| Archivo | Cambio |
| :--- | :--- |
| `tasks/infrastructure/task.routes.ts`, `streaks/infrastructure/streak.routes.ts`, `alerts/infrastructure/alert.routes.ts` | Reciben `session` (y, en las rutas que modifican, su variante con CSRF) además de `requestContext`, en el orden `session → requestContext → jsonBody → controlador` (D-8), y registran sus peticiones previas de CORS. |
| Repositorios, casos de uso y controladores de `tasks`, `streaks` y `alerts` | Sin cambios: siguen recibiendo `userId` en `RequestContext`, que ahora es un UUID de `users`. |

### `tests/` y documentación

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `tests/support/in-memory-user.repository.ts`, `in-memory-session.repository.ts`, `in-memory-login-attempt.repository.ts`, `in-memory-csrf-token.repository.ts` | Crea | Fakes de los puertos nuevos. |
| `tests/support/fake-password-hasher.adapter.ts` | Crea | `PasswordHasher` rápido para tests unitarios y HTTP (el real se prueba aparte). |
| `tests/support/test.container.ts` | Modifica | Cablea `users` con fakes y exporta `signIn(server, email?)`, que hace `GET /auth/csrf`, registro y login, y devuelve las cabeceras `Cookie` y `X-CSRF-Token`; `clientHeaders` deja de enviar `X-User-Id`. |
| `tests/integration/test-database.helper.ts` | Modifica | Añade las tablas nuevas a la lista (salvo `users`) y un `createTestUser(prisma)` que crea una cuenta con email único, para los tests que necesitan un `user_id` válido por las claves foráneas. |
| `tests/integration/global.setup.ts` | Modifica | Tras migrar, vacía `users` (con sus datos en cascada) y los tokens una sola vez por ejecución: vaciar `users` en cada fichero borraría los datos de los demás, que se ejecutan en paralelo (R-12). |
| `tasks/infrastructure/prisma-task.repository.ts`, `alerts/infrastructure/prisma-alert.repository.ts`, `alerts/infrastructure/prisma-user-time-zone.repository.ts` | Modifica | Sus consultas SQL a mano convierten el `user_id` con `::uuid`: con la columna `UUID`, PostgreSQL no compara ni inserta texto (detectado en T009-T010). |
| Tests HTTP, de integración y de rendimiento de la 001 | Modifica | Usan sesión y CSRF en lugar de `X-User-Id`; la batería de precedencia por pares incorpora los niveles CSRF y sesión. |
| `sdd/001-taskApiSDD-mvp/mvp-p1.postman-collection.json` | Modifica | Flujo con `GET /auth/csrf`, registro y login; las cookies las gestiona Postman y un script guarda `csrfToken` en una variable. |
| `sdd/002-user-accounts/quickstart.md` | Crea | Guía manual QS-0 a QS-H7 con `curl -c/-b` para las cookies. |
| `sdd/001-taskApiSDD-mvp/quickstart.md`, `README.md` | Modifica | La función `api` usa cookies y `X-CSRF-Token`; desaparecen `X-User-Id` y `MISSING_USER`. |

## 4. Modelo de datos

Cinco tablas nuevas y cuatro modificadas. Instantes en `TIMESTAMPTZ(3)` UTC, como en la 001. Ningún token ni contraseña se guarda en claro (RNF-03, RNF-06).

### `users`

| Columna | Tipo | Restricciones | Notas |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK, `DEFAULT gen_random_uuid()` | Es el `userId` de toda la API. |
| `email` | `VARCHAR(254)` | NOT NULL, `UNIQUE` | Ya recortado y en minúsculas (RF-03), así que la unicidad sin mayúsculas la da el índice normal. |
| `password_hash` | `VARCHAR(255)` | NOT NULL | Formato exacto (cadena PHC de Argon2): `$argon2id$v=19$m=19456,p=1,t=2$<sal base64, 16 bytes>$<hash base64, 32 bytes>` (D-2). |
| `name` | `VARCHAR(100)` | NULL | Recortado; vacío → `NULL` (RF-05). |
| `created_at` | `TIMESTAMPTZ(3)` | NOT NULL, `DEFAULT now()` | `createdAt` del recurso `User`. |
| `updated_at` | `TIMESTAMPTZ(3)` | NOT NULL | `@updatedAt`. |

### `sessions`

| Columna | Tipo | Restricciones | Notas |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK, `DEFAULT gen_random_uuid()` | |
| `user_id` | `UUID` | NOT NULL, FK `users(id)` `ON DELETE CASCADE` | |
| `generation` | `INTEGER` | NOT NULL, `DEFAULT 0` | Sube 1 en cada rotación (RF-11). |
| `access_token_hash` | `CHAR(64)` | NOT NULL, `UNIQUE` | SHA-256 hex del token de acceso vigente. Solo vale el de la generación actual. |
| `csrf_token_hash` | `CHAR(64)` | NOT NULL | SHA-256 hex del token CSRF de la sesión, fijo durante toda la sesión (RF-24). |
| `access_expires_at` | `TIMESTAMPTZ(3)` | NOT NULL | Última rotación + 15 min (RF-07, RF-11). |
| `refresh_expires_at` | `TIMESTAMPTZ(3)` | NOT NULL | Última rotación + 7 días, sin pasar de `expires_at`. |
| `expires_at` | `TIMESTAMPTZ(3)` | NOT NULL | Login + 30 días: tope absoluto (RF-11, RF-12). |
| `rotated_at` | `TIMESTAMPTZ(3)` | NULL | Instante de la última rotación, para el margen de gracia (RF-13). |
| `grace_tokens` | `TEXT` | NULL | Copia cifrada de los tokens emitidos en la última rotación, para devolverlos de nuevo dentro del margen (RF-13). Formato exacto: `v1.<iv base64url, 12 bytes>.<texto cifrado base64url>.<etiqueta base64url, 16 bytes>` de AES-256-GCM sobre `{"accessToken":"…","refreshToken":"…"}`. Se borra (`NULL`) cuando pasan 30 s (D-1, D-12). |
| `created_at` | `TIMESTAMPTZ(3)` | NOT NULL, `DEFAULT now()` | Instante del login. |

Índices: `UNIQUE (access_token_hash)`; `(user_id)` para cerrar las demás sesiones (RF-27); `(expires_at)` y `(refresh_expires_at)` para la limpieza.

### `refresh_tokens`

| Columna | Tipo | Restricciones | Notas |
| :--- | :--- | :--- | :--- |
| `token_hash` | `CHAR(64)` | PK | SHA-256 hex de cada refresh token emitido, vigente o ya rotado. |
| `session_id` | `UUID` | NOT NULL, FK `sessions(id)` `ON DELETE CASCADE` | |
| `generation` | `INTEGER` | NOT NULL | Generación de la sesión que lo emitió. |
| `rotated_at` | `TIMESTAMPTZ(3)` | NULL | `NULL` = vigente; con valor = rotado en ese instante. Guardar todos los rotados permite detectar la reutilización de cualquiera, no solo del último (RF-13). |

Índice: `(session_id)`. Como mucho unas 2 900 filas por sesión (una cada 15 minutos durante 30 días); se borran con la sesión.

### `csrf_tokens` (previos a la sesión)

| Columna | Tipo | Restricciones | Notas |
| :--- | :--- | :--- | :--- |
| `token_hash` | `CHAR(64)` | PK | SHA-256 hex del token de `GET /auth/csrf`. |
| `expires_at` | `TIMESTAMPTZ(3)` | NOT NULL | Emisión + 30 min (RF-22). Reutilizable hasta entonces. |

Índice: `(expires_at)` para la limpieza.

### `login_attempts`

| Columna | Tipo | Restricciones | Notas |
| :--- | :--- | :--- | :--- |
| `email` | `VARCHAR(254)` | PK | Email normalizado, exista o no la cuenta (RF-09 cuenta por email). |
| `failed_at` | `TIMESTAMPTZ(3)[]` | NOT NULL | Instantes de los últimos fallos, como mucho 5 (ventana deslizante, D-10). |
| `locked_until` | `TIMESTAMPTZ(3)` | NULL | Quinto fallo + 15 min. |

### Tablas de la 001

| Tabla | Cambio |
| :--- | :--- |
| `tasks`, `alerts`, `alert_period_checks`, `user_time_zones` | `TRUNCATE` (RF-33); `user_id` pasa de `TEXT` a `UUID` con FK `users(id)` `ON DELETE CASCADE` (RF-29, D-9). Los índices existentes se conservan. |

### Formato de los tokens

| Token | Formato | Dónde viaja | Qué se guarda |
| :--- | :--- | :--- | :--- |
| Acceso | `base64url(32 bytes de crypto.randomBytes)` (43 caracteres) | Cookie `access_token` | `sessions.access_token_hash` (y, durante 30 s tras una rotación, cifrado en `sessions.grace_tokens`) |
| Refresh | `base64url(32 bytes de crypto.randomBytes)` | Cookie `refresh_token` | `refresh_tokens.token_hash` (y, durante 30 s tras una rotación, cifrado en `sessions.grace_tokens`) |
| CSRF de sesión | `base64url(32 bytes de crypto.randomBytes)`, generado en el login y fijo toda la sesión (RF-24) | Cuerpo del login; cabecera `X-CSRF-Token` | `sessions.csrf_token_hash` |
| CSRF previo a la sesión | `base64url(32 bytes de crypto.randomBytes)` | Cuerpo de `GET /auth/csrf`; cabecera `X-CSRF-Token` | `csrf_tokens.token_hash` |

## 5. Lógica principal

### 5.1 Orden de procesamiento de una petición (RF-34)
1. `cors.middleware` (global): si `Origin` es `CORS_ORIGIN`, añade las cabeceras CORS a la respuesta, sea cual sea.
2. `allowed-method.middleware` (global): `OPTIONS` solo pasa si es una petición previa desde el origen permitido; cualquier otro método fuera de `GET`, `POST`, `PATCH` y `DELETE` → `ROUTE_NOT_FOUND`. Express busca la ruta; si no existe → `ROUTE_NOT_FOUND`. La petición previa la responde el manejador `OPTIONS` de cada ruta: `200` si el método pedido es uno de los suyos; si no → `ROUTE_NOT_FOUND`.
3. Por ruta (D-8), según su tipo:
   - **Registro y login:** `presession-csrf` (sin cabecera o token caducado/desconocido → `INVALID_CSRF_TOKEN`) → `json-body` → controlador.
   - **Refresh y logout:** `session` en variante de refresh (5.3, 5.4) → controlador.
   - **`/me` y las rutas de la 001:** `session` (5.2) → en `/tasks`, `/streak` y `/alerts`, `request-context` (hora y zona de la 001; si son válidas, recuerda la zona, RF-31) → `json-body` → controlador.
4. El controlador valida con Zod (`VALIDATION_ERROR`) y el caso de uso aplica las reglas de negocio y de día.

### 5.2 Middleware de sesión (RF-17 a RF-20, RF-23, decisión 19)
1. Si el método es `POST`, `PATCH` o `DELETE` y falta `X-CSRF-Token` → `INVALID_CSRF_TOKEN`.
2. Sin cookie `access_token` → `MISSING_TOKEN`.
3. Buscar la sesión por `fingerprint(access_token)`. No existe → `INVALID_TOKEN` (cubre token inventado, mal formado, de una generación anterior o de una sesión cerrada).
4. Si el método modifica: `equals(fingerprint(X-CSRF-Token), session.csrf_token_hash)`; si no coincide → `INVALID_CSRF_TOKEN`. (Si los pasos 2 o 3 fallan con la cabecera presente, el CSRF no se puede juzgar y gana el error de sesión: decisión 19.)
5. `access_expires_at ≤ now` → `TOKEN_EXPIRED`.
6. Deja `SessionContext { userId, sessionId }`.

### 5.3 Renovación (RF-11 a RF-14)
Todo en una transacción con la fila de la sesión bloqueada (`SELECT … FOR UPDATE`, D-4).
1. Falta `X-CSRF-Token` → `INVALID_CSRF_TOKEN`.
2. Sin cookie `refresh_token`, o su huella no está en `refresh_tokens` → `INVALID_REFRESH_TOKEN`.
3. Comprobar el CSRF contra la sesión del refresh token; no coincide → `INVALID_CSRF_TOKEN`.
4. Si `now ≥ sessions.expires_at` o `now ≥ refresh_expires_at` → borrar la sesión → `SESSION_EXPIRED`.
5. **Token vigente** (`rotated_at IS NULL`): generar un token de acceso y un refresh token aleatorios; `generation + 1`; marcar el token usado con `rotated_at = now`; insertar la huella del nuevo; nueva `access_token_hash`; `access_expires_at = now + 15 min`; `refresh_expires_at = min(now + 7 días, expires_at)`; `sessions.rotated_at = now`; `sessions.grace_tokens = seal(nuevos tokens)`; nuevas cookies.
6. **Token ya rotado:** si es el de la generación inmediatamente anterior, `now − rotated_at ≤ 30 s` y `grace_tokens` no es `NULL` → `open(grace_tokens)` y responder con esos mismos tokens (D-1). Si no → borrar la sesión → `INVALID_REFRESH_TOKEN` (RF-13).
7. Respuesta: `200`, `data: null`, cookies nuevas; el token CSRF no cambia (RF-24). En `INVALID_REFRESH_TOKEN` y `SESSION_EXPIRED` se borran las cookies.

### 5.4 Logout (RF-15)
1. Falta `X-CSRF-Token` → `INVALID_CSRF_TOKEN`.
2. Resolver la sesión por `access_token` (aunque haya caducado); si no hay cookie de acceso válida, por el `refresh_token` vigente. Sin ninguna cookie → `MISSING_TOKEN`; con cookies que no resuelven sesión → `INVALID_TOKEN`.
3. CSRF de la sesión; no coincide → `INVALID_CSRF_TOKEN`.
4. Borrar la sesión (con sus refresh tokens en cascada), borrar las cookies → `200`, `data: null`.

### 5.5 Registro (RF-01 a RF-06)
1. CSRF previo (5.1). 2. Zod: email recortado y en minúsculas, formato y ≤ 254; contraseña 12–128 sin recortar; nombre recortado, ≤ 100, vacío → `null`. 3. `findByEmail` → existe → `EMAIL_ALREADY_REGISTERED` (la restricción única cubre la carrera: un `P2002` se traduce al mismo error). 4. `hash(password)` y `create` → `201` con el recurso `User`, sin cookies.

### 5.6 Login (RF-07 a RF-10, RF-16, RF-24)
1. CSRF previo y Zod. 2. Cargar `login_attempts` del email; `isLocked(now)` → `TOO_MANY_ATTEMPTS`. 3. `findByEmail`; si no existe, `verifyDummy(password)` para gastar el mismo tiempo (D-3) y tratarlo como fallo. 4. Fallo → `registerFailure(now)` (si es el quinto, `locked_until = now + 15 min`) → `INVALID_CREDENTIALS`. 5. Éxito → `clear(email)` (RF-10); crear la sesión (generación 0, caducidades de 15 min, 7 días y 30 días); generar los tres tokens aleatorios (acceso, refresh y CSRF de sesión); guardar solo sus huellas → `200` con `Set-Cookie` y `{ user, csrfToken }`.

### 5.7 Bloqueo (RF-09, D-10)
`failed_at` guarda como mucho los últimos 5 fallos. `registerFailure(now)`: descarta los fallos con más de 15 min, añade `now`; si quedan 5, `locked_until = now + 15 min`. `isLocked(now)`: `locked_until > now`. Cuando el bloqueo vence, la fila se vacía en el siguiente fallo o en la limpieza. `PATCH /me/password` y `DELETE /me` usan el email de la cuenta de la sesión como clave.

### 5.8 Cambio de contraseña y borrado de cuenta (RF-27 a RF-29)
1. Sesión y CSRF (5.2) y Zod. 2. `isLocked` → `TOO_MANY_ATTEMPTS`. 3. `verify(current)` falla → `registerFailure` → `WRONG_PASSWORD`. 4. Cambio: `hash(new)`, `updatePasswordHash`, `deleteAllExcept(userId, sessionId)`. Borrado: `users.delete(userId)`; la base de datos borra en cascada tareas, avisos, comprobaciones de periodo, zona, sesiones y refresh tokens (D-9); se borra también la fila de `login_attempts` del email y las cookies.

### 5.9 CORS (RF-35, RF-36)
- Respuestas a peticiones con `Origin: CORS_ORIGIN`: `Access-Control-Allow-Origin: <origen>`, `Access-Control-Allow-Credentials: true`, `Vary: Origin`. Otros orígenes: ninguna cabecera CORS (el navegador bloquea).
- Petición previa válida → `200`, sobre con `data: null`, `Access-Control-Allow-Methods: <métodos de la ruta>`, `Access-Control-Allow-Headers: Content-Type, X-CSRF-Token, X-Client-Time, X-Timezone`, `Access-Control-Max-Age: 600`.
- Peticiones sin `Origin` (Postman, `curl`): se atienden como siempre (S-06).

### 5.10 Limpieza (D-12)
Cada minuto y al arrancar: poner a `NULL` las `grace_tokens` con `rotated_at` de hace más de 30 s; borrar `csrf_tokens` con `expires_at ≤ now`, `sessions` con `expires_at ≤ now` o `refresh_expires_at ≤ now` (sus refresh tokens caen en cascada) y `login_attempts` sin bloqueo vigente cuyo último fallo tenga más de 15 min. No cambia ningún comportamiento observable: las caducidades y el margen se comprueban siempre en cada petición; la limpieza solo evita que las tablas crezcan y que las copias cifradas sobrevivan más de lo necesario.

## 6. Interfaz

Contrato completo en la spec (sección *Contrato de la API*). Abreviaturas: **C** = `X-CSRF-Token`; **S** = errores de sesión (`MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`); **HZ** = `INVALID_CLIENT_TIME`, `INVALID_TIMEZONE`.

| Método y ruta | Entrada | Salida (`data`) | Errores posibles (por precedencia) |
| :--- | :--- | :--- | :--- |
| `OPTIONS` cualquier ruta | `Origin`, `Access-Control-Request-Method` | `200`, `null` + cabeceras CORS | `ROUTE_NOT_FOUND` |
| `GET /auth/csrf` | — | `200`, `{ csrfToken }` | — |
| `POST /auth/register` | C previo; `{ email, password, name? }` | `201`, `User` | `INVALID_CSRF_TOKEN`, `VALIDATION_ERROR`, `EMAIL_ALREADY_REGISTERED` |
| `POST /auth/login` | C previo; `{ email, password }` | `200`, `{ user, csrfToken }` + cookies | `INVALID_CSRF_TOKEN`, `VALIDATION_ERROR`, `TOO_MANY_ATTEMPTS`, `INVALID_CREDENTIALS` |
| `POST /auth/refresh` | C de sesión; cookie `refresh_token` | `200`, `null` + cookies | `INVALID_CSRF_TOKEN`, `INVALID_REFRESH_TOKEN`, `SESSION_EXPIRED` |
| `POST /auth/logout` | C de sesión; cookie de acceso o de refresh | `200`, `null`, borra cookies | `INVALID_CSRF_TOKEN`, `MISSING_TOKEN`, `INVALID_TOKEN` |
| `GET /me` | Cookie de acceso | `200`, `User` | S |
| `PATCH /me` | C; `{ name }` | `200`, `User` | `INVALID_CSRF_TOKEN`, S, `VALIDATION_ERROR` |
| `PATCH /me/password` | C; `{ currentPassword, newPassword }` | `200`, `null` | `INVALID_CSRF_TOKEN`, S, `VALIDATION_ERROR`, `TOO_MANY_ATTEMPTS`, `WRONG_PASSWORD` |
| `DELETE /me` | C; `{ password }` | `200`, `null`, borra cookies | `INVALID_CSRF_TOKEN`, S, `VALIDATION_ERROR`, `TOO_MANY_ATTEMPTS`, `WRONG_PASSWORD` |
| `GET /tasks`, `/tasks/{id}`, `/streak`, `/alerts` | Cookie de acceso; hora y zona | Igual que en la 001 | S, HZ, `VALIDATION_ERROR`, `TASK_NOT_FOUND` |
| `POST /tasks`, `PATCH`/`DELETE /tasks/{id}` | C; cookie; hora y zona; cuerpo de la 001 | Igual que en la 001 | `INVALID_CSRF_TOKEN`, S, HZ, `VALIDATION_ERROR`, `TASK_NOT_FOUND`, `DAY_CLOSED`/`DAY_NOT_STARTED` |

Mensajes de éxito nuevos (RNF-02): registro → "Cuenta creada con éxito"; login → "Sesión iniciada con éxito"; refresh → "Sesión renovada con éxito"; logout → "Sesión cerrada con éxito"; `PATCH /me` → "Perfil actualizado con éxito"; contraseña → "Contraseña cambiada con éxito"; borrado → "Cuenta eliminada con éxito"; consultas y petición previa → "Operación realizada con éxito".

Orden en `error-code.constant.ts` (`precedence`): `ROUTE_NOT_FOUND` 1; `INVALID_CSRF_TOKEN` 2; `MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_REFRESH_TOKEN`, `SESSION_EXPIRED` 3; `INVALID_CLIENT_TIME` 4; `INVALID_TIMEZONE` 5; `VALIDATION_ERROR` 6; `TOO_MANY_ATTEMPTS`, `INVALID_CREDENTIALS`, `WRONG_PASSWORD`, `EMAIL_ALREADY_REGISTERED`, `TASK_NOT_FOUND` 7; `DAY_CLOSED`, `DAY_NOT_STARTED` 8.

## 7. Decisiones técnicas

| ID | Decisión | Por qué | Alternativas descartadas |
| :--- | :--- | :--- | :--- |
| D-1 | Tokens de acceso, refresh y CSRF de sesión aleatorios (32 bytes de `crypto.randomBytes`); en la base de datos solo su huella SHA-256. Para el margen de gracia (RF-13), la última rotación guarda una copia cifrada con AES-256-GCM (`SESSION_ENCRYPTION_KEY`) de los tokens emitidos, que se borra a los 30 s. | Cumple RNF-06 y es el estándar de OWASP. Si se filtran a la vez la base de datos y la clave, solo quedan expuestos los tokens renovados en los últimos 30 s, no todas las sesiones; y cambiar la clave no cierra ninguna sesión (solo invalida las copias de esos 30 s). Decidido por el usuario (2026-10-28) frente a la derivación con HMAC. | Derivarlos con HMAC de un secreto, el id de la sesión y su generación (más simple, pero con el secreto y la base de datos se calculan los tokens de todas las sesiones, y cambiar el secreto las cierra todas); aleatorios solo con su huella (imposible reenviar los mismos en el margen); guardarlos en claro (incumple RNF-06); JWT (dependencia o firma a mano, y aun así hay que consultar la sesión para invalidarla al momento, RF-19). |
| D-2 | Contraseñas con Argon2id mediante el paquete `argon2`: memoria 19 MiB (`memoryCost: 19456`), 2 pasadas (`timeCost: 2`), paralelismo 1, sal de 16 bytes y hash de 32 bytes, guardados en la cadena PHC estándar; la verificación la hace la propia librería en tiempo constante. | Decidido por el usuario (2026-10-28). Argon2id es el primer algoritmo que recomienda OWASP para contraseñas y el ganador del Password Hashing Competition; estos son los parámetros mínimos de OWASP y dejan mucho margen para RNF-01 (unas decenas de milisegundos). La cadena PHC incluye los parámetros, así que se pueden endurecer más adelante sin migrar los datos. | `crypto.scrypt` (sin dependencia, también aceptado por OWASP; el usuario prefirió Argon2id); `crypto.argon2` de Node 24 (obliga a subir la versión de Node de todo el proyecto y su API aún no es estable); `bcrypt` (dependencia nativa, solo usa los primeros 72 bytes de la contraseña y la spec admite 128 caracteres); `pbkdf2` (más débil frente a GPU). |
| D-3 | Login con un email inexistente verifica la contraseña contra un hash ficticio fijo. | Mismo tiempo de respuesta exista o no la cuenta: RF-08 exige no revelar si el email existe, también por el tiempo. | Responder sin calcular (revela por el tiempo qué emails existen). |
| D-4 | La rotación del refresh token va en una transacción con la sesión bloqueada (`SELECT … FOR UPDATE`). | Dos pestañas pueden renovar a la vez: sin bloqueo, ambas rotarían y la segunda cerraría la sesión por «reutilización». Con el bloqueo, la segunda ve el token recién rotado y entra en el margen de gracia. | Sin transacción (carrera); bloqueo en memoria (no sirve con varias instancias). |
| D-5 | Cookies con `res.cookie` de Express y lectura con un helper propio (`cookie.helper.ts`); atributos `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/` (acceso) y `Path=/auth` (refresh), y `Max-Age` igual a la caducidad. | Express ya sabe escribir cookies; leer la cabecera `Cookie` son unas líneas. Sin dependencia nueva. | `cookie-parser` (dependencia para una tarea mínima). |
| D-6 | Un único middleware de sesión hace el CSRF de sesión y la sesión, con una variante que resuelve la sesión por el refresh token para `/auth/refresh` y `/auth/logout`. | El CSRF de sesión necesita la sesión para comparar; hacerlo en un solo sitio evita dos consultas y garantiza el orden de RF-34 y la decisión 19. | Dos middlewares separados (consulta duplicada y orden fácil de romper al montar las rutas). |
| D-7 | CORS con un middleware propio y las peticiones previas atendidas por un manejador `OPTIONS` en cada ruta (`allowPreflight`). | Solo hay un origen y unas pocas cabeceras; registrar el preflight por ruta da `ROUTE_NOT_FOUND` a rutas y métodos inexistentes (RF-36) y responde con el sobre (principio VII). | Paquete `cors` (dependencia; responde `204` sin sobre); un manejador global de `OPTIONS` (no sabe qué rutas y métodos existen). |
| D-8 | Orden de cada ruta: `session` → `request-context` (solo `/tasks`, `/streak`, `/alerts`) → `json-body` → controlador, encadenado en la propia ruta como en la 001. | Reproduce la precedencia de RF-34: CSRF y sesión (2-3) antes que hora y zona (4-5) y que un JSON mal formado (6). | Middlewares globales (romperían `ROUTE_NOT_FOUND` primero, como ya decidió la 001). |
| D-9 | Las tablas de la 001 apuntan a `users` con clave foránea `ON DELETE CASCADE`; borrar la cuenta es un único `DELETE` en `users`. | Cumple RF-29 de forma atómica y sin que `users` conozca a los demás módulos (principio V). | Que `users` llame a fachadas de `tasks` y `alerts` para borrar (acoplamiento entre módulos y varias transacciones). |
| D-10 | El bloqueo guarda los instantes de los últimos 5 fallos (`TIMESTAMPTZ[]`) por email. | Ventana deslizante exacta de «5 fallos en 15 minutos» (RF-09), con una sola fila por email. | Contador con ventana fija desde el primer fallo (deja pasar más fallos en el borde). |
| D-11 | Configuración nueva por entorno: `SESSION_ENCRYPTION_KEY` (64 hex) y `CORS_ORIGIN`, validadas con Zod al arrancar (`app.config.ts`). | Principio IV (secretos fuera del código) y RF-35 (origen por entorno); la API no arranca mal configurada. | Valores por defecto en el código (un secreto por defecto acabaría en producción). |
| D-12 | Planificador de limpieza cada minuto (`auth-cleanup.scheduler.ts`), con la misma estructura que el de avisos. | Las copias cifradas del margen de gracia no deben sobrevivir mucho más de 30 s (D-1); `GET /auth/csrf` es público y crea filas; las sesiones caducadas tampoco desaparecen solas. Son consultas sobre columnas indexadas. | Limpiar al consultar (añade latencia a peticiones normales); no limpiar (tablas que solo crecen). |
| D-13 | El módulo se llama `users` y contiene cuentas, sesiones y CSRF. | Es el ejemplo de módulo de AGENTS.md y todo comparte la entidad `User`; separar `auth` obligaría a una fachada sin ganar nada. | Módulos `users` y `auth` separados. |
| D-14 | Solo vale el token de acceso de la generación vigente: tras una rotación, el anterior responde `INVALID_TOKEN`. | Una sola huella por sesión y una consulta por petición; las pestañas comparten las cookies del navegador, así que todas usan ya el nuevo. | Aceptar el anterior hasta su caducidad (dos huellas por sesión y más superficie si se filtra). |

## 8. Complexity Tracking

### Dependencias

| Dependencia | Tipo | ¿En el stack de AGENTS.md? | Por qué hace falta | Alternativa sin ella descartada |
| :--- | :--- | :--- | :--- | :--- |
| `argon2` | runtime | No | Derivar las contraseñas con Argon2id, el algoritmo que el usuario eligió y el primero que recomienda OWASP (D-2, RNF-03). Node 22 no lo incluye. | `crypto.scrypt` de Node: cumple RNF-03 y lo acepta OWASP, pero el usuario prefirió Argon2id (2026-10-28). Subir a Node 24 para usar `crypto.argon2`: cambia el runtime de todo el proyecto por una API aún no estable. |

Aprobada por el usuario el 2026-10-28. Versión exacta, publicada hace al menos dos semanas, fijada en la tarea que la añade. El resto de necesidades se cubre sin dependencias:

| Necesidad | Con qué se resuelve | Dependencia descartada |
| :--- | :--- | :--- |
| Generar tokens y sus huellas | `crypto.randomBytes`, `crypto.createHash`, `crypto.timingSafeEqual` | `jsonwebtoken`, `jose`, `uuid` |
| Cifrar la copia del margen de gracia | `crypto.createCipheriv` / `createDecipheriv` con `aes-256-gcm` | `libsodium`, `tweetnacl` |
| Leer y escribir cookies | Cabecera `Cookie` + `res.cookie` | `cookie-parser` |
| CORS | Middleware propio | `cors` |

### Piezas nuevas

| Pieza | Por qué hace falta | Alternativa más simple descartada |
| :--- | :--- | :--- |
| Módulo `users` | HU-01 a HU-07. | — (la spec lo exige). |
| Tabla `refresh_tokens` | Detectar la reutilización de cualquier refresh token rotado, no solo del último (RF-13). | Guardar solo la huella anterior en `sessions` (no detecta tokens de dos o más rotaciones atrás). |
| Tabla `csrf_tokens` | Guardar los tokens previos a la sesión con su caducidad (RF-22), como pidió el usuario. | Tokens firmados sin guardar (el usuario pidió generarlos y guardarlos). |
| Tabla `login_attempts` | Bloqueo por email, exista o no la cuenta (RF-09). | Columna en `users` (no cubre emails inexistentes). |
| Planificador de limpieza | Evitar que crezcan `csrf_tokens`, `sessions` y `login_attempts` (D-12). | — |
| Clave `SESSION_ENCRYPTION_KEY` y columna `sessions.grace_tokens` | Devolver los mismos tokens dentro del margen de gracia sin guardarlos en claro (RF-13, D-1). | Derivar los tokens con HMAC (descartado por el usuario: expone todas las sesiones si se filtran clave y base de datos). |

## 9. Riesgos

| ID | Riesgo | Mitigación |
| :--- | :--- | :--- |
| R-1 | Argon2id hace que el login, el registro o el cambio de contraseña superen el p95 de 300 ms (RNF-01). | Parámetros mínimos de OWASP (D-2, unas decenas de milisegundos); `argon2` calcula en el *thread pool* de libuv sin bloquear el bucle de eventos. El test de rendimiento añade registro y login. |
| R-14 | `argon2` es una librería nativa: su binario puede no instalarse (pnpm bloquea los scripts de instalación) o no existir para Alpine en arm64 o x64. | `allowBuilds` en `pnpm-workspace.yaml`, como con Prisma (R-12 de la 001). La primera tarea que la añade comprueba, en `Dockerfile.dev` y en `Dockerfile.prod` (etapa `runtime`), que `argon2.hash` funciona; si no hubiera binario precompilado, la etapa de build tendría que instalar las herramientas de compilación, y eso se decidiría con el usuario antes de seguir. **Descartado en T001-T002:** `argon2` 0.45.1 funciona en las imágenes de desarrollo y de producción sin cambiar los Dockerfiles. |
| R-2 | Safari no acepta cookies `Secure` en `http://localhost`, a diferencia de Chrome y Firefox (S-06). | Documentado en la guía: en desarrollo, usar Chrome o Firefox. Si hiciera falta, una variable de entorno para desactivar `Secure` solo en desarrollo, con su propia decisión. |
| R-3 | Dos renovaciones simultáneas cierran la sesión por error. | D-4 (bloqueo de fila) y el margen de 30 s; test de integración con dos renovaciones concurrentes. |
| R-4 | Se filtra `SESSION_ENCRYPTION_KEY`. | Solo en `.env.*` (principio IV). Por sí sola no sirve (las copias cifradas solo existen 30 s y están en la base de datos). Se cambia sin cerrar sesiones: solo fallan las renovaciones en su margen de esos 30 s, que responden como un refresh reutilizado. |
| R-13 | Una copia cifrada sobrevive más de 30 s si el planificador de limpieza está parado. | El margen se comprueba siempre con `rotated_at` al leerla (fuera del margen se ignora), y la limpieza corre cada minuto y al arrancar. |
| R-5 | `GET /auth/csrf` es público y alguien llena `csrf_tokens`. | Filas de 2 columnas indexadas, limpieza cada minuto (D-12). Un límite por IP queda fuera de alcance. |
| R-6 | Ataques de tiempo sobre el login o las comparaciones de tokens. | D-3 (hash ficticio) y `timingSafeEqual` en contraseñas y tokens CSRF. |
| R-7 | Cualquiera puede bloquear el login de otro usuario fallando 5 veces con su email. | Comportamiento aceptado por la spec (RF-09). Las sesiones abiertas siguen funcionando (S-03). |
| R-8 | Montar mal los middlewares rompe la precedencia de RF-34. | D-6, D-8 y una nueva batería de precedencia por pares con los niveles CSRF y sesión. |
| R-9 | La migración borra los datos de desarrollo. | Es lo que exige RF-33 y se avisa en la guía y en el README. El esquema `test` se regenera solo. |
| R-10 | Reescribir los tests, Postman y la guía de la 001 para usar sesión rompe algo que ya funcionaba. | `signIn()` en el contenedor de test centraliza el login; se reescriben fichero a fichero con la suite en verde entre cada uno, y la colección de Postman se valida con Newman. |
| R-11 | SonarQube marca como *hotspots* las cookies, el uso de `crypto` o el CORS. | Se escriben según AGENTS.md §8 (cookies `HttpOnly`/`Secure`/`SameSite`, origen CORS no comodín, `timingSafeEqual`); cualquier hotspot se revisa con el usuario, nunca se marca como seguro por iniciativa propia (principio III). |
| R-12 | Las claves foráneas obligan a que exista el usuario en los tests de integración de la 001. | `createTestUser(prisma)` en el helper de integración; cada fichero crea sus usuarios en `beforeEach` y `global.setup.ts` vacía `users` una vez por ejecución. **Ocurrió en T009-T010:** además, las consultas SQL a mano necesitaron `::uuid`. |

## 10. Estrategia de tests

Mismos tipos y ubicación que en la 001 (unitarios, HTTP, integración y rendimiento, en la subcarpeta `tests/` de cada carpeta). Los tests unitarios y HTTP usan `FakePasswordHasher` para no pagar el coste de Argon2id; el real se prueba en su propio test.

| Módulo | Test | Qué comprueba | RF / RNF / CE |
| :--- | :--- | :--- | :--- |
| users | `user.entity.test.ts` | Constantes de longitud, `rename` (recorte, vacío → `null`), cambio de huella de contraseña. | RF-05, RF-26 |
| users | `session.entity.test.ts` | Caducidad del acceso a los 15 min; refresh de 7 días; tope de 30 días en `rotate` (días 1, 3, 9, 15 y 31 del ejemplo de RF-11); margen de 30 s (a los 30 s sí, a los 31 s no). | RF-07, RF-11 a RF-13 |
| users | `login-throttle.value-object.test.ts` | Ejemplo de RF-09 (fallos a las 10:00…10:10, bloqueo hasta las 10:25); quinto fallo bloquea; ventana deslizante; vencimiento. | RF-09, RF-10 |
| users | `issue-csrf-token.use-case.test.ts` | Guarda la huella con caducidad de 30 min; nunca el token en claro. | RF-22, RNF-06 |
| users | `register-user.use-case.test.ts` | Crea la cuenta sin sesión; email repetido con otras mayúsculas → `EMAIL_ALREADY_REGISTERED`; guarda la huella, no la contraseña. | RF-01, RF-03, RF-06, RNF-03 |
| users | `login.use-case.test.ts` | Credenciales correctas abren sesión con caducidades y token CSRF; email inexistente y contraseña errónea dan el mismo error y usan `verifyDummy`; quinto fallo `INVALID_CREDENTIALS`, sexto `TOO_MANY_ATTEMPTS` aunque sea correcta; login correcto pone el contador a cero; varias sesiones a la vez. | RF-07 a RF-10, RF-16, RF-24 |
| users | `refresh-session.use-case.test.ts` | Rotación con nuevas caducidades; tope de 30 días → `SESSION_EXPIRED`; 7 días sin renovar → `SESSION_EXPIRED`; token rotado a los 10 s → mismos tokens (abre la copia cifrada); a los 31 s → sesión cerrada e `INVALID_REFRESH_TOKEN`; token de dos generaciones atrás → sesión cerrada; token inexistente; las demás sesiones no cambian; el CSRF de sesión no cambia. | RF-11 a RF-14, RF-24 |
| users | `logout.use-case.test.ts` | Cierra la sesión por el token de acceso y, si caducó, por el refresh; no toca otras sesiones. | RF-15, RF-16 |
| users | `authenticate-session.use-case.test.ts` | Sin token, desconocido, de generación anterior, de sesión cerrada → errores de RF-18 y RF-19; caducado → `TOKEN_EXPIRED`; válido → `SessionContext`. | RF-17 a RF-20, D-14 |
| users | `verify-session-csrf.use-case.test.ts` | Coincide, no coincide, comparación en tiempo constante. | RF-23 |
| users | `get-profile.use-case.test.ts`, `update-profile.use-case.test.ts` | Perfil sin contraseña; cambio de nombre. | RF-05, RF-25, RF-26 |
| users | `change-password.use-case.test.ts` | Cambia la huella; cierra las demás sesiones y mantiene la actual; contraseña actual errónea → `WRONG_PASSWORD` y cuenta para el bloqueo; bloqueada → `TOO_MANY_ATTEMPTS`. | RF-09, RF-27, RF-28 |
| users | `delete-account.use-case.test.ts` | Borra la cuenta y el registro de bloqueo; contraseña errónea → `WRONG_PASSWORD` y cuenta intacta. | RF-28, RF-29 |
| users | `purge-expired-auth-data.use-case.test.ts` | Borra solo lo caducado, incluidas las copias cifradas de más de 30 s. | D-12 |
| users | `argon2-password-hasher.adapter.test.ts` | Cadena `$argon2id$v=19$m=19456,p=1,t=2$…`, verificación correcta e incorrecta, sales distintas para la misma contraseña, contraseña con caracteres no ASCII, `verifyDummy` siempre `false`. | RNF-03, D-2, D-3 |
| users | `crypto-token.adapter.test.ts` | Tokens de 43 caracteres base64url distintos en cada llamada, huella SHA-256 de 64 hex, `equals` en tiempo constante. | RNF-06, D-1 |
| users | `aes-gcm-grace-cipher.adapter.test.ts` | `seal`/`open` de ida y vuelta; IV distinto en cada cifrado; texto o etiqueta alterados y clave distinta → error; el texto cifrado no contiene los tokens. | RNF-06, D-1 |
| users | `user.schema.test.ts` | Email 254/255, formato, recorte y minúsculas; contraseña 11/12/128/129, espacios y no ASCII sin recortar; nombre 100/101 y vacío; `PATCH /me` con `email` → error. | RF-02 a RF-05, RF-26 |
| users | `auth.routes.test.ts` | Contrato de `/auth/*`: sobre, cookies con sus atributos, `data` de cada respuesta, CSRF previo y de sesión, margen de gracia, logout dos veces, sin contraseña ni tokens en ningún cuerpo. | RF-01 a RF-24, RNF-04, RNF-05, CE-01, CE-03 |
| users | `me.routes.test.ts` | Contrato de `/me`: perfil, edición, cambio de contraseña cerrando otras sesiones, borrado con cascada y cookies borradas. | RF-25 a RF-29, CE-02 |
| users | `prisma-user.repository.int.test.ts` | Email único, borrado en cascada de tareas, avisos, comprobaciones, zona y sesiones. | RF-03, RF-29, D-9 |
| users | `prisma-session.repository.int.test.ts` | Búsqueda por huellas; rotación atómica con dos renovaciones concurrentes; `deleteAllExcept`; limpieza. | RF-11, RF-13, RF-27, D-4 |
| users | `prisma-login-attempt.repository.int.test.ts`, `prisma-csrf-token.repository.int.test.ts` | Guardar, leer y limpiar. | RF-09, RF-22 |
| shared | `cors.middleware.test.ts` | Cabeceras para el origen permitido y ninguna para otros; petición previa `200` con sobre, métodos y cabeceras; método no registrado y ruta inexistente → `ROUTE_NOT_FOUND`; sin `Origin`, sin cambios. | RF-35, RF-36, principio VII |
| shared | `cookie.helper.test.ts` | Lectura de cookies (varias, ausentes, mal formadas) y atributos al escribir y borrar. | RF-07, RF-15, D-5 |
| shared | `request-context.middleware.test.ts` | Reescrito: sin `X-User-Id`; usa el `SessionContext`; hora y zona como en la 001; recuerda la zona solo con sesión y cabeceras válidas. | RF-30, RF-31, RF-32 |
| shared | `error-handler.middleware.test.ts` | Nuevos códigos con su HTTP y mensaje en español; `OPTIONS` sin preflight → `ROUTE_NOT_FOUND`. | RF-34, RF-36, RNF-02 |
| tasks, streaks, alerts | `*.routes.test.ts` | Reescritos con `signIn()`: mismas comprobaciones de la 001 con cookie y CSRF; `X-User-Id` de otro usuario no tiene efecto; sin cookie → `MISSING_TOKEN`; `POST` sin CSRF → `INVALID_CSRF_TOKEN`; `GET /me` sin hora ni zona → `200`. | RF-17 a RF-21, RF-23, RF-30 a RF-32, CE-02 |
| tasks | `task.routes.test.ts` (batería por pares) | Pares de fallos de los niveles de RF-34 (ruta, CSRF, sesión, hora, zona, validación, tarea, día): gana siempre el de menor orden, con la excepción de la decisión 19. | RF-34 |
| — | `migration` (`prisma-user.repository.int.test.ts`) | Tras migrar no quedan tareas, avisos ni zonas sin cuenta. | RF-33 |
| — | `tests/performance/api.perf.test.ts` | Añade registro, login, refresh, `GET /me` y `PATCH /me/password` al p95 < 300 ms. | RNF-01 |

CE-04 (refresh reutilizado cierra la sesión) se cubre en `refresh-session.use-case.test.ts` y `auth.routes.test.ts`; CE-05 (sin secretos legibles), en los adaptadores, en `auth.routes.test.ts` (ningún cuerpo ni log contiene contraseñas o tokens) y en los tests de integración (solo huellas en la base de datos).

## 11. Trazabilidad

| RF | Archivo(s) | Test(s) |
| :--- | :--- | :--- |
| RF-01 | `register-user.use-case.ts`, `auth.controller.ts`, `prisma-user.repository.ts` | `register-user.use-case.test.ts`, `auth.routes.test.ts` |
| RF-02 | `user.schema.ts`, `user.entity.ts` (constantes) | `user.schema.test.ts` |
| RF-03 | `user.schema.ts`, `register-user.use-case.ts`, `prisma-user.repository.ts` (índice único) | `user.schema.test.ts`, `register-user.use-case.test.ts`, `prisma-user.repository.int.test.ts` |
| RF-04 | `user.schema.ts` | `user.schema.test.ts`, `auth.routes.test.ts` |
| RF-05 | `user.schema.ts`, `user.entity.ts` | `user.schema.test.ts`, `user.entity.test.ts`, `update-profile.use-case.test.ts` |
| RF-06 | `register-user.use-case.ts`, `auth.controller.ts` | `register-user.use-case.test.ts`, `auth.routes.test.ts` |
| RF-07 | `login.use-case.ts`, `session.entity.ts`, `crypto-token.adapter.ts`, `cookie.helper.ts` | `login.use-case.test.ts`, `session.entity.test.ts`, `auth.routes.test.ts` |
| RF-08 | `login.use-case.ts`, `argon2-password-hasher.adapter.ts` (`verifyDummy`) | `login.use-case.test.ts`, `argon2-password-hasher.adapter.test.ts` |
| RF-09 | `login-throttle.value-object.ts`, `login.use-case.ts`, `change-password.use-case.ts`, `delete-account.use-case.ts`, `prisma-login-attempt.repository.ts` | `login-throttle.value-object.test.ts`, `login.use-case.test.ts`, `change-password.use-case.test.ts`, `prisma-login-attempt.repository.int.test.ts` |
| RF-10 | `login.use-case.ts` | `login.use-case.test.ts` |
| RF-11 | `session.entity.ts`, `refresh-session.use-case.ts`, `prisma-session.repository.ts` | `session.entity.test.ts`, `refresh-session.use-case.test.ts`, `prisma-session.repository.int.test.ts` |
| RF-12 | `session.entity.ts`, `refresh-session.use-case.ts` | `session.entity.test.ts`, `refresh-session.use-case.test.ts` |
| RF-13 | `session.entity.ts`, `refresh-session.use-case.ts`, `aes-gcm-grace-cipher.adapter.ts`, `prisma-session.repository.ts` (`refresh_tokens`, `grace_tokens`) | `refresh-session.use-case.test.ts`, `aes-gcm-grace-cipher.adapter.test.ts`, `prisma-session.repository.int.test.ts`, `auth.routes.test.ts` |
| RF-14 | `refresh-session.use-case.ts`, `session.middleware.ts` | `refresh-session.use-case.test.ts`, `auth.routes.test.ts` |
| RF-15 | `logout.use-case.ts`, `session.middleware.ts`, `cookie.helper.ts` | `logout.use-case.test.ts`, `auth.routes.test.ts` |
| RF-16 | `login.use-case.ts`, `prisma-session.repository.ts` | `login.use-case.test.ts`, `logout.use-case.test.ts` |
| RF-17 a RF-20 | `authenticate-session.use-case.ts`, `session.middleware.ts`, `cookie.helper.ts` | `authenticate-session.use-case.test.ts`, `*.routes.test.ts` |
| RF-21 | `session.middleware.ts` (`SessionContext`), casos de uso de la 001 y de `users` (filtro por `userId`) | `task.routes.test.ts`, `me.routes.test.ts` |
| RF-22 | `issue-csrf-token.use-case.ts`, `presession-csrf.middleware.ts`, `prisma-csrf-token.repository.ts` | `issue-csrf-token.use-case.test.ts`, `auth.routes.test.ts`, `prisma-csrf-token.repository.int.test.ts` |
| RF-23 | `presession-csrf.middleware.ts`, `session.middleware.ts`, `verify-session-csrf.use-case.ts` | `verify-session-csrf.use-case.test.ts`, `auth.routes.test.ts`, `task.routes.test.ts` |
| RF-24 | `login.use-case.ts`, `refresh-session.use-case.ts`, `crypto-token.adapter.ts` | `login.use-case.test.ts`, `refresh-session.use-case.test.ts` |
| RF-25 | `get-profile.use-case.ts`, `user.mapper.ts`, `me.controller.ts` | `get-profile.use-case.test.ts`, `me.routes.test.ts` |
| RF-26 | `update-profile.use-case.ts`, `user.schema.ts` | `update-profile.use-case.test.ts`, `user.schema.test.ts`, `me.routes.test.ts` |
| RF-27 | `change-password.use-case.ts`, `prisma-session.repository.ts` (`deleteAllExcept`) | `change-password.use-case.test.ts`, `me.routes.test.ts` |
| RF-28 | `change-password.use-case.ts`, `delete-account.use-case.ts` | `change-password.use-case.test.ts`, `delete-account.use-case.test.ts` |
| RF-29 | `delete-account.use-case.ts`, `prisma-user.repository.ts`, migración (claves foráneas en cascada) | `delete-account.use-case.test.ts`, `prisma-user.repository.int.test.ts`, `me.routes.test.ts` |
| RF-30 | Rutas de `tasks`, `streaks` y `alerts` (`request-context` solo ahí), `me.routes.ts` (sin él) | `*.routes.test.ts` |
| RF-31 | `request-context.middleware.ts` | `request-context.middleware.test.ts` |
| RF-32 | `request-header.schema.ts`, `request-context.middleware.ts`, `error-code.constant.ts` (sin `MISSING_USER`) | `request-context.middleware.test.ts`, `task.routes.test.ts` |
| RF-33 | Migración `<…>_user_accounts` | `prisma-user.repository.int.test.ts` |
| RF-34 | `error-code.constant.ts`, `session.middleware.ts`, `presession-csrf.middleware.ts`, orden de montaje de las rutas | `task.routes.test.ts` (batería por pares), `auth.routes.test.ts`, `error-handler.middleware.test.ts` |
| RF-35, RF-36 | `cors.middleware.ts`, `allowed-method.middleware.ts`, `app.config.ts` (`CORS_ORIGIN`) | `cors.middleware.test.ts`, `auth.routes.test.ts` |
| RNF-01 | D-2, índices de la sección 4 | `api.perf.test.ts` |
| RNF-02 | `error-code.constant.ts`, controladores | Todos los `*.routes.test.ts` |
| RNF-03 | `argon2-password-hasher.adapter.ts` | `argon2-password-hasher.adapter.test.ts`, `register-user.use-case.test.ts` |
| RNF-04 | `user.mapper.ts`, `error-handler.middleware.ts` | `auth.routes.test.ts`, `me.routes.test.ts` |
| RNF-05 | `cookie.helper.ts`, controladores de `users` | `auth.routes.test.ts`, `cookie.helper.test.ts` |
| RNF-06 | `crypto-token.adapter.ts`, `aes-gcm-grace-cipher.adapter.ts`, repositorios Prisma (solo huellas y la copia cifrada de 30 s) | `crypto-token.adapter.test.ts`, `aes-gcm-grace-cipher.adapter.test.ts`, `prisma-session.repository.int.test.ts` |
