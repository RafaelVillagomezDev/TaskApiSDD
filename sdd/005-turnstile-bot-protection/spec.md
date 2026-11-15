# Feature: Protección frente a bots con Cloudflare Turnstile en el login y el registro
Rama: 005-cloudfare_turnstile · Estado: Aprobada · Fecha: 2026-11-15

## Contexto y objetivo

`POST /auth/login` y `POST /auth/register` son rutas públicas (002). Hoy solo las protegen el token CSRF previo a la sesión (`GET /auth/csrf`), que cualquier script puede pedir, y el bloqueo de 15 minutos tras 5 fallos por email (RF-09 de la 002). Eso deja abiertos tres abusos:
- **Credential stuffing repartido:** un bot prueba contraseñas filtradas contra muchos emails, con pocos intentos por email, sin llegar nunca al bloqueo de RF-09.
- **Registro masivo** de cuentas.
- **Bloqueo malintencionado de cuentas ajenas:** 5 logins fallidos a propósito bloquean 15 minutos la cuenta de otra persona.

El frontend (TaskFrontSDD, spec `sdd/005-turnstile-bot-protection/spec.md`) mostrará el widget de Cloudflare Turnstile en el login y el registro. El widget entrega un token de un solo uso, pero no protege nada si la API no lo valida: un bot llamaría directamente a la API. Esta funcionalidad hace que la API compruebe ese token con Cloudflare antes de crear la cuenta o comprobar las credenciales.

## Relación con las funcionalidades 002 y 004

Esta spec **amplía** la 002 (`sdd/002-user-accounts/spec.md`), que no se edita. Donde se contradicen, prevalece esta:

| De la 002 / 004 | Queda así |
| :--- | :--- |
| Cuerpo de `POST /auth/login` y `POST /auth/register` | Ampliado con el campo `turnstileToken` (RF-01). Los demás campos desconocidos se siguen ignorando, como en la 002. |
| RF-34 de la 002 (precedencia de errores), ampliado por RF-63 de la 004 | Ampliado con un nivel nuevo para los errores de esta spec, entre `VALIDATION_ERROR` y los errores de negocio (RF-14). |
| RF-09 de la 002 (bloqueo tras 5 fallos) | Sin cambios en su regla; una petición rechazada por esta spec no cuenta como intento fallido (RF-12). |
| RF-36 de la 002 (cabeceras permitidas en la petición previa de CORS) | Sin cambios: el token viaja en el cuerpo, no en una cabecera. |

La 001, la 003 y la 004 no cambian.

## Términos

- **Token de Turnstile:** cadena que el widget entrega al frontend cuando la persona supera la verificación. Es de un solo uso y caduca a los 300 segundos.
- **Verificación con Cloudflare:** consulta que la API hace al servicio de verificación de Cloudflare (*siteverify*) con su clave secreta y el token, y cuya respuesta indica si el token es válido (`success`), en qué host se resolvió el widget (`hostname`) y con qué acción (`action`).
- **Modo obligatorio / modo opcional:** configuración de la API durante el despliegue (RF-15 a RF-17).

## Historias de usuario (con prioridad y prueba independiente)

### HU-01 — Iniciar sesión demostrando que soy una persona (P1)
Como usuario, quiero que el login exija una verificación humana, para que un bot no pueda probar contraseñas contra mi cuenta ni bloquearla.
- **Por qué P1:** protege las cuentas existentes frente al credential stuffing y al bloqueo malintencionado.
- **Prueba independiente:** con la clave secreta de prueba que siempre pasa, el login con token y contraseña correcta responde `200`; con la que siempre falla responde `TURNSTILE_FAILED` y no abre sesión.
- **Escenarios:**
  - Dado un token válido para la acción `login` y credenciales correctas, cuando el usuario inicia sesión, entonces se abre la sesión.
  - Dado un token rechazado por Cloudflare y credenciales correctas, cuando el usuario inicia sesión, entonces se rechaza con `TURNSTILE_FAILED` sin comprobar la contraseña.
  - Dado un token rechazado, cuando se intenta el login de un email existente y de uno inexistente, entonces ambas respuestas son idénticas.
  - Dados 10 logins con token rechazado contra el mismo email, cuando el dueño inicia sesión con un token válido y su contraseña, entonces entra: ninguno contó para el bloqueo.
  - Dado un token válido emitido para la acción `register`, cuando se usa en el login, entonces se rechaza con `TURNSTILE_FAILED`.
- **RF:** RF-01 a RF-03, RF-05 a RF-14, RF-06b, RF-09b, RF-20 a RF-33.

### HU-02 — Registrarme demostrando que soy una persona (P1)
Como persona que se registra, quiero superar una verificación sencilla, para que nadie pueda crear cuentas en masa.
- **Por qué P1:** el registro es la otra ruta pública abusable.
- **Prueba independiente:** con la clave de prueba que siempre pasa, el registro con token responde `201`; con la que siempre falla, `TURNSTILE_FAILED` y la cuenta no existe.
- **Escenarios:**
  - Dado un token válido para la acción `register`, cuando el cliente se registra con datos válidos, entonces se crea la cuenta.
  - Dado un token rechazado y un email ya registrado, cuando el cliente se registra, entonces responde `TURNSTILE_FAILED`, no `EMAIL_ALREADY_REGISTERED`.
  - Dado un token ya usado en otra petición, cuando el cliente se registra con él, entonces se rechaza con `TURNSTILE_FAILED` sin consultar a Cloudflare.
  - Dadas dos peticiones de registro simultáneas con el mismo token, cuando llegan, entonces solo una se verifica con Cloudflare.
- **RF:** RF-01, RF-02, RF-04 a RF-11, RF-06b, RF-09b, RF-13, RF-14, RF-20 a RF-33.

### HU-03 — Desplegar sin cortar el acceso (P1)
Como responsable del proyecto, quiero desplegar la API y el frontend en cualquier orden sin que nadie se quede sin poder entrar.
- **Por qué P1:** si la API exige el token antes de que el frontend lo envíe, nadie puede entrar; si el frontend lo envía antes de que la API lo conozca, la API anterior lo ignora (no falla, pero tampoco verifica).
- **Prueba independiente:** con el modo opcional, el login sin token responde `200` y con un token rechazado `TURNSTILE_FAILED`; con el modo obligatorio, el login sin token responde `VALIDATION_ERROR`.
- **Escenarios:**
  - Dado el modo opcional, cuando llega un login sin `turnstileToken`, entonces se procesa como en la 002.
  - Dado el modo opcional, cuando llega un login con `turnstileToken`, entonces se verifica igual que en el modo obligatorio.
  - Dado el modo obligatorio, cuando llega un login sin `turnstileToken`, entonces se rechaza con `VALIDATION_ERROR`.
- **RF:** RF-15 a RF-17.

## Requisitos funcionales (EARS, con ID RF-xx)

Los RF de esta spec se numeran desde RF-01 dentro de la funcionalidad 005. Cuando se cita un requisito de otra funcionalidad se indica («RF-09 de la 002»). RF-06b, RF-09b y RF-33 salen de clarificaciones, y RF-28 a RF-32 de separar requisitos compuestos en la revisión de EARS; los números anteriores no cambian para no romper las referencias.

Cada RF sigue un patrón EARS: ubicuo («El sistema deberá…»), por evento («Cuando…, el sistema deberá…»), por estado («Mientras…, el sistema deberá…»), no deseado («Si…, entonces el sistema deberá…») o una combinación de ellos.

### Contrato del token
- **RF-01** — El sistema deberá aceptar en el cuerpo de `POST /auth/login` y `POST /auth/register` el campo `turnstileToken`, una cadena de 1 a 2048 caracteres.
- **RF-02** — Si `turnstileToken` está presente y no es una cadena de 1 a 2048 caracteres, entonces el sistema deberá rechazar la petición con `VALIDATION_ERROR` antes de consultar a Cloudflare.

### Verificación
- **RF-03** — Cuando llega un login con `turnstileToken`, el sistema deberá verificar el token con Cloudflare antes de comprobar las credenciales.
- **RF-04** — Cuando llega un registro con `turnstileToken`, el sistema deberá verificar el token con Cloudflare antes de comprobar si el email ya está registrado.
- **RF-05** — Si Cloudflare responde que el token no es válido (`success` distinto de `true`), entonces el sistema deberá rechazar la petición con `TURNSTILE_FAILED`.
- **RF-06** — Mientras la clave secreta configurada no sea una de las de prueba de Cloudflare, si la acción devuelta por Cloudflare no es `login` en `POST /auth/login` o `register` en `POST /auth/register`, entonces el sistema deberá rechazar la petición con `TURNSTILE_FAILED`.
- **RF-06b** — Mientras la clave secreta configurada sea una de las de prueba de Cloudflare, el sistema deberá dar por buena cualquier acción devuelta por Cloudflare, incluida su ausencia.
- **RF-07** — Si el host devuelto por Cloudflare no está en la lista de hosts permitidos del entorno, entonces el sistema deberá rechazar la petición con `TURNSTILE_FAILED`.
- **RF-08** — Si Cloudflare indica que el token ha caducado o ya se usó (`timeout-or-duplicate`) o que no es válido (`invalid-input-response`), entonces el sistema deberá rechazar la petición con `TURNSTILE_FAILED`.
- **RF-09** — Si la verificación no termina dentro del tiempo máximo de RNF-03, entonces el sistema deberá rechazar la petición con `TURNSTILE_UNAVAILABLE`.
- **RF-28** — Si la última consulta a Cloudflare termina con un error de red o un error HTTP, entonces el sistema deberá rechazar la petición con `TURNSTILE_UNAVAILABLE`.
- **RF-29** — Si la última consulta a Cloudflare devuelve un error que no depende del token (`internal-error`, `bad-request`, `missing-input-secret` o `invalid-input-secret`), entonces el sistema deberá rechazar la petición con `TURNSTILE_UNAVAILABLE`.
- **RF-09b** — Si Cloudflare devuelve `missing-input-secret` o `invalid-input-secret`, entonces el sistema deberá registrar un aviso de configuración.
- **RF-10** — Cuando rechaza una petición por RF-02, RF-05 a RF-09, RF-21, RF-28 o RF-29, el sistema deberá responder sin crear la cuenta, sin abrir sesión y sin comprobar las credenciales.

### Sin filtrar información ni bloquear cuentas
- **RF-11** — El sistema deberá responder con el mismo código, estado HTTP, mensaje y cuerpo a todo rechazo de RF-05 a RF-08 y RF-21, sea cual sea el motivo y exista o no el email.
- **RF-12** — El sistema deberá excluir del recuento de intentos fallidos de RF-09 de la 002 todo login rechazado por RF-02, RF-05 a RF-09, RF-21, RF-28 o RF-29.
- **RF-13** — Mientras la API esté en modo obligatorio, el sistema deberá responder `EMAIL_ALREADY_REGISTERED`, `INVALID_CREDENTIALS` o `TOO_MANY_ATTEMPTS` solo a peticiones cuyo token haya superado la verificación.

### Precedencia de errores
- **RF-14** — Si una petición incumple varias reglas a la vez, entonces el sistema deberá responder con el primer error según la precedencia de RF-34 de la 002 (ampliada por RF-63 de la 004), con un nivel nuevo entre `VALIDATION_ERROR` y los errores de negocio que contiene `TURNSTILE_FAILED` y `TURNSTILE_UNAVAILABLE`.
  - *Ejemplo:* login sin `X-CSRF-Token` y con token rechazado → `INVALID_CSRF_TOKEN`. Login con `email` mal formado y token rechazado → `VALIDATION_ERROR`. Login con token rechazado en un email bloqueado → `TURNSTILE_FAILED`.

### Despliegue
- **RF-15** — Mientras la API esté en modo opcional, cuando llega un login o registro sin `turnstileToken`, el sistema deberá procesarlo sin verificación.
- **RF-16** — Mientras la API esté en modo opcional, cuando llega un login o registro con `turnstileToken`, el sistema deberá verificar el token igual que en el modo obligatorio.
- **RF-17** — Mientras la API esté en modo obligatorio, si un login o registro no incluye `turnstileToken`, entonces el sistema deberá rechazarlo con `VALIDATION_ERROR`.

### Configuración
- **RF-18** — Si falta la clave secreta de Turnstile o la lista de hosts permitidos está vacía, entonces el sistema deberá negarse a arrancar.
- **RF-19** — Mientras el entorno sea producción, si la lista de hosts permitidos incluye un host local (`localhost`, `127.0.0.1`, `::1`) o la clave secreta es una de las de prueba de Cloudflare, entonces el sistema deberá negarse a arrancar.

### Un solo uso de cada token (idempotencia)
- **RF-20** — Mientras la clave secreta configurada no sea una de las de prueba de Cloudflare, el sistema deberá aceptar cada token de Turnstile en una sola petición durante los 300 segundos siguientes a recibirlo, aunque lleguen varias peticiones a la vez con el mismo token.
- **RF-21** — Mientras la clave secreta configurada no sea una de las de prueba de Cloudflare, si llega un token que el sistema ya ha recibido en los últimos 300 segundos, entonces el sistema deberá rechazar la petición con `TURNSTILE_FAILED` sin consultar a Cloudflare.
- **RF-22** — Mientras la clave secreta configurada no sea una de las de prueba de Cloudflare, cuando recibe un token, el sistema deberá reservarlo de forma atómica antes de consultar a Cloudflare.
- **RF-30** — Mientras la clave secreta configurada no sea una de las de prueba de Cloudflare, el sistema deberá mantener reservado un token durante 300 segundos aunque Cloudflare lo rechace, no responda o la petición falle después.
- **RF-23** — Mientras la clave secreta configurada no sea una de las de prueba de Cloudflare, el sistema deberá guardar de cada token reservado solo su huella, sin el token en claro y sin relacionarla con el email ni con la cuenta.
- **RF-31** — Mientras la clave secreta configurada no sea una de las de prueba de Cloudflare, cuando pasan 300 segundos desde la reserva de un token, el sistema deberá borrar su huella.
- **RF-33** — Mientras la clave secreta configurada sea una de las de prueba de Cloudflare, el sistema deberá verificar cada token sin reservarlo ni rechazarlo por repetido.
- **RF-24** — El sistema deberá generar para cada petición verificada una clave de idempotencia aleatoria y única, y enviarla a Cloudflare en cada consulta de esa petición.
- **RF-25** — Si la consulta a Cloudflare falla por un error de red, un error HTTP `5xx` o el código `internal-error`, y aún queda tiempo dentro de RNF-03, entonces el sistema deberá reintentarla una sola vez con el mismo token y la misma clave de idempotencia.
- **RF-26** — Si Cloudflare rechaza el token (RF-05, RF-08) o devuelve un error de configuración (`missing-input-secret`, `invalid-input-secret`, `bad-request`), entonces el sistema deberá responder sin reintentar la consulta.
- **RF-27** — El sistema deberá procesar cada petición de `POST /auth/login` y `POST /auth/register` de nuevo, sin guardar ni repetir respuestas anteriores.
- **RF-32** — El sistema deberá exigir un token distinto en cada petición de `POST /auth/login` y `POST /auth/register` que se verifique.

## Contrato de la API

### Cuerpo de `POST /auth/login`

```json
{ "email": "ana@example.com", "password": "correct horse battery", "turnstileToken": "0.AbCd…" }
```

### Cuerpo de `POST /auth/register`

```json
{ "email": "ana@example.com", "password": "correct horse battery", "name": "Ana", "turnstileToken": "0.AbCd…" }
```

| Campo | Tipo | Obligatorio | Restricciones |
| :--- | :--- | :--- | :--- |
| `turnstileToken` | string | Sí en modo obligatorio; no en modo opcional | 1–2048 caracteres (RF-01, RF-02) |

El resto de campos no cambia (002).

**Un token por intento:** cada token sirve para un solo intento (RF-20, RF-27, RF-32). Tras cualquier respuesta de estas rutas, de éxito o de error, o tras un fallo de red sin respuesta, el frontend reinicia el widget y envía un token nuevo en el siguiente intento.

**Por qué en el cuerpo y no en una cabecera:**
- La petición previa de CORS no cambia: una cabecera nueva obligaría a añadirla a las permitidas (RF-36 de la 002).
- El token pertenece a esa petición concreta, como el email y la contraseña, y se valida con el mismo esquema que esos campos.
- El widget de Turnstile lo entrega pensando en un envío de formulario; ponerlo en el JSON es lo más directo para el frontend.
- Las cabeceras suelen acabar en registros de proxies y en trazas; el cuerpo de `/auth` no se registra.

### Respuestas nuevas de las dos rutas

- `400 Bad Request` → `VALIDATION_ERROR`: `turnstileToken` no es una cadena de 1 a 2048 caracteres, o falta en modo obligatorio (RF-02, RF-17).
- `403 Forbidden` → `TURNSTILE_FAILED` (RF-05 a RF-08, RF-21).

```json
{
  "success": false,
  "status": 403,
  "error": { "code": "TURNSTILE_FAILED", "message": "No se ha podido verificar que eres una persona." }
}
```

- `503 Service Unavailable` → `TURNSTILE_UNAVAILABLE` (RF-09, RF-28, RF-29).

```json
{
  "success": false,
  "status": 503,
  "error": {
    "code": "TURNSTILE_UNAVAILABLE",
    "message": "No se ha podido verificar que eres una persona; inténtalo de nuevo en unos minutos."
  }
}
```

Las respuestas de éxito no cambian.

### Códigos de error nuevos

| Orden | Código | HTTP | Cuándo |
| :--- | :--- | :--- | :--- |
| 6 | `VALIDATION_ERROR` | 400 | Además de lo de la 002: `turnstileToken` mal formado o ausente en modo obligatorio |
| 6b | `TURNSTILE_FAILED` | 403 | Cloudflare rechaza el token, la acción o el host no coinciden (RF-05 a RF-08), o el token ya se recibió antes (RF-21) |
| 6b | `TURNSTILE_UNAVAILABLE` | 503 | Cloudflare no responde a tiempo, responde con un error HTTP o con un error que no depende del token (RF-09, RF-28, RF-29) |

`TURNSTILE_FAILED` y `TURNSTILE_UNAVAILABLE` no coinciden nunca en la misma petición.

## Requisitos no funcionales (RNF-xx, sin tecnología)

- **RNF-01** — RNF-01 de la 001 (p95 < 300 ms) se mantiene en `POST /auth/login` y `POST /auth/register` sin contar el tiempo de la verificación con Cloudflare. En el peor caso, la espera de un login o registro está acotada por los 5 segundos de RNF-03 más el procesamiento propio de la API.
- **RNF-02** — La clave secreta de Turnstile vive solo en la configuración de cada entorno: nunca en el código, en ficheros versionados, en una respuesta ni en los registros, tampoco en el aviso de RF-09b. El token de Turnstile tampoco se registra.
- **RNF-03** — La API deja de esperar a Cloudflare pasados 5 segundos en total, sumando el intento y el reintento (RF-25), y aplica RF-09. El valor es el mismo en todos los entornos.
- **RNF-04** — Los tests automáticos no llaman a Cloudflare: la verificación se simula.
- **RNF-05** — La lista de hosts permitidos y el modo (opcional u obligatorio) se configuran por entorno, sin cambiar el código.
- **RNF-06** — La clave de idempotencia de RF-24 no se guarda ni se registra: solo existe durante la petición, y se genera con un generador aleatorio seguro.

## Casos límite

- Token ya usado (doble clic, reintento del cliente) → `TURNSTILE_FAILED` sin consultar a Cloudflare (RF-21).
- Registro creado cuya respuesta se pierde; reintento con un token nuevo → `EMAIL_ALREADY_REGISTERED`, y el frontend puede ofrecer iniciar sesión (RF-27).
- Registro cuya respuesta se pierde; reintento con el mismo token → `TURNSTILE_FAILED` (RF-21).
- Login cuya respuesta se pierde; reintento con un token nuevo → se abre otra sesión; la anterior queda huérfana y caduca sola (002).
- `INTERNAL_ERROR` después de verificar el token → la reserva no se libera; el reintento necesita un token nuevo (RF-30).
- Dos peticiones simultáneas con el mismo token → exactamente una llega a Cloudflare; la otra responde `TURNSTILE_FAILED` (RF-20 a RF-22).
- Token rechazado por Cloudflare y reenviado → `TURNSTILE_FAILED` sin consultar a Cloudflare: quedó reservado (RF-21, RF-30).
- Mismo token en el login y después en el registro → el segundo responde `TURNSTILE_FAILED` (RF-21), aunque la acción no se haya llegado a comprobar.
- Token de hace más de 300 segundos → `TURNSTILE_FAILED` (RF-08); el frontend pide uno nuevo al widget.
- Token válido y email bloqueado por RF-09 de la 002 → `TOO_MANY_ATTEMPTS`; el token queda consumido.
- Token válido y contraseña incorrecta → `INVALID_CREDENTIALS`, y cuenta para RF-09 de la 002; el siguiente intento necesita un token nuevo.
- Token válido y email ya registrado → `EMAIL_ALREADY_REGISTERED`; el token queda consumido.
- Cuerpo con un campo desconocido → se ignora, como en la 002, y el token se verifica igualmente.
- `turnstileToken` vacío, numérico o de 2049 caracteres → `VALIDATION_ERROR` (RF-02).
- Token resuelto en un host no permitido (otra web que reutiliza la site key) → `TURNSTILE_FAILED` (RF-07).
- Modo opcional y token rechazado → `TURNSTILE_FAILED`, no se procesa como si no hubiera token (RF-16).
- Primer intento con `5xx` o error de red y reintento con `success: true` → la petición continúa (RF-25).
- Cloudflare gasta el token pero su respuesta no llega; el reintento con la misma clave de idempotencia → devuelve el resultado original, no `timeout-or-duplicate` (RF-24, RF-25).
- Cloudflare responde `invalid-input-secret` → no se reintenta (RF-26).
- Primer intento que agota los 5 segundos → no hay reintento (RNF-03, RF-25).
- Cloudflare tarda más de 5 segundos en total (RNF-03) → `TURNSTILE_UNAVAILABLE` (RF-09); fallan el intento y el reintento → `TURNSTILE_UNAVAILABLE` (RF-28). En ambos casos no se crea la cuenta ni se abre sesión (RF-10).
- Cloudflare caído con una sesión ya abierta → las rutas protegidas siguen funcionando: solo el login y el registro dependen de Cloudflare.
- Clave secreta mal configurada (`invalid-input-secret`) → `TURNSTILE_UNAVAILABLE` y aviso en los registros, sin la clave (RF-29, RF-09b, RNF-02).
- Cloudflare responde `invalid-input-response` o `timeout-or-duplicate` → `TURNSTILE_FAILED`, no `TURNSTILE_UNAVAILABLE` (RF-05, RF-08).
- Clave secreta de prueba que siempre pasa y respuesta sin `action` (o con otra acción) → la verificación se supera y el login responde `200` (RF-06b).
- Clave secreta real y respuesta sin `action` → `TURNSTILE_FAILED` (RF-06).
- Clave secreta de prueba que siempre pasa y dos logins seguidos con `XXXX.DUMMY.TOKEN.XXXX` → los dos responden `200` (RF-33).

## Fuera de alcance

- Proteger otras rutas, por el momento: solo se protegen el login y el registro. Las demás exigen sesión y `POST /auth/refresh` exige el refresh token; si hace falta proteger alguna, irá en su propia funcionalidad.
- Límites de peticiones por IP.
- Una cabecera `Idempotency-Key` del cliente y la repetición de respuestas guardadas en login y registro (RF-27).
- Crear o configurar el widget en Cloudflare: ya existe (site key pública `0x4AAAAAAGCKQh7WSaKl9bC0`).
- El widget en el frontend: es de TaskFrontSDD.

## Criterios de éxito (CE-xx)

- **CE-01** — Con el modo obligatorio, 0 cuentas creadas y 0 sesiones abiertas sin un token de Turnstile válido.
- **CE-02** — 0 bloqueos de RF-09 de la 002 provocados por peticiones sin un token válido.
- **CE-03** — La API y el frontend se despliegan en cualquier orden sin que ningún login o registro legítimo falle por el token.
- **CE-04** — 0 tokens de Turnstile aceptados más de una vez, también con peticiones simultáneas.

## Supuestos

- **S-01** — El único cliente de `/auth/login` y `/auth/register` es TaskFrontSDD, que añade el token en la misma petición. Las colecciones de Postman de la 002, la 003 y la 004 se adaptan en el plan.
- **S-02** — En desarrollo y E2E se usan las claves de prueba de Cloudflare (documentación de Turnstile, *Testing*, consultada el 2026-11-15). Secretas: `1x0000000000000000000000000000000AA` (siempre pasa), `2x0000000000000000000000000000000AA` (siempre falla) y `3x0000000000000000000000000000000AA` (responde `timeout-or-duplicate`, token ya usado). Site keys del frontend: `1x00000000000000000000AA` (pasa) y `2x00000000000000000000AB` (falla). Las site keys de prueba generan el token ficticio `XXXX.DUMMY.TOKEN.XXXX`, que las claves secretas de producción rechazan; las de prueba solo aceptan ese token.
- **S-03** — Según la misma documentación, una verificación superada con una clave secreta de prueba **devuelve siempre `example.com` como `hostname` y no incluye `action`**. Con la comprobación de host (RF-07), la lista de hosts de desarrollo y E2E debe incluir `example.com`; con las claves de prueba no se comprueba la acción (RF-06b). Las site keys de prueba generan siempre el mismo token ficticio, así que con una clave secreta de prueba tampoco se reserva el token (RF-33). RF-19 impide que una clave de prueba llegue a producción. El un-solo-uso (RF-20 a RF-23) se prueba en los tests automáticos con la verificación simulada y tokens distintos. La comprobación de la acción (RF-06) se prueba en los tests con la verificación simulada y, de extremo a extremo, con las claves reales.
- **S-04** — Un token es de un solo uso, pero Cloudflare detecta la reutilización con consistencia eventual: dos peticiones casi simultáneas podrían pasar las dos. RF-20 a RF-22 cierran ese hueco en la API, sin depender de Cloudflare.
- **S-05** — Si la API envía a Cloudflare la IP del cliente (`remoteip`, opcional) se decide en el plan, porque depende de cómo llega la IP real detrás del proxy de producción.
- **S-06** — Orden de despliegue previsto: API en modo opcional → frontend con el widget → API en modo obligatorio. Un frontend que ya envía `turnstileToken` también funciona con la API anterior, que ignora el campo; desplegar antes la API en modo opcional hace que el token se verifique desde que el frontend lo envía.
- **S-07** — Según la documentación de Cloudflare (*Server-side validation*), repetir la consulta con el mismo token y el mismo `idempotency_key` devuelve el resultado original en lugar de `timeout-or-duplicate`. Cómo se reparten los 5 s de RNF-03 entre el intento y el reintento se decide en el plan.

## Clarificaciones

- **2026-11-15** — Las claves secretas de prueba de Cloudflare no devuelven `action`: ¿cómo se comprueba la acción en desarrollo y E2E? → Solo se comprueba con una clave secreta real (RF-06); con una de prueba no se comprueba (RF-06b). RF-19 impide arrancar producción con una clave de prueba. Se descartan un ajuste de configuración aparte para desactivarla y aceptar respuestas sin `action` en cualquier entorno.
- **2026-11-15** — ¿Qué pasa si Cloudflare no responde? → Fallo cerrado con un código propio: `TURNSTILE_UNAVAILABLE` (`503`) ante un tiempo agotado, un error HTTP o un error de Cloudflare que no depende del token (RF-09); con una clave mal configurada se registra además un aviso (RF-09b). Se descartan reutilizar `TURNSTILE_FAILED` (el frontend no distinguiría una caída de un token rechazado) y el fallo abierto (una caída anularía la protección).
- **2026-11-15** — ¿Cuánto espera la API a Cloudflare? → 5 segundos (RNF-03), fijos en todos los entornos: una constante con nombre en el código, no una variable de entorno. Se descartan 10 s (los ejemplos de Cloudflare; el usuario espera el doble en una caída) y 3 s (más riesgo de rechazar logins legítimos con Cloudflare lento).
- **2026-11-15** — ¿Qué estado HTTP lleva `TURNSTILE_FAILED`? → `403`: la petición está bien formada pero no demuestra que haya una persona, como `INVALID_CSRF_TOKEN` (`403`); `401` queda reservado a credenciales y sesión. Se descartan `400` (se confunde con `VALIDATION_ERROR`) y `401` (el frontend intentaría renovar la sesión).
- **2026-11-15** — Alcance: ¿qué rutas protege? → Solo `POST /auth/login` y `POST /auth/register`, por el momento (decisión del responsable del proyecto).
- **2026-11-15** — Idempotencia 1/3: ¿cómo se evita que el mismo token pase dos veces (doble clic, dos pestañas), dado que Cloudflare detecta la reutilización con retraso? → La API lleva su propio registro de tokens recibidos: reserva atómica de la huella antes de consultar a Cloudflare, válida 300 s; un token repetido responde `TURNSTILE_FAILED` sin consultar a Cloudflare (RF-20 a RF-23). Se descartan mantener el riesgo aceptado de S-04 y un bloqueo en memoria del proceso (no sirve con varias instancias ni sobrevive a un reinicio).
- **2026-11-15** — Idempotencia 2/3: ¿reintenta la API si falla la consulta a Cloudflare? → Un solo reintento ante error de red, `5xx` o `internal-error`, con el mismo token y la misma clave de idempotencia, dentro de los 5 s totales (RF-24 a RF-26, RNF-03, RNF-06). No se reintentan los rechazos del token ni los errores de configuración. Se descartan no reintentar (rechaza logins legítimos por fallos pasajeros) y varios reintentos con espera creciente (no caben en 5 s).
- **2026-11-15** — Idempotencia 3/3: ¿qué pasa si el cliente pierde la respuesta y reintenta, o el token se gasta y la petición falla después? → Cada intento lleva un token nuevo y la API no guarda ni repite respuestas (RF-27); el contrato lo indica al frontend. Se descartan una cabecera `Idempotency-Key` con respuestas guardadas (guardaría secretos como el `csrfToken`, tendría que reenviar cookies y cambiaría CORS) y aplicarla solo al registro (dos comportamientos para casos parecidos).
- **2026-11-15** — Al cotejar con el código: login y registro ignoran los campos desconocidos (`z.object`), no los rechazan como decía la spec. ¿Se mantiene? → Sí, como en la 002: los demás campos desconocidos se ignoran. Se descarta pasar a `z.strictObject` (cambia la 002 y obliga a desplegar la API antes que el frontend).
- **2026-11-15** — Detectado al planificar: las site keys de prueba generan siempre el mismo token (`XXXX.DUMMY.TOKEN.XXXX`), así que el un-solo-uso rompería los E2E, Postman y las pruebas manuales. ¿Qué se hace? → Con una clave secreta de prueba no se reserva el token (RF-33; RF-20 a RF-23, RF-30 y RF-31 pasan a aplicarse solo con la clave real). RF-19 impide que llegue a producción. Se descartan exceptuar solo el token ficticio exacto (depende de un valor de Cloudflare) y mantener la reserva (E2E y Postman inviables).

## Registro de cambios

- **2026-11-15** — Creación del borrador a partir del contexto del responsable del proyecto (contrato en el cuerpo, `TURNSTILE_FAILED`, precedencia, modo opcional y obligatorio, claves de prueba). Valores de las claves de prueba y de `hostname`/`action` comprobados en la documentación de Cloudflare. Quedan marcas `[NEEDS CLARIFICATION]` en RF-06, RF-09, RNF-03 y el estado HTTP de `TURNSTILE_FAILED`. Estado → *Borrador*.
- **2026-11-15** — Clarificación 1/4: acción con las claves de prueba. RF-06 se limita a las claves reales y se añade RF-06b; S-03 y dos casos límite actualizados. Quedan marcas en RF-09, RNF-03 y el estado HTTP de `TURNSTILE_FAILED`.
- **2026-11-15** — Clarificación 2/4: Cloudflare no responde. RF-09 pasa a fallo cerrado con `TURNSTILE_UNAVAILABLE` (`503`), se añade RF-09b, el ejemplo de la respuesta `503`, S-07 y tres casos límite. Quedan marcas en RNF-03 y el estado HTTP de `TURNSTILE_FAILED`.
- **2026-11-15** — Clarificación 3/4: tiempo máximo de 5 segundos en RNF-03; RNF-01 y un caso límite actualizados. Queda la marca del estado HTTP de `TURNSTILE_FAILED`.
- **2026-11-15** — Clarificación 4/4: `TURNSTILE_FAILED` responde `403`. Sin marcas `[NEEDS CLARIFICATION]`. Estado → *Clarificada*, pendiente de la aprobación del responsable del proyecto.
- **2026-11-15** — El responsable del proyecto pide resolver los problemas de idempotencia y fija el alcance en login y registro por el momento. Idempotencia 1/3: registro propio de tokens recibidos (RF-20 a RF-23); RF-11, RF-12, S-04, HU-01, HU-02, el contrato, cuatro casos límite, CE-04 y *Fuera de alcance* actualizados. Quedan por decidir el reintento de la verificación con Cloudflare y el reintento del cliente tras perder la respuesta. Estado → *Borrador*.
- **2026-11-15** — Idempotencia 2/3: reintento único con clave de idempotencia (RF-24 a RF-26, RNF-06); RF-09, RNF-03, S-07, HU-01, HU-02 y cuatro casos límite actualizados. Queda por decidir el reintento del cliente tras perder la respuesta.
- **2026-11-15** — Idempotencia 3/3: un token por intento, sin respuestas guardadas (RF-27); nota en el contrato, cuatro casos límite y *Fuera de alcance* actualizados. Sin marcas `[NEEDS CLARIFICATION]`. Estado → *Clarificada*, pendiente de la aprobación del responsable del proyecto.
- **2026-11-15** — Aprobada por el responsable del proyecto. Estado → *Aprobada*.
- **2026-11-15** — Revisión de EARS a petición del responsable del proyecto, sin cambio de comportamiento: cada RF sigue un patrón EARS y expresa un solo requisito; frases explicativas fuera de los RF; requisitos compuestos separados en RF-28 a RF-32 sin renumerar (RF-09 → RF-09, RF-28 y RF-29; RF-22 → RF-22 y RF-30; RF-23 → RF-23 y RF-31; RF-27 → RF-27 y RF-32); RF-02 se limita al token presente (su ausencia es RF-17); RF-13 se limita al modo obligatorio, porque en el modo opcional un login sin token llega a las credenciales (RF-15); RF-10 y RF-12 citan todos los rechazos; RNF-06 se ordena tras RNF-05. Al cotejar la spec con el código se detecta que login y registro ignoran los campos desconocidos, al contrario de lo que decía la spec: se marca `[NEEDS CLARIFICATION]` en la relación con la 002 y en un caso límite, y se corrige la justificación de HU-03 y del contrato. Estado → *Borrador*.
- **2026-11-15** — Clarificación de los campos desconocidos: se siguen ignorando, como en la 002; relación con la 002, HU-03, S-06 y un caso límite actualizados. Sin marcas `[NEEDS CLARIFICATION]`. Aprobada por el responsable del proyecto. Estado → *Aprobada*.
- **2026-11-15** — Enmienda tras la aprobación, detectada al planificar: con una clave secreta de prueba no se reserva el token (RF-33); RF-20 a RF-23, RF-30 y RF-31 se limitan a la clave real; S-03, HU-01, HU-02 y un caso límite actualizados. Confirmada por el responsable del proyecto. Estado: *Aprobada*.
- **2026-11-15** — Corrección sin cambio de comportamiento, detectada al implementar T004: los ejemplos de `403` y `503` ponían `message` fuera de `error`; pasan al sobre de error del principio VII (`error: { code, message }`).
