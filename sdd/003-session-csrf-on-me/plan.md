# Plan: Token CSRF de la sesión en `GET /me`
Spec: `sdd/003-session-csrf-on-me/spec.md` (Aprobada) · Estado: Aprobado · Fecha: 2026-10-29

Los RF, RNF, CE y S de este plan son los de la spec 003; cuando se cita la 002 se indica («RF-24 de la 002», «D-1 de la 002»). Las decisiones de este plan se numeran D-1, D-2… dentro de la 003.

## 1. Resumen técnico

El login sigue generando el token CSRF de la sesión con `crypto.randomBytes` y guardando su huella SHA-256, que es lo único que usa la comprobación de cada `POST`, `PATCH` y `DELETE` (sin cambios). Además guarda una copia del token cifrada con AES-256-GCM y `SESSION_ENCRYPTION_KEY`, la misma clave y el mismo formato que la copia del margen de gracia (D-1 de la 002), en una columna nueva `sessions.csrf_token_sealed`. `GET /me` descifra esa copia con un caso de uso nuevo y responde `{ user, csrfToken }` con la misma forma que el login, con `Cache-Control: no-store`. La migración cierra todas las sesiones abiertas antes de añadir la columna como obligatoria (RF-04). No hay dependencias nuevas ni cambios en otros módulos.

## 2. Comprobación constitucional

**Excepciones usadas:** ninguna. La migración borra las filas de `sessions` (y en cascada sus `refresh_tokens`), pero lo exige RF-04 y es una migración nueva y versionada, no un cambio de esquema fuera de migraciones.

| Principio | Cómo lo cumple este plan | Estado |
| :--- | :--- | :--- |
| **I. Stack cerrado** | Sin dependencias nuevas: el cifrado reutiliza `node:crypto` (`createCipheriv('aes-256-gcm')`), ya justificado en la 002, y la cabecera de caché se escribe con `res.set` de Express. | ✅ |
| **II. Sin spec no hay cambio** | Todo el comportamiento sale de la spec 003 (*Clarificada*): forma de `data` en `GET /me` (RF-01 a RF-03), cierre de sesiones (RF-04), caché (RNF-03) y RNF-06 de la 002 (RNF-04). Las decisiones de la sección 7 son técnicas y no cambian nada observable salvo lo que la spec pide. | ✅ |
| **III. Tests y calidad** | El caso de uso nuevo (`get-session-csrf-token.use-case.ts`) tiene su test, y se amplían los de `login.use-case`, el cifrado, el repositorio de sesiones y `me.routes` (sección 10). La extracción del núcleo AES-GCM (D-2) evita duplicar código (≤ 3 %). El código sigue AGENTS.md §8. | ✅ |
| **IV. Migraciones y secretos** | Una migración nueva (`<AAAAMMDDHHMMSS>_session_csrf_sealed`) cierra las sesiones y añade `csrf_token_sealed TEXT NOT NULL`. Sin variables nuevas: se reutiliza `SESSION_ENCRYPTION_KEY`, que sigue solo en `.env.dev`/`.env.prod`. | ✅ |
| **V. Separación hexagonal** | El cifrado queda tras un puerto nuevo de `users/domain/` (`SecretCipher`), implementado en `infrastructure/`. `application/` solo importa de `domain/` y `src/shared/`. El caso de uso recibe el `sessionId` del `SessionContext` de `src/shared/`, que ya existe. Ningún otro módulo cambia. | ✅ |
| **VI. Clarificar antes de suponer** | La spec está *Clarificada* y sin marcas `[NEEDS CLARIFICATION]`; sus tres dudas (recuperación del token, caché y RNF-06) se resolvieron con el usuario el 2026-10-29. | ✅ |
| **VII. Formato de respuesta único** | `GET /me` sigue usando `sendSuccess`; solo cambia el contenido de `data`. Los errores, sin cambios. `Cache-Control` viaja en una cabecera. | ✅ |

## 3. Estructura de archivos

### Raíz y configuración

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `prisma/schema.prisma` | Modificado | `Session.csrfTokenSealed String @map("csrf_token_sealed")`, con su comentario. |
| `prisma/migrations/<AAAAMMDDHHMMSS>_session_csrf_sealed/migration.sql` | Nuevo | `DELETE FROM "sessions"` (RF-04; los `refresh_tokens` caen en cascada) y `ALTER TABLE "sessions" ADD COLUMN "csrf_token_sealed" TEXT NOT NULL`. Se genera con `prisma migrate diff` (AGENTS.md §3) y se le antepone el `DELETE`. |
| `AGENTS.md` | Modificado | §3, `SESSION_ENCRYPTION_KEY`: cifra también la copia del token CSRF de cada sesión, y cambiarla obliga a cerrar todas las sesiones (D-4). |
| `README.md` | Modificado | Estado de la 003, endpoint `GET /me`, variable `SESSION_ENCRYPTION_KEY` y estructura de `sdd/003-…` (Gobierno 7). |

### `src/shared/`

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `infrastructure/http/no-store.middleware.ts` | Nuevo | Añade `Cache-Control: no-store` a la respuesta y sigue (RNF-03, D-3). |

### `src/modules/users/`

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `domain/secret-cipher.port.ts` | Nuevo | Puerto `SecretCipher`: `seal(plain: string): string`, `open(sealed: string): string` (lanza si el texto se alteró o se cifró con otra clave). |
| `domain/session.repository.ts` | Modificado | `NewSession` y `SessionRecord` ganan `csrfTokenSealed: string`; `SessionRepository` gana `findById(sessionId)`. |
| `application/login.use-case.ts` | Modificado | Recibe `SecretCipher` y guarda `csrfTokenSealed: cipher.seal(csrfToken)` junto a la huella (RF-02). |
| `application/get-session-csrf-token.use-case.ts` | Nuevo | `execute(sessionId)`: `findById` → `open(csrfTokenSealed)`; sin sesión → `INVALID_TOKEN` (la sesión se cerró durante la petición, RF-19 de la 002). |
| `infrastructure/aes-gcm-secret-cipher.adapter.ts` | Nuevo | `AesGcmSecretCipher`: el núcleo AES-256-GCM que hoy está en `AesGcmGraceCipher` (validación de la clave de 32 bytes, IV aleatorio de 12 bytes, etiqueta de 16, formato `v1.<iv>.<cifrado>.<etiqueta>` en base64url). |
| `infrastructure/aes-gcm-grace-cipher.adapter.ts` | Modificado | Delega en `AesGcmSecretCipher` y solo serializa y valida el JSON de los tokens (D-2). El formato guardado no cambia. |
| `infrastructure/prisma-session.repository.ts` | Modificado | `create` guarda `csrfTokenSealed`; `toRecord` lo lee; `findById` nuevo. |
| `infrastructure/user.mapper.ts` | Modificado | `toSessionUserResponse(user, csrfToken)` → `{ user, csrfToken }`, que comparten el login y `GET /me` (RF-01: misma forma). |
| `infrastructure/auth.controller.ts` | Modificado | El login usa `toSessionUserResponse` (sin cambio de comportamiento). |
| `infrastructure/me.controller.ts` | Modificado | Recibe `GetSessionCsrfTokenUseCase`; `show` responde `toSessionUserResponse(user, csrfToken)`. |
| `infrastructure/me.routes.ts` | Modificado | `router.get('/me', noStore, session, controller.show)`: la cabecera va en todas las respuestas de `GET /me`, también en los errores. |

### `src/` (raíz)

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `dependency.container.ts` | Modificado | Crea un único `AesGcmSecretCipher(config.sessionEncryptionKey)`, que comparten `AesGcmGraceCipher`, `LoginUseCase` y `GetSessionCsrfTokenUseCase`, y se lo pasa a `MeController`. |

### `tests/` y documentación

| Archivo | Cambio | Qué hace |
| :--- | :--- | :--- |
| `tests/support/in-memory-session.repository.ts` | Modificado | Guarda `csrfTokenSealed` y añade `findById`. |
| `tests/support/test.container.ts` | Modificado | Mismo cableado que el contenedor real, con una clave aleatoria. |
| `sdd/002-user-accounts/user-accounts.postman-collection.json` | Modificado | Las peticiones `GET /me` comprueban `data` con las claves `user` y `csrfToken`, que `csrfToken` es igual a `sessionCsrfToken` y la cabecera `Cache-Control: no-store` (S-02). |
| `sdd/002-user-accounts/quickstart.md` | Modificado | Los pasos con `GET /me` muestran la nueva forma de `data`. |
| `sdd/003-session-csrf-on-me/quickstart.md` | Nuevo | Pruebas manuales de la 003 (QS-01…), incluida la sesión abierta antes de migrar. |
| `sdd/003-session-csrf-on-me/tasks.md` | Nuevo | Desglose de este plan, tras su aprobación. |

## 4. Modelo de datos

### `sessions` (cambio)

| Columna | Tipo | Restricciones | Notas |
| :--- | :--- | :--- | :--- |
| `csrf_token_sealed` | `TEXT` | NOT NULL | Copia AES-256-GCM del token CSRF de la sesión, con `SESSION_ENCRYPTION_KEY`, en el formato `v1.<iv base64url, 12 bytes>.<texto cifrado base64url>.<etiqueta base64url, 16 bytes>` (el de `grace_tokens`, D-1 de la 002). Se escribe en el login y no cambia durante la sesión (RF-02, RF-24 de la 002). Muere con la sesión (logout, caducidad, cambio de contraseña, borrado de la cuenta). |

`csrf_token_hash` se mantiene y sigue siendo lo único que se usa para comprobar `X-CSRF-Token` (D-1). No hay índices nuevos: `findById` usa la clave primaria.

### Formato de los tokens (cambio respecto a la 002)

| Token | Formato | Dónde viaja | Qué se guarda |
| :--- | :--- | :--- | :--- |
| CSRF de sesión | Sin cambios: `base64url(32 bytes de crypto.randomBytes)`, generado en el login y fijo toda la sesión | Cuerpo del login **y de `GET /me`**; cabecera `X-CSRF-Token` | `sessions.csrf_token_hash` **y `sessions.csrf_token_sealed`** |

### Migración

```sql
-- Cierra todas las sesiones abiertas: no tienen copia de su token CSRF (RF-04 de la 003).
-- Sus refresh tokens se borran en cascada
DELETE FROM "sessions";

ALTER TABLE "sessions" ADD COLUMN "csrf_token_sealed" TEXT NOT NULL;
```

## 5. Lógica principal

### 5.1 Login (RF-02; RF-07 y RF-24 de la 002)
Igual que en la 002 (5.6 de su plan), con un paso más al crear la sesión: además de `fingerprint(csrfToken)`, guarda `cipher.seal(csrfToken)` en `csrf_token_sealed`. La respuesta no cambia.

### 5.2 `GET /me` (RF-01, RF-02, RNF-03)
1. `noStore`: `Cache-Control: no-store` en la respuesta, sea cual sea.
2. `session` (5.2 de la 002): sin cookie → `MISSING_TOKEN`; sesión inexistente o cerrada → `INVALID_TOKEN`; acceso caducado → `TOKEN_EXPIRED`. Deja `SessionContext { userId, sessionId }`. Un `GET` no exige `X-CSRF-Token`.
3. `GetProfileUseCase.execute(userId)` (sin cambios) y `GetSessionCsrfTokenUseCase.execute(sessionId)`: `findById` → `open(csrf_token_sealed)`. Si la sesión ya no existe (se cerró entre el middleware y la consulta) → `INVALID_TOKEN`.
4. `200` con `data: { user, csrfToken }` y el mensaje actual, «Operación realizada con éxito».

### 5.3 Renovación, logout, cambio de contraseña y limpieza
Sin cambios. La renovación no toca `csrf_token_sealed`, así que tras cada refresh `GET /me` devuelve el mismo token (RF-02). Las sesiones que se cierran se borran con su copia, y la limpieza de las caducadas (D-12 de la 002) también.

### 5.4 Sesiones abiertas antes de migrar (RF-04)
La migración las borra. Sus cookies dejan de resolver ninguna sesión: cualquier ruta protegida responde `INVALID_TOKEN` y `POST /auth/refresh` responde `INVALID_REFRESH_TOKEN` (RF-19 y RF-14 de la 002). El usuario vuelve a iniciar sesión.

## 6. Interfaz

Contrato completo en la spec (sección *Contrato de la API*).

| Método y ruta | Entrada | Salida (`data`) | Errores posibles (por precedencia) |
| :--- | :--- | :--- | :--- |
| `GET /me` | Cookie `access_token` | `200`, `{ user: User, csrfToken }` + `Cache-Control: no-store` | `MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED` (todos con `Cache-Control: no-store`) |

El resto de endpoints no cambia; en particular, `POST /auth/login` mantiene su `data` y `PATCH /me` sigue devolviendo `User` (RF-03).

## 7. Decisiones técnicas

| ID | Decisión | Por qué | Alternativas descartadas |
| :--- | :--- | :--- | :--- |
| D-1 | Se mantienen las dos columnas: `csrf_token_hash` para comprobar y `csrf_token_sealed` para devolver. | La comprobación de cada `POST`/`PATCH`/`DELETE` no cambia (huella + `timingSafeEqual`, 5.2 de la 002) y no paga un descifrado por petición; la copia cifrada solo se abre en `GET /me`. | Solo la copia cifrada, descifrando en cada petición que modifica (más coste y más código tocado en el middleware de sesión). |
| D-2 | Extraer el núcleo AES-256-GCM de `AesGcmGraceCipher` a `AesGcmSecretCipher` (puerto `SecretCipher`), y que el adaptador del margen de gracia delegue en él. | Un único sitio con el cifrado (sin código duplicado, AGENTS.md §8) y el mismo formato `v1` en las dos columnas. Las copias de `grace_tokens` ya guardadas se siguen abriendo, porque el formato no cambia. | Un segundo adaptador AES-GCM copiado (duplicación); guardar el token CSRF dentro de `GraceTokens` (mezcla una copia de 30 s con una que dura toda la sesión). |
| D-3 | `Cache-Control: no-store` con un middleware de `src/shared/` montado solo en `GET /me`, antes de `session`. | RNF-03 pide solo `GET /me`. Ir antes de `session` hace que también las respuestas de error lleven la cabecera, y un middleware se puede reutilizar si una funcionalidad futura amplía la regla (fuera de alcance en la spec). | Escribir la cabecera en `MeController.show` (no cubre los errores de sesión); un middleware global (cambia endpoints de la 001 y la 002, fuera de alcance). |
| D-4 | La misma `SESSION_ENCRYPTION_KEY` cifra las dos copias. Cambiarla obliga a cerrar todas las sesiones a la vez (`DELETE FROM sessions`); si una copia no se puede abrir, `GET /me` responde `INTERNAL_ERROR` y se registra el error. | Elegido por el usuario (opción de la copia cifrada, 2026-10-29): sin claves nuevas. Con la copia del token CSRF, la clave deja de afectar solo a 30 s de datos (R-4 de la 002) y pasa a afectar a todas las sesiones abiertas; cerrarlas al cambiarla es el equivalente a RF-04. Una copia que no se abre solo ocurre si se incumple ese procedimiento. | Una clave separada para el CSRF (otra variable que gestionar sin ganar seguridad: se guardan en el mismo sitio); cerrar solo la sesión afectada y responder `INVALID_TOKEN` (comportamiento que la spec no recoge, y la sesión seguiría válida en las demás rutas hasta ese momento). |
| D-5 | Caso de uso aparte (`GetSessionCsrfTokenUseCase`) en lugar de ampliar `GetProfileUseCase`. | El perfil depende del usuario y el token de la sesión; cada uno tiene su puerto y su test, y `GetProfileUseCase` sigue sirviendo tal cual. | Que `GetProfileUseCase` reciba también la sesión y el cifrado (mezcla dos responsabilidades); meter la copia cifrada en `SessionContext` (llevaría un dato de `users` a `src/shared/` y a todas las rutas). |
| D-6 | `GET /me` hace una consulta más, por clave primaria, en vez de reutilizar la fila que ya leyó el middleware de sesión. | Mantiene el middleware y `SessionContext` sin cambios (D-5). Una lectura por PK no pone en riesgo el p95 de 300 ms (RNF-01). | Pasar la fila completa del middleware al controlador por `res.locals` (acopla el controlador al middleware). |

## 8. Complexity Tracking

### Dependencias

Ninguna nueva. Todo se cubre con `node:crypto` (`createCipheriv`/`createDecipheriv` con `aes-256-gcm`), ya en uso desde la 002, y con `res.set` de Express.

### Piezas nuevas

| Pieza | Por qué hace falta | Alternativa más simple descartada |
| :--- | :--- | :--- |
| Columna `sessions.csrf_token_sealed` | Devolver el mismo token del login (RF-02) sin guardarlo en claro (RNF-04). | Guardarlo en claro (incumple RNF-04 de la 003 y RNF-06 de la 002). |
| Puerto `SecretCipher` y `AesGcmSecretCipher` | Cifrar el token sin duplicar el código de la 002 (D-2). | Copiar el adaptador existente. |
| `GetSessionCsrfTokenUseCase` | Leer y descifrar la copia de la sesión de la petición (D-5). | Ampliar `GetProfileUseCase`. |
| `no-store.middleware.ts` | RNF-03, también en las respuestas de error (D-3). | Cabecera en el controlador. |

## 9. Riesgos

| ID | Riesgo | Mitigación |
| :--- | :--- | :--- |
| R-1 | Se filtran a la vez la base de datos y `SESSION_ENCRYPTION_KEY`: se obtienen los tokens CSRF de todas las sesiones abiertas, no solo los de los últimos 30 s (cambia R-4 de la 002). | Riesgo aceptado al elegir la copia cifrada (opción 1 de la clarificación). La clave vive solo en `.env.*` (principio IV). Sin las cookies `HttpOnly` de la víctima, un token CSRF no basta para actuar en su nombre. |
| R-2 | Alguien cambia `SESSION_ENCRYPTION_KEY` sin cerrar las sesiones y `GET /me` empieza a responder `INTERNAL_ERROR`. | Procedimiento en AGENTS.md §3 y en el README (D-4); el error se registra con su causa. |
| R-3 | El despliegue en producción cierra la sesión de todos los usuarios. | Es lo que pide RF-04, y el frontend aún no está en producción (S-02). Se avisa en el README y en la guía. |
| R-4 | `prisma migrate dev` aborta sin terminal interactiva por añadir una columna obligatoria a una tabla con filas. | Se usa la alternativa no interactiva de AGENTS.md §3 (`prisma migrate diff` + `migrate deploy`) y se antepone el `DELETE`. |
| R-5 | Extraer el cifrado rompe la apertura de copias de `grace_tokens` ya guardadas. | El formato `v1` no cambia; los tests de `aes-gcm-grace-cipher.adapter` se mantienen y uno nuevo abre con el adaptador refactorizado una copia sellada con el formato anterior. |
| R-6 | Un cliente o la colección de Postman siguen leyendo `data.id` en `GET /me`. | Se actualiza la colección de la 002 (S-02) y la guía; el único cliente real, TaskFrontSDD, aún no está en producción. |

## 10. Estrategia de tests

Mismos tipos y ubicación que en la 002 (subcarpeta `tests/` junto a cada fichero).

| Módulo | Test | Qué comprueba | RF / RNF / CE |
| :--- | :--- | :--- | :--- |
| users | `get-session-csrf-token.use-case.test.ts` (nuevo) | Devuelve el token descifrado de la sesión; sesión inexistente → `INVALID_TOKEN`; copia alterada → error. | RF-01, RF-02 |
| users | `login.use-case.test.ts` | Guarda la huella y la copia sellada, y la copia se abre con el mismo `csrfToken` de la respuesta; la copia no contiene el token en claro. | RF-02, RNF-04 |
| users | `aes-gcm-secret-cipher.adapter.test.ts` (nuevo) | Ida y vuelta; IV distinto en cada cifrado; clave que no es de 32 bytes → error; texto o etiqueta alterados, versión desconocida y clave distinta → error; el texto cifrado no contiene el original. | RNF-04 |
| users | `aes-gcm-grace-cipher.adapter.test.ts` | Los casos actuales siguen pasando; abre una copia con el formato `v1` anterior a la extracción. | RF-13 de la 002, D-2 |
| users | `prisma-session.repository.int.test.ts` | `create` guarda `csrfTokenSealed`; `findById` lo devuelve; sesión inexistente → `null`; la renovación no lo cambia; la columna rechaza `NULL`. | RF-02, RF-04 |
| users | `me.routes.test.ts` | `GET /me` → `200` con `data` de claves `user` y `csrfToken`, igual al del login; igual tras `POST /auth/refresh`; dos sesiones → tokens distintos; `Cache-Control: no-store` en el `200` y en `MISSING_TOKEN`; ningún token de acceso ni de refresco en el cuerpo; con el `csrfToken` de `GET /me`, `POST /tasks` → `201`; `PATCH /me` sigue devolviendo `User` sin `csrfToken`. | RF-01 a RF-03, RNF-02, RNF-03, CE-01, CE-02 |
| users | `auth.routes.test.ts` | El login mantiene su `data` tras usar `toSessionUserResponse`. | RF-24 de la 002 |
| shared | `no-store.middleware.test.ts` (nuevo) | Añade la cabecera y llama a `next`. | RNF-03 |
| — | `tests/performance/api.perf.test.ts` | `GET /me`, que ya está medido, sigue con p95 < 300 ms con la consulta y el descifrado nuevos. | RNF-01 |

RF-04 se comprueba en el SQL de la migración (revisado en la tarea que la crea), en la restricción `NOT NULL` (test de integración) y a mano en la guía: con las cookies de una sesión anterior a la migración, `GET /me` → `INVALID_TOKEN`.

## 11. Trazabilidad

| RF / RNF | Archivo(s) | Test(s) |
| :--- | :--- | :--- |
| RF-01 | `me.controller.ts`, `user.mapper.ts` (`toSessionUserResponse`), `get-session-csrf-token.use-case.ts` | `get-session-csrf-token.use-case.test.ts`, `me.routes.test.ts` |
| RF-02 | `login.use-case.ts`, `get-session-csrf-token.use-case.ts`, `prisma-session.repository.ts`, `aes-gcm-secret-cipher.adapter.ts` | `login.use-case.test.ts`, `get-session-csrf-token.use-case.test.ts`, `prisma-session.repository.int.test.ts`, `me.routes.test.ts` |
| RF-03 | `me.controller.ts` (`update` sin cambios) | `me.routes.test.ts` |
| RF-04 | Migración `<…>_session_csrf_sealed`, `schema.prisma` (`NOT NULL`) | `prisma-session.repository.int.test.ts`, guía QS |
| RNF-01 | D-6 (lectura por PK) | `api.perf.test.ts` |
| RNF-02 | `user.mapper.ts` | `me.routes.test.ts` |
| RNF-03 | `no-store.middleware.ts`, `me.routes.ts` | `no-store.middleware.test.ts`, `me.routes.test.ts` |
| RNF-04 | `aes-gcm-secret-cipher.adapter.ts`, `login.use-case.ts` (solo huella y copia cifrada) | `aes-gcm-secret-cipher.adapter.test.ts`, `login.use-case.test.ts`, `prisma-session.repository.int.test.ts` |
| CE-01, CE-02 | `GET /me` completo | `me.routes.test.ts` |
