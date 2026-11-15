# Plan: Protección frente a bots con Cloudflare Turnstile en el login y el registro
Spec: `sdd/005-turnstile-bot-protection/spec.md` (Aprobada) · Estado: Aprobado · Fecha: 2026-11-15

Los RF, RNF, CE y S de este plan son los de la spec 005; cuando se cita otra funcionalidad se indica («RF-09 de la 002», «D-12 de la 002»). Las decisiones de este plan se numeran D-1, D-2… dentro de la 005.

## 1. Resumen técnico

`POST /auth/login` y `POST /auth/register` aceptan un campo nuevo, `turnstileToken`. Su schema Zod se construye al arrancar según el modo: obligatorio u opcional (`TURNSTILE_ENFORCE`). Si el token llega, el caso de uso de login o de registro llama primero a un caso de uso nuevo del módulo `users`, `VerifyTurnstileUseCase`, que hace tres cosas:
1. **Reserva la huella SHA-256 del token** durante 300 s en una tabla nueva, `turnstile_tokens`, con un `INSERT … ON CONFLICT` atómico. Con una clave secreta de prueba se salta este paso (RF-33).
2. **Consulta a Cloudflare** a través de un puerto nuevo, `TurnstileVerifier`. Su adaptador usa el `fetch` nativo de Node 22 con `AbortSignal.timeout`, envía una clave de idempotencia y valida la respuesta con Zod.
3. **Decide el resultado** con una regla de dominio pura, `TurnstileVerdict`, que comprueba `success`, la acción, el host y los códigos de error. Si el fallo es reintentable, repite la consulta una sola vez dentro de los 5 s.

El resultado es seguir adelante, `TURNSTILE_FAILED` (`403`) o `TURNSTILE_UNAVAILABLE` (`503`). Ambos códigos ocupan un nivel nuevo de precedencia entre `VALIDATION_ERROR` y los errores de negocio. Como la verificación ocurre antes de leer el bloqueo y las credenciales, un rechazo no cuenta para RF-09 de la 002 ni revela si el email existe. La configuración se valida al arrancar: tres variables nuevas, que en producción no admiten hosts locales ni claves de prueba. La limpieza de cada minuto de la 002 borra además las huellas caducadas. No hay dependencias nuevas.

## 2. Comprobación constitucional

**Excepciones usadas:** ninguna.

| Principio | Cómo lo cumple este plan | Estado |
| :--- | :--- | :--- |
| **I. Stack cerrado** | Sin dependencias nuevas: la llamada a Cloudflare usa el `fetch` global de Node 22 (`engines: >=22.12.0`, imagen `node:22-alpine`) con `AbortSignal.timeout`; las huellas, `node:crypto` (ya en uso); la validación de la respuesta, Zod. Alternativas con dependencia descartadas en la sección 8. | ✅ |
| **II. Sin spec no hay cambio** | Todo el comportamiento sale de la spec 005 (*Aprobada*): campo y modos (RF-01, RF-02, RF-15 a RF-17), verificación (RF-03 a RF-09b, RF-28, RF-29), precedencia (RF-14), configuración (RF-18, RF-19), idempotencia (RF-20 a RF-27, RF-30 a RF-33). Las decisiones de la sección 7 son técnicas o las delega la spec (S-05, S-07). | ✅ |
| **III. Tests y calidad** | Caso de uso nuevo con su test (`verify-turnstile.use-case.test.ts`); la regla de dominio (`turnstile-verdict.value-object.ts`) con el suyo; se amplían los de login, registro, limpieza, configuración, schemas, rutas y precedencia (sección 10). Cloudflare se simula siempre (RNF-04). Código según AGENTS.md §8: constantes con nombre (300 s, 5 s, 3 s, 2048), sin `any`, promesas esperadas, `catch` que convierten en un resultado tipado. | ✅ |
| **IV. Migraciones y secretos** | Una migración nueva (`<AAAAMMDDHHMMSS>_turnstile_tokens`) crea la tabla. `TURNSTILE_SECRET` vive solo en `.env.dev` y `.env.prod`; `.env.example` lista las variables sin valor; la clave nunca se registra (RNF-02). | ✅ |
| **V. Separación hexagonal** | `domain/` gana dos puertos (`TurnstileVerifier`, `TurnstileTokenRepository`) y una regla pura (`TurnstileVerdict`) sin frameworks. `application/` solo importa de `domain/` y `src/shared/`. `fetch`, Zod y Prisma quedan en `infrastructure/`. La respuesta de Cloudflare, entrada externa, se valida con Zod en el adaptador. Ningún otro módulo cambia. | ✅ |
| **VI. Clarificar antes de suponer** | La spec está *Aprobada* y sin marcas `[NEEDS CLARIFICATION]`. Las dudas que aparecieron al planificar (campos desconocidos y token ficticio de las claves de prueba) se clarificaron con el usuario el 2026-11-15 y están en la spec. | ✅ |
| **VII. Formato de respuesta único** | Los dos códigos nuevos se añaden a `ERROR_CODES` y salen por el `errorHandlerMiddleware` con el sobre de error, como el resto. Las respuestas de éxito no cambian. | ✅ |

## 3. Estructura de archivos

### Raíz y configuración

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `prisma/schema.prisma` | Modificado | Modelo `TurnstileToken` (tabla `turnstile_tokens`), con su comentario. |
| `prisma/migrations/<AAAAMMDDHHMMSS>_turnstile_tokens/migration.sql` | Nuevo | Crea la tabla y su índice (sección 4). Se genera con `prisma migrate diff` (AGENTS.md §3). |
| `.env.example` | Modificado | `TURNSTILE_SECRET=`, `TURNSTILE_ALLOWED_HOSTNAMES=` y `TURNSTILE_ENFORCE=`, sin valores, con un comentario. |
| `AGENTS.md` | Modificado | §3, *Configuración inicial*: las tres variables nuevas, sus valores de desarrollo (clave de prueba, `example.com,localhost`, `false` o `true`) y de producción, que la API no arranca sin ellas y el orden de despliegue de S-06. |
| `README.md` | Modificado | Estado de la 005, cuerpo de `POST /auth/login` y `POST /auth/register`, códigos de error, variables de entorno, Postman y estructura de `sdd/005-…` (Gobierno 7). |

### `src/shared/`

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `domain/error-code.constant.ts` | Modificado | `TURNSTILE_FAILED` (`403`) y `TURNSTILE_UNAVAILABLE` (`503`) en el orden 7; los errores de negocio pasan al 8 y `DAY_CLOSED`/`DAY_NOT_STARTED` al 9 (D-9). |
| `infrastructure/config/app.config.ts` | Modificado | Lee y valida `TURNSTILE_SECRET`, `TURNSTILE_ALLOWED_HOSTNAMES`, `TURNSTILE_ENFORCE` y `NODE_ENV`. `AppConfig` gana `turnstile: { secret, allowedHostnames, enforce, usesTestSecret }` (RF-18, RF-19, D-7). |

### `src/modules/users/`

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `domain/turnstile-verifier.port.ts` | Nuevo | Puerto `TurnstileVerifier`: `siteverify({ token, idempotencyKey, timeoutMs })` → `SiteverifyOutcome`, que es `{ kind: 'answered', success, hostname, action, errorCodes }`, `{ kind: 'http-error', status }` o `{ kind: 'unreachable' }` (error de red, tiempo agotado o respuesta ilegible). Nunca lanza (D-4). |
| `domain/turnstile-token.repository.ts` | Nuevo | Puerto `TurnstileTokenRepository`: `reserve(tokenHash, now, expiresAt): Promise<boolean>` (`false` si ya está reservado y no ha caducado) y `deleteExpired(now)`. |
| `domain/turnstile-verdict.value-object.ts` | Nuevo | Regla pura: dado un `SiteverifyOutcome`, la acción esperada, los hosts permitidos y si se comprueba la acción, devuelve `passed`, `failed`, `unavailable` o `retry` (5.3). Exporta las constantes `TURNSTILE_TOKEN_TTL_MS` (300 000), `TURNSTILE_TOTAL_TIMEOUT_MS` (5 000), `TURNSTILE_FIRST_ATTEMPT_TIMEOUT_MS` (3 000) y `TURNSTILE_TOKEN_MAX_LENGTH` (2 048). |
| `domain/token.port.ts` | Modificado | `TokenService` gana `randomUuid(): string`, para la clave de idempotencia (RF-24, RNF-06). |
| `application/verify-turnstile.use-case.ts` | Nuevo | `execute({ token, action })`: reserva (salvo con clave de prueba), consulta con reintento único, veredicto y aviso de configuración (5.2). Lanza `TURNSTILE_FAILED` o `TURNSTILE_UNAVAILABLE`. |
| `application/login.use-case.ts` | Modificado | `LoginInput` gana `turnstileToken?: string`. Si llega, `verifyTurnstile.execute({ token, action: 'login' })` es lo primero, antes de leer el bloqueo (RF-03, RF-12, RF-13). |
| `application/register-user.use-case.ts` | Modificado | `RegisterUserInput` gana `turnstileToken?: string`. Si llega, se verifica con la acción `register` antes de `findByEmail` (RF-04, RF-13). |
| `application/purge-expired-auth-data.use-case.ts` | Modificado | Recibe `TurnstileTokenRepository` y llama a `deleteExpired(now)` en cada pasada (RF-31, D-6). |
| `infrastructure/cloudflare-turnstile-verifier.adapter.ts` | Nuevo | `CloudflareTurnstileVerifier`: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` con `secret`, `response` e `idempotency_key` en un cuerpo `application/x-www-form-urlencoded`, `AbortSignal.timeout(timeoutMs)`, y respuesta validada con Zod. Cualquier excepción se convierte en `unreachable` sin registrar el cuerpo (RNF-02). Sin `remoteip` (D-5). |
| `infrastructure/prisma-turnstile-token.repository.ts` | Nuevo | `reserve` con `$executeRaw` en plantilla etiquetada: `INSERT … ON CONFLICT (token_hash) DO UPDATE … WHERE expires_at <= now` y `true` si afecta a una fila (D-3). `deleteExpired` con `deleteMany`. |
| `infrastructure/user.schema.ts` | Modificado | `createAuthBodySchemas({ turnstileRequired })` devuelve `registerBodySchema` y `loginBodySchema` con `turnstileToken`: `z.string().min(1).max(2048)`, obligatorio u `.optional()` según el modo (RF-01, RF-02, RF-17). Siguen siendo `z.object`, así que los campos desconocidos se ignoran (clarificación de la spec). Los schemas de `/me` no cambian. |
| `infrastructure/auth.controller.ts` | Modificado | Recibe los schemas construidos en el constructor en lugar de importarlos. Pasa `turnstileToken` a los casos de uso. |

### `src/` (raíz)

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `dependency.container.ts` | Modificado | Crea `PrismaTurnstileTokenRepository`, `CloudflareTurnstileVerifier(config.turnstile.secret)` y un `VerifyTurnstileUseCase` con los hosts permitidos y `checkReplayAndAction = !usesTestSecret`. Se lo pasa al login y al registro, pasa el repositorio a la limpieza y construye los schemas con `turnstileRequired = config.turnstile.enforce`. |

### `tests/` y documentación

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `tests/support/fake-turnstile-verifier.adapter.ts` | Nuevo | Devuelve una cola de resultados programados (por defecto, `success: true` con acción y host válidos), cuenta las llamadas y guarda las claves de idempotencia y los tiempos máximos recibidos. |
| `tests/support/in-memory-turnstile-token.repository.ts` | Nuevo | `Map` de huella → caducidad con la misma semántica que el repositorio de Prisma. |
| `tests/support/test.container.ts` | Modificado | Cablea el verificador simulado y el repositorio en memoria, con opciones `turnstile: { enforce, testSecret }` (por defecto: obligatorio y clave real). `signIn` añade un `turnstileToken` distinto en cada petición (`randomUUID()`). Expone el verificador simulado. |
| `tests/performance/api.perf.test.ts` | Modificado | Envía un token distinto en cada login y registro medidos, con el verificador simulado. |
| `sdd/001-…`, `sdd/002-…`, `sdd/004-…` `*.postman-collection.json` | Modificado | Login y registro envían `turnstileToken: "XXXX.DUMMY.TOKEN.XXXX"`. Se ejecutan contra una API con la clave de prueba que siempre pasa (S-01, RF-33). |
| `sdd/005-turnstile-bot-protection/turnstile-bot-protection.postman-collection.json` | Nuevo | Flujo (login y registro con el token ficticio y la clave que pasa) y errores (token vacío, de 2049 caracteres o ausente en modo obligatorio). Los casos que necesitan otra clave de prueba están en la guía. |
| `sdd/005-turnstile-bot-protection/quickstart.md` | Nuevo | Pruebas manuales QS-01… con las tres claves de prueba, los dos modos, Cloudflare inaccesible y QS-R contra producción con la clave real. |
| `sdd/005-turnstile-bot-protection/tasks.md` | Nuevo | Desglose de este plan, tras su aprobación. |

## 4. Modelo de datos

### `turnstile_tokens` (nueva)

| Columna | Tipo | Restricciones | Notas |
| :--- | :--- | :--- | :--- |
| `token_hash` | `CHAR(64)` | PK | SHA-256 en hexadecimal del token (`TokenService.fingerprint`). Nunca el token en claro, y sin relación con el email ni con la cuenta (RF-23). |
| `expires_at` | `TIMESTAMPTZ(3)` | NOT NULL, índice | Instante de la reserva + 300 s (RF-20). Una fila caducada cuenta como libre (D-3) y la limpieza la borra (RF-31). |

Mismo diseño que `csrf_tokens` de la 002: huella como clave primaria e índice por caducidad para la limpieza.

### Migración

```sql
-- Huellas de los tokens de Turnstile recibidos en los últimos 300 s: un token se acepta una sola vez (RF-20 a RF-23 de la 005)
CREATE TABLE "turnstile_tokens" (
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "turnstile_tokens_pkey" PRIMARY KEY ("token_hash")
);

CREATE INDEX "turnstile_tokens_expires_at_idx" ON "turnstile_tokens"("expires_at");
```

## 5. Lógica principal

### 5.1 Orden de una petición (RF-14; RF-34 de la 002)
1. `presessionCsrf` → `INVALID_CSRF_TOKEN` (orden 2).
2. `jsonBodyMiddleware` y `parseOrThrow` con el schema del modo → `VALIDATION_ERROR` (orden 6), incluido `turnstileToken` vacío, de más de 2048 caracteres, de otro tipo o ausente en modo obligatorio (RF-02, RF-17). Todavía no se ha consultado a Cloudflare.
3. Caso de uso: si hay `turnstileToken`, `VerifyTurnstileUseCase` → `TURNSTILE_FAILED` o `TURNSTILE_UNAVAILABLE` (orden 7). En modo opcional, sin token, se salta este paso (RF-15).
4. Solo después, lo de la 002: bloqueo (`TOO_MANY_ATTEMPTS`), credenciales (`INVALID_CREDENTIALS`) o email repetido (`EMAIL_ALREADY_REGISTERED`), en el orden 8. Por eso un rechazo de Turnstile no toca `login_attempts` (RF-12) y responde igual exista o no el email (RF-11, RF-13).

### 5.2 `VerifyTurnstileUseCase` (RF-05 a RF-09b, RF-20 a RF-26, RF-28 a RF-33)
1. Con clave real (`checkReplayAndAction = true`): `reserve(fingerprint(token), now, now + 300 s)`. Si devuelve `false`, el token ya se recibió → `TURNSTILE_FAILED` sin consultar a Cloudflare (RF-21). La reserva no se deshace nunca, pase lo que pase después (RF-30). Con clave de prueba no se reserva (RF-33).
2. `idempotencyKey = tokens.randomUuid()`, una por petición (RF-24).
3. Primer intento: `siteverify({ token, idempotencyKey, timeoutMs: 3000 })`.
4. `TurnstileVerdict.evaluate(outcome)` (5.3):
   - `passed` → sigue el login o el registro.
   - `failed` → `TURNSTILE_FAILED`.
   - `unavailable` → `TURNSTILE_UNAVAILABLE`.
   - `retry` → paso 5.
5. Reintento: si queda tiempo de los 5 s (`5000 − transcurrido` > 0, medido con `Clock`), una sola consulta más con el mismo token, la misma clave y ese tiempo restante (RF-25). Su veredicto es definitivo, y `retry` se trata como `unavailable` (RF-28). Si no queda tiempo → `TURNSTILE_UNAVAILABLE` (RF-09).
6. Si la última respuesta trae `missing-input-secret` o `invalid-input-secret`, se registra `{"event":"TURNSTILE_MISCONFIGURED","errorCodes":[…]}` con `console.warn`, sin la clave, el token ni la clave de idempotencia (RF-09b, RNF-02, RNF-06).

### 5.3 Veredicto (`TurnstileVerdict`)

| Resultado de Cloudflare | Veredicto | RF |
| :--- | :--- | :--- |
| `unreachable` (red, tiempo agotado, JSON ilegible) o `http-error` 5xx | `retry` | RF-25, RF-28 |
| `http-error` 4xx | `unavailable` | RF-28 |
| `errorCodes` contiene `internal-error` | `retry` | RF-25, RF-29 |
| `errorCodes` contiene `bad-request`, `missing-input-secret` o `invalid-input-secret` | `unavailable` | RF-26, RF-29 |
| `success` distinto de `true` (resto de casos: `invalid-input-response`, `timeout-or-duplicate`, `missing-input-response`, códigos desconocidos) | `failed` | RF-05, RF-08 |
| `success: true` y `hostname` fuera de la lista permitida (comparación exacta, en minúsculas) | `failed` | RF-07 |
| `success: true`, con la acción comprobada, y `action` distinta de la esperada o ausente | `failed` | RF-06 |
| `success: true` y todo lo anterior correcto (o la acción sin comprobar, RF-06b) | `passed` | RF-03, RF-04 |

Las filas se evalúan en este orden: los errores que no dependen del token van antes que `success`, porque Cloudflare los devuelve con `success: false`.

### 5.4 Configuración al arrancar (RF-18, RF-19, RNF-05)
- `TURNSTILE_SECRET`: obligatoria y no vacía.
- `TURNSTILE_ALLOWED_HOSTNAMES`: lista separada por comas; se recortan los espacios, se pasa a minúsculas y se descartan los elementos vacíos. Hace falta al menos uno.
- `TURNSTILE_ENFORCE`: obligatoria, `true` o `false`, sin valor por defecto (D-7).
- `usesTestSecret`: la clave es una de las tres claves secretas de prueba de Cloudflare (S-02), guardadas en una constante con nombre.
- Si `NODE_ENV=production` (lo fija `Dockerfile.prod`): se rechazan `localhost`, `127.0.0.1`, `::1` y `[::1]` en la lista, y cualquier clave de prueba.

Los mensajes de error nombran la variable y nunca muestran su valor, como ya hace `loadAppConfig`.

### 5.5 Limpieza (RF-31)
`PurgeExpiredAuthDataUseCase`, que corre al arrancar y cada minuto (D-12 de la 002), borra además las filas con `expires_at <= now`. La exactitud de los 300 s no depende de la limpieza: `reserve` trata como libre una fila caducada (D-3).

## 6. Interfaz

Contrato completo en la spec (sección *Contrato de la API*).

| Método y ruta | Entrada | Salida (`data`) | Errores posibles (por precedencia) |
| :--- | :--- | :--- | :--- |
| `POST /auth/login` | `X-CSRF-Token` previo; `{ email, password, turnstileToken }` (`turnstileToken` opcional en modo opcional) | Sin cambios: `200`, cookies y `{ user, csrfToken }` | `INVALID_CSRF_TOKEN`; `VALIDATION_ERROR`; `TURNSTILE_FAILED`, `TURNSTILE_UNAVAILABLE`; `TOO_MANY_ATTEMPTS`, `INVALID_CREDENTIALS` |
| `POST /auth/register` | `X-CSRF-Token` previo; `{ email, password, name?, turnstileToken }` | Sin cambios: `201`, `User` | `INVALID_CSRF_TOKEN`; `VALIDATION_ERROR`; `TURNSTILE_FAILED`, `TURNSTILE_UNAVAILABLE`; `EMAIL_ALREADY_REGISTERED` |

Variables de entorno nuevas (en `.env.dev` y `.env.prod`, nunca versionadas):

| Variable | Desarrollo y E2E | Producción |
| :--- | :--- | :--- |
| `TURNSTILE_SECRET` | `1x0000000000000000000000000000000AA` (siempre pasa); `2x…AA` y `3x…AA` para probar fallos | Clave secreta del widget, solo en `.env.prod` |
| `TURNSTILE_ALLOWED_HOSTNAMES` | `example.com,localhost` (las claves de prueba devuelven `example.com`, S-03) | `kompitu.yandrydev.cloud` |
| `TURNSTILE_ENFORCE` | `true` (o `false` para probar el modo opcional) | `false` hasta que el frontend con el widget esté desplegado; después, `true` (S-06) |

## 7. Decisiones técnicas

| ID | Decisión | Por qué | Alternativas descartadas |
| :--- | :--- | :--- | :--- |
| D-1 | La verificación vive en el módulo `users`, como caso de uso propio (`VerifyTurnstileUseCase`) que llaman `LoginUseCase` y `RegisterUserUseCase` como primer paso. | Solo protege dos rutas de `users` (alcance de la spec). El orden «Turnstile antes que el bloqueo y las credenciales» (RF-03, RF-04, RF-12, RF-13) queda dentro de los casos de uso y se prueba sin HTTP. | Un middleware de Express (el orden respecto a la validación del cuerpo y el modo opcional quedarían fuera de los tests de los casos de uso); un módulo `turnstile` con fachada (más piezas para dos usos); el controlador llamando a los dos casos de uso (la regla de orden quedaría en `infrastructure/`). |
| D-2 | La lógica de decisión es una regla de dominio pura (`TurnstileVerdict`), y el puerto devuelve un resultado tipado en lugar de lanzar. | Cada fila de 5.3 se prueba con una tabla de casos, sin red ni temporizadores. El caso de uso solo orquesta reserva, intentos y aviso. | Decidir dentro del adaptador (el reintento, que es un requisito de la spec, quedaría en infraestructura y sin test unitario). |
| D-3 | `reserve` con una sola sentencia: `INSERT INTO turnstile_tokens … ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at WHERE turnstile_tokens.expires_at <= ${now}`, con `$executeRaw` en plantilla etiquetada; reservado si afecta a 1 fila. | Atómica frente a peticiones simultáneas (RF-20, CE-04) sin transacciones ni bloqueos, y exacta en los 300 s aunque la limpieza no haya pasado. Parámetros enlazados (AGENTS.md §8). | `create` y capturar `P2002` (una fila caducada sin limpiar bloquearía un token que ya no es el mismo); `findUnique` y luego `create` (carrera entre las dos consultas); bloqueo en memoria (descartado en la spec). |
| D-4 | Adaptador con `fetch` nativo, cuerpo `x-www-form-urlencoded` y `AbortSignal.timeout`. Toda excepción se convierte en `unreachable`, y la respuesta se valida con un schema Zod (`success` booleano, `hostname`, `action` y `error-codes` opcionales). | Sin dependencias (principio I). Un JSON inesperado no puede colarse como `passed`: si no cumple el schema, se trata como `unreachable`. Ningún error lleva la petición, que contiene la clave, al registro de `errorHandlerMiddleware` (RNF-02). | `axios`, `undici` o `node-fetch` (dependencias innecesarias en Node 22); el SDK de Cloudflare (no existe uno oficial para siteverify). |
| D-5 | No se envía `remoteip` (S-05). | En producción la API se publica detrás de un proxy inverso (`apikompitu.yandrydev.cloud` hacia el puerto del contenedor) y Express no tiene `trust proxy` configurado, así que `req.ip` sería la IP del proxy. Enviar una IP equivocada empeora la detección de Cloudflare, y es un parámetro opcional. Configurar `trust proxy` sería un cambio transversal fuera del alcance de la spec. | Enviar `req.ip` (IP incorrecta); leer `X-Forwarded-For` a mano (falsificable sin `trust proxy`). |
| D-6 | La limpieza de las huellas caducadas se añade a `PurgeExpiredAuthDataUseCase` de la 002. | Ya corre cada minuto, sin solapar pasadas, con los otros datos caducados de `/auth` (D-12 de la 002). Ni planificador ni proceso nuevos. | Un planificador propio (duplicaría `AuthCleanupScheduler`); borrar al reservar (añade una escritura a cada login). |
| D-7 | `TURNSTILE_ENFORCE` es obligatoria, sin valor por defecto. | Un despliegue que olvida la variable no arranca, en lugar de quedarse en silencio en modo opcional (sin protección) u obligatorio (sin acceso, si el frontend aún no envía el token). Sigue el criterio de D-11 de la 002: la API no arranca con la configuración incompleta. | `false` por defecto (producción podría quedarse sin protección sin que nadie lo note); `true` por defecto (cortaría el acceso en el primer despliegue, S-06). |
| D-8 | Reparto de los 5 s (S-07): el primer intento tiene como máximo 3 s y el reintento, el tiempo restante hasta 5 s. | Una consulta normal a siteverify tarda mucho menos de 1 s. Con 3 s, un primer intento colgado deja unos 2 s útiles para el reintento, en lugar de agotar el presupuesto y responder `503` sin reintentar. | 5 s para el primero (un cuelgue anula el reintento); 2,5 s cada uno (tiempo fijo para el reintento aunque el primero falle enseguida). |
| D-9 | Los dos códigos nuevos van en el orden 7; los errores de negocio pasan al 8 y `DAY_CLOSED`/`DAY_NOT_STARTED` al 9. | `error-handler.middleware.test.ts` exige órdenes consecutivos (1, 2, 3…), y RF-14 pide un nivel propio entre `VALIDATION_ERROR` y los errores de negocio. El orden relativo de todo lo existente no cambia. | Un orden fraccionario (`6.5`): rompe la convención de enteros consecutivos que comprueba el test. |
| D-10 | La clave de idempotencia sale de `TokenService.randomUuid()` (`crypto.randomUUID()`). | Una por petición, generada en el caso de uso para que el reintento la repita (RF-24), con un generador seguro (RNF-06, AGENTS.md §8). `TokenService` ya agrupa los valores aleatorios del módulo. | Generarla en el adaptador (no podría repetirse entre dos llamadas sin guardar estado); un puerto nuevo solo para eso. |
| D-11 | Los schemas de login y registro se construyen al arrancar con `createAuthBodySchemas({ turnstileRequired })` y se inyectan en `AuthController`. | El modo es configuración por entorno (RNF-05), y así `VALIDATION_ERROR` por token ausente (RF-17) sale de la misma validación Zod que el resto del cuerpo, con `details`. | Comprobar la ausencia en el caso de uso (la validación quedaría fuera de Zod, contra el principio V, y la precedencia de RF-14 sería más difícil de garantizar). |

## 8. Complexity Tracking

### Dependencias

Ninguna nueva:
- La llamada HTTP usa el `fetch` global de Node 22 con `AbortSignal.timeout`.
- La huella y la clave de idempotencia usan `node:crypto` (`createHash`, `randomUUID`).
- La respuesta se valida con Zod.

### Piezas nuevas

| Pieza | Por qué hace falta | Alternativa más simple descartada |
| :--- | :--- | :--- |
| Tabla `turnstile_tokens` y su repositorio | Un solo uso garantizado con peticiones simultáneas y varias instancias (RF-20 a RF-23). | Memoria del proceso (descartada en la spec). |
| Puerto `TurnstileVerifier` y `CloudflareTurnstileVerifier` | Consultar a Cloudflare sin acoplar `application/` a HTTP (principio V) y simularlo en los tests (RNF-04). | Llamar a `fetch` desde el caso de uso. |
| `TurnstileVerdict` | Las reglas de 5.3, probadas sin red (D-2). | Condiciones dentro del caso de uso (más complejidad cognitiva, AGENTS.md §8). |
| `VerifyTurnstileUseCase` | Reserva, intentos, presupuesto de tiempo y aviso, compartidos por el login y el registro (D-1). | Duplicarlo en los dos casos de uso. |
| Tres variables de entorno | Clave secreta, hosts y modo por entorno (RNF-02, RNF-05). | Valores en el código (prohibido por RNF-02 y el principio IV). |

## 9. Riesgos

| ID | Riesgo | Mitigación |
| :--- | :--- | :--- |
| R-1 | Al desplegar, `.env.dev` o `.env.prod` no tienen las variables nuevas y la API no arranca (también `dependency.container.test.ts`, que usa la configuración real). | Es lo que pide RF-18 (D-7). AGENTS.md §3, `.env.example` y la guía lo indican; el usuario añade las variables antes de levantar la versión nueva. |
| R-2 | Producción pasa a `TURNSTILE_ENFORCE=true` antes de que el frontend envíe el token, y nadie puede entrar. | Orden de S-06 en AGENTS.md y en QS-R. Volver a `false` y reiniciar la API lo arregla sin migraciones. |
| R-3 | Cloudflare cae y nadie puede iniciar sesión ni registrarse (fallo cerrado, RF-09). | Decisión de la spec. Las sesiones abiertas siguen funcionando, y la renovación (`/auth/refresh`) no depende de Cloudflare. El `503` lo distingue el frontend. |
| R-4 | La acción del widget en el frontend no es `login`/`register`, y todos los logins con la clave real responden `TURNSTILE_FAILED`. | Contrato acordado con TaskFrontSDD (P-02). QS-R lo prueba con la clave real antes de activar el modo obligatorio, y en modo opcional se ve en los registros sin cortar el acceso a quien no envía el token. |
| R-5 | El dominio del frontend cambia y su host no está en `TURNSTILE_ALLOWED_HOSTNAMES`. | La lista se configura por entorno sin tocar el código (RNF-05); QS-R lo comprueba. |
| R-6 | `prisma migrate dev` aborta sin terminal interactiva. | Alternativa no interactiva de AGENTS.md §3 (`prisma migrate diff` + `migrate deploy`). |
| R-7 | Muchos tests y colecciones hacen login o registro, y fallarían en modo obligatorio. | `signIn` y el contenedor de tests envían un token distinto cada vez con el verificador simulado; las colecciones de Postman envían el token ficticio contra la clave de prueba, que no lo reserva (RF-33). |
| R-8 | Un error de la consulta acaba en los registros con la clave secreta. | El adaptador nunca lanza (D-4), y el aviso de RF-09b solo incluye los códigos de error. Un test comprueba que ningún `console.*` recibe la clave ni el token. |

## 10. Estrategia de tests

Mismos tipos y ubicación que en la 002 (subcarpeta `tests/` junto a cada fichero). Cloudflare se simula siempre (RNF-04): con el verificador simulado en los casos de uso y las rutas, y con un `fetch` sustituido en el adaptador.

| Módulo | Test | Qué comprueba | RF / RNF / CE |
| :--- | :--- | :--- | :--- |
| users | `turnstile-verdict.value-object.test.ts` (nuevo) | Cada fila de 5.3 y su orden: `success` sí/no, acción distinta, ausente o no comprobada, host fuera de la lista y en mayúsculas, cada código de error, 4xx, 5xx y `unreachable`. | RF-05 a RF-08, RF-06b, RF-25, RF-26, RF-28, RF-29 |
| users | `verify-turnstile.use-case.test.ts` (nuevo) | Éxito; token repetido → `TURNSTILE_FAILED` sin consultar; reserva antes de consultar y que no se libera tras un rechazo, un `503` o un error posterior; con clave de prueba, el mismo token dos veces → dos consultas y ninguna reserva; reintento único con la misma clave de idempotencia tras `unreachable`, `5xx` o `internal-error`, y su resultado; sin reintento con `invalid-input-secret`, `bad-request` o rechazo del token; tiempo del primer intento 3 s, del segundo el restante, y sin reintento si no queda tiempo (reloj simulado); aviso `TURNSTILE_MISCONFIGURED` sin la clave ni el token; clave de idempotencia distinta entre peticiones. | RF-09, RF-09b, RF-20 a RF-26, RF-30, RF-33, RNF-02, RNF-03, RNF-06, CE-04 |
| users | `login.use-case.test.ts` | Con token rechazado: no lee el bloqueo, no registra fallo, no comprueba la contraseña, no abre sesión; mismo error con email existente e inexistente; con 10 rechazos, el login correcto entra; sin token, como en la 002; con token válido y email bloqueado → `TOO_MANY_ATTEMPTS`. | RF-03, RF-10 a RF-13, RF-15, CE-02 |
| users | `register-user.use-case.test.ts` | Con token rechazado y email existente → `TURNSTILE_FAILED`, sin crear la cuenta; con token válido, crea; sin token, como en la 002. | RF-04, RF-10, RF-13, CE-01 |
| users | `purge-expired-auth-data.use-case.test.ts` | Borra las huellas caducadas y conserva las vigentes. | RF-31 |
| users | `cloudflare-turnstile-verifier.adapter.test.ts` (nuevo) | Con `fetch` sustituido: URL, método, cuerpo con `secret`, `response` e `idempotency_key` y sin `remoteip`; respuesta válida → `answered`; 4xx/5xx → `http-error`; JSON ilegible o fuera del schema → `unreachable`; excepción y tiempo agotado → `unreachable`; nada se registra. | RF-24, RNF-02, RNF-03, D-4, D-5 |
| users | `prisma-turnstile-token.repository.int.test.ts` (nuevo) | Primera reserva `true`; segunda `false`; 20 reservas simultáneas del mismo hash → solo una `true`; una fila caducada se puede volver a reservar; `deleteExpired` borra solo las caducadas. | RF-20 a RF-23, RF-31, CE-04 |
| users | `user.schema.test.ts` | `turnstileToken` de 1 y 2048 caracteres aceptado; vacío, 2049, número o `null` → error; ausente → error en modo obligatorio y aceptado en opcional; los campos desconocidos se siguen ignorando. | RF-01, RF-02, RF-15, RF-17 |
| users | `auth.routes.test.ts` | Por HTTP: `403 TURNSTILE_FAILED` y `503 TURNSTILE_UNAVAILABLE` con el sobre de error y cuerpos idénticos entre motivos; token repetido → `403`; precedencia por pares: CSRF > validación > Turnstile > bloqueo/credenciales/email repetido; modo opcional con y sin token; las respuestas de éxito no cambian. | RF-01 a RF-17, RF-21, RF-27, RF-32, CE-01, CE-03 |
| shared | `app.config.test.ts` | Faltan o están vacías las variables → error que nombra la variable sin mostrar su valor; lista normalizada; `TURNSTILE_ENFORCE` distinta de `true`/`false` → error; `usesTestSecret` con cada clave de prueba; en producción, host local o clave de prueba → error; fuera de producción, aceptados. | RF-18, RF-19, RNF-02, RNF-05 |
| shared | `error-handler.middleware.test.ts` | Precedencia consecutiva con el nivel 7 nuevo (D-9); `403` y `503` con el sobre de error. | RF-14 |
| — | `tests/performance/api.perf.test.ts` | Login y registro con el verificador simulado mantienen el p95 < 300 ms (la verificación real no cuenta, RNF-01). | RNF-01 |

RF-19 y RF-33 también se prueban a mano en la guía: la API de producción no arranca con una clave de prueba, y con la clave `1x…AA` dos logins seguidos con el token ficticio responden `200`.

## 11. Trazabilidad

| RF / RNF | Archivo(s) | Test(s) |
| :--- | :--- | :--- |
| RF-01, RF-02, RF-17 | `user.schema.ts`, `auth.controller.ts` | `user.schema.test.ts`, `auth.routes.test.ts` |
| RF-03, RF-04 | `login.use-case.ts`, `register-user.use-case.ts` | `login.use-case.test.ts`, `register-user.use-case.test.ts` |
| RF-05 a RF-08, RF-06b | `turnstile-verdict.value-object.ts` | `turnstile-verdict.value-object.test.ts`, `auth.routes.test.ts` |
| RF-09, RF-28, RF-29, RNF-03 | `verify-turnstile.use-case.ts`, `turnstile-verdict.value-object.ts`, `cloudflare-turnstile-verifier.adapter.ts` | `verify-turnstile.use-case.test.ts`, `cloudflare-turnstile-verifier.adapter.test.ts` |
| RF-09b, RNF-02 | `verify-turnstile.use-case.ts`, `cloudflare-turnstile-verifier.adapter.ts`, `app.config.ts` | `verify-turnstile.use-case.test.ts`, `cloudflare-turnstile-verifier.adapter.test.ts`, `app.config.test.ts` |
| RF-10 a RF-13 | `login.use-case.ts`, `register-user.use-case.ts` | `login.use-case.test.ts`, `register-user.use-case.test.ts`, `auth.routes.test.ts` |
| RF-14 | `error-code.constant.ts`, orden de 5.1 | `error-handler.middleware.test.ts`, `auth.routes.test.ts` |
| RF-15, RF-16 | `user.schema.ts`, `login.use-case.ts`, `register-user.use-case.ts` | `user.schema.test.ts`, `auth.routes.test.ts` |
| RF-18, RF-19, RNF-05 | `app.config.ts`, `dependency.container.ts` | `app.config.test.ts`, guía QS |
| RF-20 a RF-23, RF-30 | `verify-turnstile.use-case.ts`, `prisma-turnstile-token.repository.ts`, migración | `verify-turnstile.use-case.test.ts`, `prisma-turnstile-token.repository.int.test.ts` |
| RF-24 a RF-26, RNF-06 | `verify-turnstile.use-case.ts`, `token.port.ts`, `cloudflare-turnstile-verifier.adapter.ts` | `verify-turnstile.use-case.test.ts`, `cloudflare-turnstile-verifier.adapter.test.ts` |
| RF-27, RF-32 | Sin caché de respuestas: cada petición recorre 5.1 | `auth.routes.test.ts` |
| RF-31 | `purge-expired-auth-data.use-case.ts`, `prisma-turnstile-token.repository.ts` | `purge-expired-auth-data.use-case.test.ts`, `prisma-turnstile-token.repository.int.test.ts` |
| RF-33 | `dependency.container.ts` (`checkReplayAndAction`), `verify-turnstile.use-case.ts` | `verify-turnstile.use-case.test.ts`, guía QS |
| RNF-01 | Verificación simulada en la medición | `api.perf.test.ts` |
| RNF-04 | `fake-turnstile-verifier.adapter.ts`, `test.container.ts` | Todos los tests anteriores |
| CE-01 a CE-04 | Flujo completo | `auth.routes.test.ts`, `prisma-turnstile-token.repository.int.test.ts`, guía QS |
