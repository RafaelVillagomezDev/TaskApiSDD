# Feature: Cuentas de usuario — registro, sesiones con cookies, CSRF y gestión de la cuenta
Rama: 002-user-accounts · Estado: Aprobada · Fecha: 2026-10-28

## Contexto y objetivo

En la funcionalidad 001 basta con enviar `X-User-Id: ana` para actuar como Ana, sin contraseña: cualquiera que conozca o adivine un identificador puede ver y modificar los datos de otro usuario (riesgo aceptado en el supuesto S-01 de la 001).

Esta funcionalidad elimina ese riesgo. Cada persona tiene una cuenta propia, protegida con contraseña, y para actuar como ella hace falta la sesión que se obtiene al iniciar sesión con su email y su contraseña. La sesión vive en cookies que el navegador no deja leer a ningún script y está protegida frente a peticiones falsificadas desde otras webs (CSRF). `X-User-Id` se elimina de la API: deja de formar parte del contrato y, si una petición la sigue enviando, se trata como cualquier cabecera desconocida. Aunque una petición diga `X-User-Id: ana`, sin la sesión de Ana no puede ver ni modificar nada suyo (RF-17, RF-18, RF-32). Las tareas, la racha y los avisos de la 001 pasan a pertenecer a la cuenta de la sesión.

## Relación con la funcionalidad 001

Esta spec **modifica** la 001 (`sdd/001-taskApiSDD-mvp/spec.md`), que no se edita. Donde se contradicen, prevalece esta:

| De la 001 | Queda así |
| :--- | :--- |
| RF-01 (`X-User-Id` y `MISSING_USER`) | Eliminado: la cabecera `X-User-Id` y el error `MISSING_USER` desaparecen de la API (RF-32); al usuario lo identifica la sesión (RF-17 a RF-21). |
| RF-02 (operaciones limitadas al usuario de la petición) | Sustituido por RF-21: limitadas al usuario de la sesión. |
| RF-31 a RF-33 (cabeceras de hora y zona) | Siguen vigentes, pero solo en `/tasks`, `/streak` y `/alerts` (RF-30). |
| RF-34 (recordar la zona en una petición aceptada) | Matizado por RF-31: aceptada = sesión válida y cabeceras de hora y zona válidas. |
| RF-46 (precedencia de errores) | Sustituido por RF-34 de esta spec. |
| Supuesto S-01 (suplantación aceptada) | Eliminado: cada usuario tiene cuenta y sesión. |
| Contrato: «Todas las peticiones requieren `X-User-Id`…» y `401 MISSING_USER` en cada endpoint | Sustituido por la cookie de sesión, `X-CSRF-Token` en `POST`/`PATCH`/`DELETE` y los errores de sesión (sección *Contrato*). |
| Toda petición `OPTIONS` responde `ROUTE_NOT_FOUND` (caso límite de rutas y métodos inexistentes) | Excepción: la petición previa (*preflight*) de CORS desde el origen del frontend responde `200` (RF-36). El resto de `OPTIONS` sigue respondiendo `ROUTE_NOT_FOUND`. |

El resto de la 001 (tareas, racha, avisos, paginación, formato de respuesta) no cambia.

## Historias de usuario (con prioridad y prueba independiente)

RF-17 a RF-24 (sesión y CSRF) y RF-34 (precedencia de errores) son transversales: aplican a todas las historias que usan rutas protegidas.

### HU-01 — Registrarme (P1)
Como persona nueva, quiero crear una cuenta con mi email y una contraseña, para tener mis tareas protegidas.
- **Por qué P1:** sin cuenta no hay sesión ni acceso a nada.
- **Prueba independiente:** registrar `ana@example.com` devuelve la cuenta creada; registrar `ANA@example.com` después responde que el email ya está registrado.
- **Escenarios:**
  - Dado un email no registrado, cuando la persona se registra con una contraseña de 12 caracteres, entonces se crea la cuenta y la respuesta no incluye la contraseña.
  - Dado `ana@example.com` ya registrado, cuando alguien se registra con `Ana@Example.com`, entonces se rechaza porque el email ya está registrado.
  - Dada una contraseña de 11 caracteres, cuando la persona se registra, entonces se rechaza con un error de validación.
- **RF:** RF-01 a RF-06, RF-22, RF-23.

### HU-02 — Iniciar y cerrar sesión (P1)
Como usuario, quiero entrar con mi email y mi contraseña y poder salir, para usar la API sin volver a identificarme en cada petición.
- **Por qué P1:** es la puerta de entrada a todas las demás historias.
- **Prueba independiente:** tras el login, `GET /me` devuelve la cuenta; tras el logout, la misma petición responde que el token no es válido.
- **Escenarios:**
  - Dada una cuenta, cuando el usuario inicia sesión con la contraseña correcta, entonces recibe las cookies de sesión y un token CSRF.
  - Dada una contraseña incorrecta, cuando intenta iniciar sesión, entonces recibe un error que no revela si el email existe.
  - Dados 5 intentos fallidos en 15 minutos, cuando vuelve a intentarlo aunque sea con la contraseña correcta, entonces se rechaza por demasiados intentos.
  - Dada una sesión abierta, cuando el usuario cierra sesión, entonces sus cookies dejan de servir.
- **RF:** RF-07 a RF-10, RF-15, RF-16, RF-22 a RF-24.

### HU-03 — Mantener la sesión abierta mientras la uso (P1)
Como usuario, quiero que mi sesión se renueve sola mientras uso la app, para no tener que volver a entrar cada 15 minutos.
- **Por qué P1:** sin renovación, la sesión caducaría cada 15 minutos.
- **Prueba independiente:** con el token de acceso caducado, `POST /auth/refresh` devuelve cookies nuevas y la siguiente petición funciona; el refresh token anterior, pasado el margen de gracia, cierra la sesión.
- **Escenarios:**
  - Dado un token de acceso caducado, cuando el usuario llama a una ruta protegida, entonces recibe `TOKEN_EXPIRED`; tras renovar, la misma petición funciona.
  - Dado un refresh token ya renovado hace más de 30 segundos, cuando alguien lo usa, entonces se cierra esa sesión.
  - Dada una sesión iniciada hace 30 días, cuando el usuario intenta renovarla, entonces tiene que volver a iniciar sesión.
- **RF:** RF-11 a RF-14, RF-20.

### HU-04 — Usar mis tareas, racha y avisos con mi sesión (P1)
Como usuario, quiero que mis tareas, mi racha y mis avisos sean solo míos y accesibles con mi sesión, para que nadie más pueda verlos ni cambiarlos.
- **Por qué P1:** es el objetivo del MVP: cerrar la suplantación de la 001.
- **Prueba independiente:** dos usuarios crean tareas con sus sesiones; cada uno solo ve las suyas, y sin sesión no se ve nada.
- **Escenarios:**
  - Dada una sesión válida, cuando el usuario crea una tarea con su token CSRF, entonces la tarea es suya.
  - Dada una petición sin cookie de sesión, cuando se consulta `/tasks`, entonces se rechaza porque falta el token.
  - Dada una petición `POST /tasks` sin `X-CSRF-Token`, cuando llega con una sesión válida, entonces se rechaza por CSRF.
  - Dada una petición con `X-User-Id` de otro usuario y la sesión de Ana, cuando se consulta `/tasks`, entonces se devuelven las tareas de Ana.
- **RF:** RF-17 a RF-21, RF-23, RF-30 a RF-33.

### HU-05 — Ver y editar mi perfil (P2)
Como usuario, quiero ver los datos de mi cuenta y cambiar mi nombre visible, para saber con qué cuenta estoy y cómo aparezco.
- **Por qué P2:** útil para el cliente, pero las tareas funcionan sin ella.
- **Prueba independiente:** cambiar el nombre a "Ana" y consultar `GET /me` devuelve "Ana".
- **Escenarios:**
  - Dada una sesión, cuando el usuario consulta su perfil, entonces recibe su id, email, nombre y fecha de alta.
  - Dada una sesión, cuando cambia su nombre a "  Ana  ", entonces queda guardado como "Ana".
  - Dada una sesión, cuando intenta cambiar su email, entonces se rechaza con un error de validación.
- **RF:** RF-05, RF-25, RF-26.

### HU-06 — Cambiar mi contraseña (P2)
Como usuario, quiero cambiar mi contraseña, para protegerme si creo que alguien la conoce.
- **Por qué P2:** importante para la seguridad, pero no imprescindible para usar la API.
- **Prueba independiente:** tras cambiarla, el login con la anterior falla y con la nueva funciona; otra sesión abierta deja de servir.
- **Escenarios:**
  - Dadas dos sesiones abiertas, cuando el usuario cambia la contraseña desde una, entonces la otra se cierra y la suya sigue abierta.
  - Dada una contraseña actual incorrecta, cuando intenta cambiarla, entonces se rechaza y el fallo cuenta para el bloqueo.
- **RF:** RF-27, RF-28.

### HU-07 — Borrar mi cuenta (P3)
Como usuario, quiero borrar mi cuenta y todos mis datos, para no dejar nada en el sistema.
- **Por qué P3:** necesaria para dar control al usuario, pero de uso poco frecuente.
- **Prueba independiente:** tras borrar la cuenta, el login con ese email falla y sus tareas no existen.
- **Escenarios:**
  - Dada una cuenta con tareas y avisos, cuando el usuario la borra con su contraseña, entonces la cuenta, sus tareas, avisos y sesiones desaparecen.
  - Dada una contraseña incorrecta, cuando intenta borrar la cuenta, entonces se rechaza y la cuenta sigue intacta.
- **RF:** RF-28, RF-29.

## Requisitos funcionales (EARS, con ID RF-xx)

Los RF de esta spec se numeran desde RF-01 dentro de la funcionalidad 002. Cuando se cita un requisito de la 001 se indica explícitamente (ej. «RF-23 de la 001»).

### Cuentas
- **RF-01** — Cuando una persona se registra con un email y una contraseña válidos y el email no está registrado, el sistema deberá crear una cuenta con ese email, esa contraseña y el nombre indicado, si lo hay.
- **RF-02** — Si el email no tiene un formato válido o tiene más de 254 caracteres, entonces el sistema deberá rechazar la petición con el error `VALIDATION_ERROR`.
- **RF-03** — El sistema deberá guardar el email en minúsculas y sin espacios al principio ni al final, y tratar como el mismo email dos que solo se diferencien en mayúsculas; si al registrarse el email ya pertenece a una cuenta, el sistema deberá rechazar la petición con el error `EMAIL_ALREADY_REGISTERED`.
  - *Ejemplo:* registrado `ana@example.com` → registrar `" Ana@Example.COM "` responde `EMAIL_ALREADY_REGISTERED`.
- **RF-04** — Si la contraseña tiene menos de 12 o más de 128 caracteres, entonces el sistema deberá rechazar la petición con el error `VALIDATION_ERROR`. No se exigen reglas de composición (mayúsculas, dígitos o símbolos).
  - *Ejemplo:* `"correcthorse"` (12 caracteres) se acepta; `"Abc123!"` (7) responde `VALIDATION_ERROR`.
- **RF-05** — El sistema deberá guardar el nombre (`name`), que es opcional, sin espacios al principio ni al final; si tras recortarlo está vacío, como `null`; y si tiene más de 100 caracteres, deberá rechazar la petición con el error `VALIDATION_ERROR`.
- **RF-06** — Cuando se crea una cuenta, el sistema deberá devolver sus datos sin abrir ninguna sesión: para entrar hay que iniciar sesión (RF-07).

### Sesiones
- **RF-07** — Cuando un usuario inicia sesión con su email y su contraseña correctos, el sistema deberá abrir una sesión y entregar en cookies un token de acceso válido durante 15 minutos y un refresh token válido durante 7 días, y en la respuesta un token CSRF de esa sesión (RF-24).
- **RF-08** — Si el email no pertenece a ninguna cuenta o la contraseña no es la suya, entonces el sistema deberá rechazar el login con el error `INVALID_CREDENTIALS`, con la misma respuesta en ambos casos.
- **RF-09** — Si un email acumula 5 intentos fallidos en 15 minutos, contando los logins fallidos (RF-08) y las contraseñas actuales incorrectas (RF-28), entonces el sistema deberá rechazar con el error `TOO_MANY_ATTEMPTS` durante los 15 minutos siguientes al quinto fallo todo login con ese email y toda petición de esa cuenta que pida su contraseña, aunque la contraseña sea correcta.
  - *Ejemplo:* fallos a las 10:00, 10:02, 10:05, 10:08 y 10:10 → hasta las 10:25 el login responde `TOO_MANY_ATTEMPTS` incluso con la contraseña correcta; a las 10:25 vuelve a funcionar.
- **RF-10** — Cuando un usuario inicia sesión con éxito, el sistema deberá poner a cero sus intentos fallidos.
- **RF-11** — Cuando un usuario renueva su sesión con un refresh token válido, el sistema deberá entregar un token de acceso nuevo de 15 minutos y un refresh token nuevo de 7 días desde ese momento, sin que la sesión supere 30 días desde el login, y dejar de aceptar el refresh token anterior (rotación).
  - *Ejemplo:* login el día 1 → renovaciones los días 3, 9 y 15 alargan la sesión; el día 31 la renovación responde `SESSION_EXPIRED` aunque se haya usado a diario.
- **RF-12** — Si el refresh token ha caducado (7 días sin renovar) o la sesión ha alcanzado 30 días desde el login, entonces el sistema deberá rechazar la renovación con el error `SESSION_EXPIRED` y cerrar la sesión.
- **RF-13** — Si llega un refresh token que ya se rotó: dentro de los 30 segundos siguientes a su rotación, el sistema deberá responder con los mismos tokens nuevos que emitió en esa rotación; pasado ese margen, deberá cerrar la sesión (su token de acceso y su refresh token vigentes) y responder con el error `INVALID_REFRESH_TOKEN`. Las demás sesiones de la cuenta no cambian.
  - *Ejemplo:* R3 se rota a R4 a las 10:45:00 → R3 a las 10:45:10 devuelve otra vez R4; R3 a las 10:46:00 cierra la sesión y responde `INVALID_REFRESH_TOKEN`.
- **RF-14** — Si la renovación llega sin refresh token, o con uno que no existe, está mal formado o pertenece a una sesión cerrada, entonces el sistema deberá rechazarla con el error `INVALID_REFRESH_TOKEN`.
- **RF-15** — Cuando un usuario cierra sesión, el sistema deberá cerrar esa sesión (su token de acceso y su refresh token) y borrar sus cookies, también si el token de acceso ha caducado pero el refresh token es válido.
- **RF-16** — El sistema deberá permitir varias sesiones abiertas a la vez para la misma cuenta, independientes entre sí.

### Acceso a las rutas protegidas
Son rutas protegidas todas salvo `GET /auth/csrf`, `POST /auth/register`, `POST /auth/login` y `POST /auth/refresh`. `POST /auth/logout` se identifica con el token de acceso o, si este ha caducado, con el refresh token (RF-15).
- **RF-17** — El sistema deberá identificar al usuario de una ruta protegida solo por el token de acceso de su cookie de sesión.
- **RF-18** — Si una petición a una ruta protegida no lleva la cookie del token de acceso, entonces el sistema deberá rechazarla con el error `MISSING_TOKEN`.
- **RF-19** — Si el token de acceso no existe, está mal formado o pertenece a una sesión cerrada (logout, cambio de contraseña, reutilización de refresh token o cuenta borrada), entonces el sistema deberá rechazar la petición con el error `INVALID_TOKEN`.
- **RF-20** — Si el token de acceso ha caducado (15 minutos) y su sesión sigue abierta, entonces el sistema deberá rechazar la petición con el error `TOKEN_EXPIRED`, para que el cliente renueve la sesión (RF-11).
- **RF-21** — El sistema deberá limitar cada operación a las tareas, la racha, los avisos y la cuenta del usuario de la sesión (sustituye a RF-02 de la 001).

### Protección frente a CSRF
- **RF-22** — Cuando se pide en `GET /auth/csrf`, el sistema deberá entregar un token CSRF previo a la sesión, válido durante 30 minutos y reutilizable dentro de ese tiempo, que solo sirve para registrarse e iniciar sesión.
  - *Ejemplo:* token pedido a las 10:00 → un login fallido a las 10:01 y otro correcto a las 10:02 con el mismo token se aceptan; a las 10:31 el mismo token responde `INVALID_CSRF_TOKEN` y hay que pedir otro.
- **RF-23** — Si una petición `POST`, `PATCH` o `DELETE` no lleva la cabecera `X-CSRF-Token`, o su valor no es un token CSRF válido para esa petición (el previo a la sesión en registro y login; el de la sesión en el resto), entonces el sistema deberá rechazarla con el error `INVALID_CSRF_TOKEN`. Las peticiones `GET` no lo exigen. Si la cabecera llega pero no hay ninguna sesión con la que compararla (sin cookies de sesión, o con una sesión cerrada), el token no se puede juzgar y el sistema deberá responder el error de sesión que corresponda (RF-18, RF-19, RF-14).
  - *Ejemplo:* `POST /tasks` sin `X-CSRF-Token` → `INVALID_CSRF_TOKEN`; con `X-CSRF-Token` y sin cookies → `MISSING_TOKEN`; con la sesión de Ana y el token CSRF de otra sesión → `INVALID_CSRF_TOKEN`.
- **RF-24** — El sistema deberá entregar el token CSRF de la sesión en la respuesta del login y mantenerlo durante toda la sesión, también tras cada renovación (RF-11).

### Cuenta
- **RF-25** — Cuando un usuario consulta su perfil, el sistema deberá devolver su id, email, nombre y fecha de alta, nunca su contraseña.
- **RF-26** — Cuando un usuario edita su perfil, el sistema deberá cambiar solo su nombre (RF-05); si la petición incluye cualquier otro campo, incluido el email, deberá rechazarla con el error `VALIDATION_ERROR`.
- **RF-27** — Cuando un usuario cambia su contraseña indicando la actual correcta y una nueva válida (RF-04), el sistema deberá guardar la nueva, cerrar todas sus demás sesiones y mantener abierta la sesión desde la que lo hace.
- **RF-28** — Si al cambiar la contraseña o al borrar la cuenta la contraseña actual es incorrecta, entonces el sistema deberá rechazar la petición con el error `WRONG_PASSWORD` y contar el fallo para el bloqueo de RF-09.
- **RF-29** — Cuando un usuario borra su cuenta indicando su contraseña correcta, el sistema deberá eliminar de forma definitiva la cuenta, sus tareas, sus avisos, su zona recordada y todas sus sesiones, y borrar sus cookies.

### Hora y zona (cambios sobre la 001)
- **RF-30** — El sistema deberá exigir las cabeceras `X-Client-Time` y `X-Timezone` (RF-23 y RF-31 a RF-33 de la 001) solo en `/tasks`, `/tasks/{id}`, `/streak` y `/alerts`; el resto de rutas no las piden.
- **RF-31** — El sistema deberá recordar la zona de `X-Timezone` (RF-34 de la 001) cuando, en esas rutas, la sesión es válida y las cabeceras de hora y zona son válidas, aunque la petición falle después.

### Transición desde la 001
- **RF-32** — El sistema deberá dejar de usar la cabecera `X-User-Id` y el error `MISSING_USER`: la cabecera desaparece del contrato y, si una petición la incluye, se trata como cualquier cabecera desconocida, sin identificar a nadie ni producir ningún error. No existe ninguna otra forma de identificarse que la sesión (RF-17).
- **RF-33** — Cuando se instala esta funcionalidad, el sistema deberá eliminar las tareas, los avisos y las zonas recordadas que existan, porque pertenecen a identificadores sin cuenta.

### Acceso desde el frontend (CORS)
El frontend se sirve en `https://kompitu.yandrydev.cloud` y la API en `https://apikompitu.yandrydev.cloud`: son orígenes distintos del mismo sitio.
- **RF-35** — Cuando una petición llega desde el origen del frontend (`https://kompitu.yandrydev.cloud` en producción), el sistema deberá permitir que el navegador la envíe con sus cookies y lea la respuesta (CORS con credenciales); a cualquier otro origen no deberá permitírselo. El origen permitido se configura por entorno: en desarrollo es `http://localhost:5173`, con la API en `http://localhost:3000`.
- **RF-36** — Cuando llega una petición previa de CORS (`OPTIONS` con `Origin` y `Access-Control-Request-Method`) desde el origen permitido hacia una ruta y un método que existen, el sistema deberá responder `200` con el sobre de éxito (`data: null`) indicando los métodos y las cabeceras permitidos (`Content-Type`, `X-CSRF-Token`, `X-Client-Time`, `X-Timezone`). Cualquier otra petición `OPTIONS` deberá responder `ROUTE_NOT_FOUND`, como en la 001.
  - *Ejemplo:* `OPTIONS /tasks` desde `https://kompitu.yandrydev.cloud` pidiendo `POST` → `200`; la misma petición desde `https://otra-web.com` → `404 ROUTE_NOT_FOUND`, sin cabeceras CORS.

### Precedencia de errores
- **RF-34** — Si una petición incumple varias reglas a la vez, entonces el sistema deberá responder solo con el primer error de este orden (sustituye a RF-46 de la 001): `ROUTE_NOT_FOUND`; `INVALID_CSRF_TOKEN`; errores de sesión (`MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, o en `POST /auth/refresh` `INVALID_REFRESH_TOKEN` y `SESSION_EXPIRED`); `INVALID_CLIENT_TIME`; `INVALID_TIMEZONE`; `VALIDATION_ERROR` (con todos los campos en `details`); errores de negocio (`TOO_MANY_ATTEMPTS` antes que `INVALID_CREDENTIALS` o `WRONG_PASSWORD`; `EMAIL_ALREADY_REGISTERED`; `TASK_NOT_FOUND`); y `DAY_CLOSED` o `DAY_NOT_STARTED`.
  - *Ejemplo:* `POST /tasks` sin `X-CSRF-Token` y sin cookie de sesión → `INVALID_CSRF_TOKEN`. Login con la cuenta bloqueada y la contraseña incorrecta → `TOO_MANY_ATTEMPTS`. `PATCH /me` con un campo `email` y el token de acceso caducado → `TOKEN_EXPIRED`.

## Contrato de la API

### Resumen de endpoints

| Método | Ruta | Descripción | Sesión | CSRF | Hora y zona | RF |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| GET | `/auth/csrf` | Obtener un token CSRF previo a la sesión | No | No | No | RF-22 |
| POST | `/auth/register` | Crear una cuenta | No | Previo | No | RF-01 a RF-06, RF-23 |
| POST | `/auth/login` | Iniciar sesión | No | Previo | No | RF-07 a RF-10, RF-23, RF-24 |
| POST | `/auth/refresh` | Renovar la sesión | Refresh token | De sesión | No | RF-11 a RF-14 |
| POST | `/auth/logout` | Cerrar la sesión | Acceso o refresh | De sesión | No | RF-15 |
| GET | `/me` | Consultar mi perfil | Sí | No | No | RF-25 |
| PATCH | `/me` | Cambiar mi nombre | Sí | De sesión | No | RF-05, RF-26 |
| PATCH | `/me/password` | Cambiar mi contraseña | Sí | De sesión | No | RF-04, RF-09, RF-27, RF-28 |
| DELETE | `/me` | Borrar mi cuenta | Sí | De sesión | No | RF-09, RF-28, RF-29 |
| * | `/tasks`, `/tasks/{id}`, `/streak`, `/alerts` | Endpoints de la 001, sin cambios en su cuerpo ni en su `data` | Sí | De sesión en `POST`/`PATCH`/`DELETE` | Sí | RF-17 a RF-23, RF-30, RF-31 |

Además, toda ruta y método de esta tabla responde a la petición previa de CORS (`OPTIONS`) desde el origen del frontend (RF-36).

Si una petición tiene varios fallos, se responde según la precedencia de RF-34.

### Convenciones
- **Orígenes:** frontend en `https://kompitu.yandrydev.cloud` y API en `https://apikompitu.yandrydev.cloud` (decisión 18); en desarrollo, frontend en `http://localhost:5173` y API en `http://localhost:3000`. En ambos entornos son orígenes distintos del mismo sitio: la API permite CORS con credenciales solo para el origen del frontend (RF-35, RF-36), y las cookies, que pertenecen a `apikompitu.yandrydev.cloud`, pueden ser `SameSite=Strict`. El frontend envía sus peticiones con credenciales (`credentials: 'include'`).
- **Cookie del token de acceso:** `access_token`, con `HttpOnly`, `Secure`, `SameSite=Strict` y `Path=/`; caduca a los 15 minutos (RF-07).
- **Cookie del refresh token:** `refresh_token`, con `HttpOnly`, `Secure`, `SameSite=Strict` y `Path=/auth`, para que solo viaje a las rutas de sesión; caduca a los 7 días (RF-07, RF-11).
- **Cabecera CSRF:** `X-CSRF-Token`, obligatoria en `POST`, `PATCH` y `DELETE` (RF-23). El token CSRF se entrega en el cuerpo de las respuestas, nunca en una cookie que el navegador envíe solo.
- **Cabeceras de hora y zona:** como en la 001, solo en `/tasks`, `/streak` y `/alerts` (RF-30).
- **Sin tokens de sesión en el cuerpo ni en la URL:** los tokens de acceso y de refresco solo viajan en cookies (RNF-05).
- El resto de convenciones de la 001 se mantienen: campos en inglés y `camelCase`, días `AAAA-MM-DD`, instantes ISO 8601, ids opacos, `message` en español.

### Sobre de respuesta (CONSTITUTION.md, principio VII)
Igual que en la 001: todas las respuestas usan el sobre de éxito o el de error. En cada endpoint solo se describe el contenido de `data` o el código de error.

### Recurso `User`

```json
{
  "id": "6f1c9a52-3e0b-4f6e-9a77-1c2d3e4f5a6b",
  "email": "ana@example.com",
  "name": "Ana",
  "createdAt": "2026-10-28T09:15:00Z"
}
```

`name` es `null` si el usuario no lo ha indicado. La contraseña nunca aparece en ninguna respuesta (RNF-04).

### GET `/auth/csrf`

**Respuestas:**
- `200 OK` → `data`: token CSRF previo a la sesión (RF-22).

```json
{
  "success": true,
  "status": 200,
  "message": "Operación realizada con éxito",
  "data": { "csrfToken": "…" }
}
```

### POST `/auth/register`

**Cabeceras:** `X-CSRF-Token` con el token de `GET /auth/csrf`.

**Cuerpo:**

```json
{ "email": "ana@example.com", "password": "correct horse battery", "name": "Ana" }
```

| Campo | Tipo | Obligatorio | Restricciones |
| :--- | :--- | :--- | :--- |
| `email` | string | Sí | Formato de email, ≤ 254 caracteres; se guarda en minúsculas (RF-02, RF-03) |
| `password` | string | Sí | 12–128 caracteres, sin reglas de composición (RF-04) |
| `name` | string \| null | No | ≤ 100 caracteres tras recortar espacios; vacío se guarda como `null` (RF-05) |

**Respuestas:**
- `201 Created` → `data`: recurso `User` creado. No abre sesión: para entrar hay que llamar a `POST /auth/login` (RF-06).

```json
{
  "success": true,
  "status": 201,
  "message": "Cuenta creada con éxito",
  "data": { "id": "…", "email": "ana@example.com", "name": "Ana", "createdAt": "…" }
}
```

- `400 Bad Request` → `VALIDATION_ERROR`.
- `403 Forbidden` → `INVALID_CSRF_TOKEN`.
- `409 Conflict` → `EMAIL_ALREADY_REGISTERED` (RF-03).

### POST `/auth/login`

**Cabeceras:** `X-CSRF-Token` con el token de `GET /auth/csrf`.

**Cuerpo:**

```json
{ "email": "ana@example.com", "password": "correct horse battery" }
```

**Respuestas:**
- `200 OK` → `Set-Cookie: access_token` y `Set-Cookie: refresh_token` (RF-07); `data`: el usuario y el token CSRF de la sesión (RF-24).

```json
{
  "success": true,
  "status": 200,
  "message": "Sesión iniciada con éxito",
  "data": {
    "user": { "id": "…", "email": "ana@example.com", "name": "Ana", "createdAt": "…" },
    "csrfToken": "…"
  }
}
```

- `400 Bad Request` → `VALIDATION_ERROR`.
- `401 Unauthorized` → `INVALID_CREDENTIALS` (RF-08).
- `403 Forbidden` → `INVALID_CSRF_TOKEN`.
- `429 Too Many Requests` → `TOO_MANY_ATTEMPTS` (RF-09).

### POST `/auth/refresh`

**Cabeceras:** `X-CSRF-Token` de la sesión. **Cookie:** `refresh_token`.

**Respuestas:**
- `200 OK` → cookies `access_token` y `refresh_token` nuevas (RF-11); `data`: `null`. El token CSRF de la sesión no cambia (RF-24).
- `401 Unauthorized` → `INVALID_REFRESH_TOKEN` (RF-13, RF-14) o `SESSION_EXPIRED` (RF-12); en ambos casos se borran las cookies.
- `403 Forbidden` → `INVALID_CSRF_TOKEN`.

### POST `/auth/logout`

**Cabeceras:** `X-CSRF-Token` de la sesión. **Cookies:** `access_token` o, si ha caducado, `refresh_token`.

**Respuestas:**
- `200 OK` → borra las cookies; `data`: `null`, `message`: "Sesión cerrada con éxito" (RF-15).
- `401 Unauthorized` → `MISSING_TOKEN` o `INVALID_TOKEN`.
- `403 Forbidden` → `INVALID_CSRF_TOKEN`.

### GET `/me`

**Respuestas:**
- `200 OK` → `data`: recurso `User` (RF-25).
- `401 Unauthorized` → `MISSING_TOKEN`, `INVALID_TOKEN` o `TOKEN_EXPIRED`.

### PATCH `/me`

**Cabeceras:** `X-CSRF-Token` de la sesión.

**Cuerpo:**

```json
{ "name": "Ana García" }
```

| Campo | Tipo | Obligatorio | Restricciones |
| :--- | :--- | :--- | :--- |
| `name` | string \| null | Sí | ≤ 100 caracteres tras recortar espacios; `null` o vacío lo borra (RF-05) |

Cualquier otro campo, incluido `email`, responde `VALIDATION_ERROR` (RF-26).

**Respuestas:**
- `200 OK` → `data`: recurso `User` actualizado; `message`: "Perfil actualizado con éxito".
- `400 Bad Request` → `VALIDATION_ERROR`.
- `401 Unauthorized` → `MISSING_TOKEN`, `INVALID_TOKEN` o `TOKEN_EXPIRED`.
- `403 Forbidden` → `INVALID_CSRF_TOKEN`.

### PATCH `/me/password`

**Cabeceras:** `X-CSRF-Token` de la sesión.

**Cuerpo:**

```json
{ "currentPassword": "correct horse battery", "newPassword": "otra frase bastante larga" }
```

| Campo | Tipo | Obligatorio | Restricciones |
| :--- | :--- | :--- | :--- |
| `currentPassword` | string | Sí | La contraseña actual de la cuenta (RF-28) |
| `newPassword` | string | Sí | 12–128 caracteres (RF-04) |

**Respuestas:**
- `200 OK` → `data`: `null`; `message`: "Contraseña cambiada con éxito". Las demás sesiones de la cuenta quedan cerradas (RF-27).
- `400 Bad Request` → `VALIDATION_ERROR`.
- `401 Unauthorized` → `MISSING_TOKEN`, `INVALID_TOKEN` o `TOKEN_EXPIRED`.
- `403 Forbidden` → `INVALID_CSRF_TOKEN` o `WRONG_PASSWORD` (RF-28).
- `429 Too Many Requests` → `TOO_MANY_ATTEMPTS` (RF-09).

### DELETE `/me`

**Cabeceras:** `X-CSRF-Token` de la sesión.

**Cuerpo:**

```json
{ "password": "correct horse battery" }
```

**Respuestas:**
- `200 OK` → borra las cookies; `data`: `null`; `message`: "Cuenta eliminada con éxito" (RF-29).
- `400 Bad Request` → `VALIDATION_ERROR`.
- `401 Unauthorized` → `MISSING_TOKEN`, `INVALID_TOKEN` o `TOKEN_EXPIRED`.
- `403 Forbidden` → `INVALID_CSRF_TOKEN` o `WRONG_PASSWORD` (RF-28).
- `429 Too Many Requests` → `TOO_MANY_ATTEMPTS` (RF-09).

### Endpoints de la 001 (`/tasks`, `/tasks/{id}`, `/streak`, `/alerts`)

Su cuerpo, su query y su `data` no cambian. Cambia cómo se identifica al usuario:
- En lugar de `X-User-Id`, llevan la cookie `access_token` (RF-17).
- `POST /tasks`, `PATCH /tasks/{id}` y `DELETE /tasks/{id}` llevan además `X-CSRF-Token` de la sesión (RF-23).
- Siguen llevando `X-Client-Time` y `X-Timezone` (RF-30).
- En lugar de `401 MISSING_USER`, pueden responder `401 MISSING_TOKEN`, `INVALID_TOKEN` o `TOKEN_EXPIRED`, y `403 INVALID_CSRF_TOKEN`.

### Códigos de error

Todos se devuelven con el sobre de error. `details` solo aparece en `VALIDATION_ERROR`. Si una petición tiene varios fallos, se devuelve solo el de menor orden (RF-34). `INTERNAL_ERROR` queda fuera del orden.

| Orden | Código | HTTP | Cuándo |
| :--- | :--- | :--- | :--- |
| 1 | `ROUTE_NOT_FOUND` | 404 | La ruta o el método pedidos no existen en la API |
| 2 | `INVALID_CSRF_TOKEN` | 403 | `POST`, `PATCH` o `DELETE` sin `X-CSRF-Token` o con un token que no es válido para esa petición (RF-23) |
| 3 | `MISSING_TOKEN` | 401 | Ruta protegida sin la cookie `access_token` (RF-18) |
| 3 | `INVALID_TOKEN` | 401 | Token de acceso inexistente, mal formado o de una sesión cerrada (RF-19) |
| 3 | `TOKEN_EXPIRED` | 401 | Token de acceso caducado con la sesión abierta: hay que renovarla (RF-20) |
| 3 | `INVALID_REFRESH_TOKEN` | 401 | En `/auth/refresh`: falta, no existe, mal formado, de una sesión cerrada o reutilizado fuera del margen (RF-13, RF-14) |
| 3 | `SESSION_EXPIRED` | 401 | En `/auth/refresh`: 7 días sin renovar o 30 días desde el login: hay que volver a iniciar sesión (RF-12) |
| 4 | `INVALID_CLIENT_TIME` | 400 | Como en la 001, solo en `/tasks`, `/streak` y `/alerts` (RF-30) |
| 5 | `INVALID_TIMEZONE` | 400 | Como en la 001, solo en `/tasks`, `/streak` y `/alerts` (RF-30) |
| 6 | `VALIDATION_ERROR` | 400 | Cuerpo, parámetros o query no válidos, incluido JSON mal formado (RF-02, RF-04, RF-05, RF-26 y los de la 001) |
| 7 | `TOO_MANY_ATTEMPTS` | 429 | Email o cuenta bloqueados 15 minutos tras 5 fallos (RF-09) |
| 7 | `INVALID_CREDENTIALS` | 401 | Login con email o contraseña incorrectos (RF-08) |
| 7 | `WRONG_PASSWORD` | 403 | Contraseña actual incorrecta al cambiarla o al borrar la cuenta (RF-28) |
| 7 | `EMAIL_ALREADY_REGISTERED` | 409 | El email ya pertenece a una cuenta (RF-03) |
| 7 | `TASK_NOT_FOUND` | 404 | Como en la 001 |
| 8 | `DAY_CLOSED` | 409 | Como en la 001 |
| 8 | `DAY_NOT_STARTED` | 409 | Como en la 001 |
| — | `INTERNAL_ERROR` | 500 | Error inesperado del servidor |

`MISSING_USER` de la 001 desaparece. Dentro del orden 7, `TOO_MANY_ATTEMPTS` va antes que `INVALID_CREDENTIALS` y `WRONG_PASSWORD`; los demás no coinciden nunca en la misma ruta.

## Requisitos no funcionales (RNF-xx, sin tecnología)

- **RNF-01** — RNF-01 de la 001 (p95 < 300 ms) se aplica también a todos los endpoints de esta spec, incluidos el registro y el login, aunque comprobar una contraseña sea lento a propósito.
- **RNF-02** — El 100 % de las respuestas lleva el campo `message` en español (RNF-03 de la 001).
- **RNF-03** — El sistema deberá guardar las contraseñas de forma que no se puedan recuperar a partir de lo guardado, ni siquiera con acceso a la base de datos.
- **RNF-04** — Ninguna respuesta, registro de la aplicación ni mensaje de error deberá contener una contraseña, un token de acceso o un refresh token.
- **RNF-05** — Los tokens de acceso y de refresco solo deberán viajar en cookies que los scripts del navegador no pueden leer, y nunca en el cuerpo de una respuesta ni en la URL.
- **RNF-06** — El sistema deberá guardar los tokens de sesión de forma que una copia de la base de datos no permita usarlos.

## Casos límite

- Email con mayúsculas o espacios al principio o al final → se guarda en minúsculas y recortado; el login con cualquier combinación de mayúsculas funciona (RF-03).
- Email de exactamente 254 caracteres → se acepta; de 255 → `VALIDATION_ERROR` (RF-02).
- Contraseña de exactamente 12 caracteres → se acepta; de 11 → `VALIDATION_ERROR`; de 128 → se acepta; de 129 → `VALIDATION_ERROR` (RF-04).
- Contraseña con espacios o caracteres no ASCII (`"contraseña con ñ y emojis 🙂"`) → se acepta tal cual; no se recorta (RF-04).
- Login con un email que no existe → `INVALID_CREDENTIALS`, igual que con contraseña incorrecta (RF-08).
- Registro sin `X-CSRF-Token` → `INVALID_CSRF_TOKEN` (RF-23).
- Login con el token CSRF de una sesión (en lugar del previo de `GET /auth/csrf`) → `INVALID_CSRF_TOKEN` (RF-23).
- Token previo a la sesión usado en un segundo intento de login 1 minuto después → se acepta; usado 31 minutos después de pedirlo → `INVALID_CSRF_TOKEN` (RF-22).
- Token previo a la sesión usado en `POST /tasks` → `INVALID_CSRF_TOKEN`: solo sirve para registro y login (RF-22, RF-23).
- `GET /tasks` sin `X-CSRF-Token` y con sesión válida → `200`: los `GET` no lo exigen (RF-23).
- Quinto login fallido → `INVALID_CREDENTIALS`; el sexto, aunque sea con la contraseña correcta → `TOO_MANY_ATTEMPTS` (RF-09).
- 4 fallos, un login correcto y otros 4 fallos → no se bloquea, porque el login correcto pone el contador a cero (RF-10).
- 3 logins fallidos y 2 contraseñas actuales incorrectas en `PATCH /me/password` en 15 minutos → bloqueo (RF-09, RF-28).
- Con la cuenta bloqueada, la sesión ya abierta sigue funcionando para tareas, racha, avisos y `GET /me` (RF-09).
- Token de acceso caducado en `GET /tasks` → `TOKEN_EXPIRED`; tras `POST /auth/refresh`, la misma petición → `200` (RF-20, RF-11).
- Dos pestañas renuevan con el mismo refresh token con 5 segundos de diferencia → las dos reciben los mismos tokens nuevos y la sesión sigue abierta (RF-13).
- Refresh token rotado usado 31 segundos después → se cierra la sesión: el siguiente `GET /me` con su token de acceso → `INVALID_TOKEN` (RF-13, RF-19).
- Refresh tras 7 días sin usar la app → `SESSION_EXPIRED` (RF-12).
- Sesión usada a diario durante 30 días → el refresh del día 31 responde `SESSION_EXPIRED` (RF-11, RF-12).
- Logout con el token de acceso caducado y el refresh token válido → `200` y la sesión queda cerrada (RF-15).
- Logout dos veces seguidas → el segundo responde `MISSING_TOKEN` (las cookies ya se borraron) o `INVALID_TOKEN` si el cliente las conserva (RF-15, RF-19).
- Cambiar la contraseña con la nueva igual a la actual → se acepta y cierra las demás sesiones (RF-27).
- Cambiar la contraseña desde el móvil → la sesión del portátil responde `INVALID_TOKEN` en su siguiente petición, y su refresh token `INVALID_REFRESH_TOKEN` (RF-27, RF-19, RF-14).
- `PATCH /me` con `{ "email": "otro@example.com" }` → `VALIDATION_ERROR` (RF-26).
- `PATCH /me` con `{ "name": "   " }` → `200` con `name: null` (RF-05).
- Borrar la cuenta y volver a registrarse con el mismo email → se acepta, como una cuenta nueva sin datos (RF-29, RF-01).
- Tras borrar la cuenta, el login con ese email → `INVALID_CREDENTIALS` (RF-29, RF-08).
- Petición con `X-User-Id: otro-usuario` y la sesión de Ana → se usan los datos de Ana; la cabecera no tiene ningún efecto (RF-32).
- Petición con `X-User-Id: ana` y sin cookie de sesión → `MISSING_TOKEN`: la cabecera ya no permite actuar como Ana (RF-18, RF-32).
- `GET /me` sin `X-Client-Time` ni `X-Timezone` → `200` (RF-30).
- Preflight `OPTIONS /auth/login` desde `https://kompitu.yandrydev.cloud` → `200` con las cabeceras CORS; el `POST` siguiente lleva las cookies y su respuesta es legible para el frontend (RF-35, RF-36).
- Preflight desde `https://otra-web.com` → `404 ROUTE_NOT_FOUND` sin cabeceras CORS: el navegador bloquea la petición (RF-35, RF-36).
- Preflight a una ruta inexistente (`OPTIONS /foo`) desde el origen permitido → `ROUTE_NOT_FOUND` (RF-36).
- Petición sin cabecera `Origin` (Postman, `curl`) → se atiende con normalidad: CORS solo lo aplica el navegador (S-06).
- `GET /tasks` con sesión válida y sin `X-Client-Time` → `INVALID_CLIENT_TIME` (RF-30).
- `POST /tasks` sin `X-CSRF-Token`, sin cookie y con el reloj desviado → `INVALID_CSRF_TOKEN` (RF-34).
- `PATCH /me/password` con la cuenta bloqueada y un cuerpo sin `newPassword` → `VALIDATION_ERROR`, que va antes que `TOO_MANY_ATTEMPTS` (RF-34).

## Fuera de alcance

- Recuperar una contraseña olvidada y verificar el email: necesitan enviar emails y quedan para un MVP posterior dedicado al envío de emails.
- Cambiar el email de la cuenta.
- Iniciar sesión con proveedores externos (Google, GitHub…) o con un segundo factor (2FA).
- Ver o cerrar una a una las sesiones abiertas en otros dispositivos.
- Roles, administradores o acceso de un usuario a los datos de otro.
- Autenticación con `Authorization: Bearer` para scripts o apps móviles: este MVP usa cookies (decisión 1).
- Permitir el acceso con cookies desde orígenes distintos del frontend (otras webs, otros subdominios): solo `https://kompitu.yandrydev.cloud` en producción (RF-35).

## Criterios de éxito (CE-xx)

- **CE-01** — Una persona nueva puede crear su cuenta, iniciar sesión y crear su primera tarea con 4 peticiones: `GET /auth/csrf`, `POST /auth/register`, `POST /auth/login` y `POST /tasks`.
- **CE-02** — 0 peticiones a rutas protegidas atendidas sin una sesión válida, y 0 casos en los que un usuario lea o modifique datos de otro, tampoco enviando su identificador en `X-User-Id` (sustituye a CE-03 de la 001).
- **CE-03** — 0 peticiones `POST`, `PATCH` o `DELETE` atendidas sin un `X-CSRF-Token` válido.
- **CE-04** — El 100 % de los refresh tokens reutilizados fuera del margen de 30 segundos cierran su sesión.
- **CE-05** — 0 contraseñas o tokens de sesión legibles en las respuestas, en los registros de la aplicación o en la base de datos.

## Supuestos

- **S-01** — El email no se puede cambiar en este MVP.
- **S-02** — La nueva contraseña cumple las mismas reglas que en el registro y puede coincidir con la anterior.
- **S-03** — El bloqueo de RF-09 solo afecta al login y a las rutas que piden la contraseña; las sesiones ya abiertas siguen funcionando.
- **S-06** — Postman y `curl` siguen pudiendo usar la API: guardan las cookies y envían `X-CSRF-Token` a mano. En desarrollo, sin HTTPS, las cookies `Secure` funcionan con `localhost`, que los navegadores tratan como origen seguro.
- **S-07** — La zona recordada se borra con la cuenta (RF-29): un usuario que vuelve a registrarse con el mismo email no recibe avisos hasta su primera petición a `/tasks`, `/streak` o `/alerts`.

## Clarificaciones

- **2026-10-28** — ¿Cómo se identifican los usuarios? → Registro y login propios con email y contraseña; la API emite sus propios tokens (decisión 1).
- **2026-10-28** — ¿Qué pasa con `X-User-Id` y los datos de la 001? → Corte limpio: se elimina de la API (cabecera y `MISSING_USER`), sin ninguna vía alternativa de identificación, y la migración borra tareas, avisos y zonas existentes (decisión 2).
- **2026-10-28** — ¿Reglas de email y contraseña? → Email válido, ≤ 254, único sin distinguir mayúsculas y guardado en minúsculas; contraseña de 12 a 128 caracteres sin reglas de composición; email repetido → `409 EMAIL_ALREADY_REGISTERED` (decisión 4).
- **2026-10-28** — ¿Protección frente a fuerza bruta? → 5 fallos en 15 minutos bloquean el email 15 minutos (`429 TOO_MANY_ATTEMPTS`); un login correcto pone el contador a cero; login fallido siempre `401 INVALID_CREDENTIALS` genérico (decisión 5).
- **2026-10-28** — ¿Gestión de la cuenta? → `GET /me`, `PATCH /me` (nombre opcional), `PATCH /me/password` (cierra las demás sesiones) y `DELETE /me` (pide la contraseña y borra todo) (decisión 6).
- **2026-10-28** — ¿Recuperación de contraseña y verificación de email? → Fuera de alcance; un MVP posterior dedicado al envío de emails (decisión 7).
- **2026-10-28** — ¿Qué rutas piden `X-Client-Time` y `X-Timezone`? → Solo `/tasks`, `/streak` y `/alerts` (decisión 9).
- **2026-10-28** — ¿El registro abre sesión? → No: responde `201` solo con el usuario; para entrar hay que hacer login (decisión 10).
- **2026-10-28** — ¿Contraseña actual incorrecta al cambiarla o borrar la cuenta? → `403 WRONG_PASSWORD`, que suma al contador del bloqueo (decisión 11).
- **2026-10-28** — ¿Dónde viaja la sesión? → En cookies `HttpOnly`, no en `Authorization: Bearer`; protección CSRF obligatoria (sustituye a la primera versión de la decisión 1).
- **2026-10-28** — ¿Qué rutas exigen CSRF? → Todos los `POST`, `PATCH` y `DELETE`, incluidos login y registro con un token previo a la sesión de `GET /auth/csrf`; los `GET` no (decisión 12).
- **2026-10-28** — ¿Cuánto vale el token CSRF previo a la sesión? → 30 minutos, reutilizable dentro de ese tiempo, para que un login fallido se pueda repetir sin pedir otro token (decisión 16).
- **2026-10-28** — ¿Qué responde un `POST` con `X-CSRF-Token` pero sin sesión con la que compararlo? (detectado al planificar) → El error de sesión (`MISSING_TOKEN`, `INVALID_TOKEN` o, en `/auth/refresh`, `INVALID_REFRESH_TOKEN`); `INVALID_CSRF_TOKEN` solo si falta la cabecera o si, habiendo sesión, el token no coincide (decisión 19, RF-23).
- **2026-10-28** — ¿Dónde se sirve el frontend y qué atributos llevan las cookies? → Frontend en `https://kompitu.yandrydev.cloud` y API en el subdominio `https://apikompitu.yandrydev.cloud`: CORS con credenciales solo para el origen del frontend, preflight `OPTIONS` respondido con `200` y el sobre de éxito; `access_token` y `refresh_token` con `HttpOnly`, `Secure` y `SameSite=Strict`, y `refresh_token` con `Path=/auth` (decisión 18).
- **2026-10-28** — ¿El token CSRF de la sesión cambia al renovar? → No: se entrega en el login y vale toda la sesión, también tras cada refresh, para que las pestañas que no renovaron sigan funcionando; muere al cerrarse la sesión (decisión 17, RF-24).
- **2026-10-28** — ¿Duración de la sesión? → Token de acceso de 15 minutos; refresh token de 7 días desde el último refresh, con rotación; tope de 30 días desde el login (decisión 13; sustituye a la sesión fija de 7 días de la decisión 3).
- **2026-10-28** — ¿Refresh token reutilizado? → Margen de gracia de 30 segundos que devuelve los mismos tokens; pasado el margen, se cierra esa sesión y responde `INVALID_REFRESH_TOKEN` (decisión 14).
- **2026-10-28** — ¿Errores de sesión y precedencia? → `ROUTE_NOT_FOUND` → `INVALID_CSRF_TOKEN` → errores de sesión (`MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_REFRESH_TOKEN`, `SESSION_EXPIRED`) → hora → zona → validación → negocio → día (decisión 15; sustituye a la decisión 8). Una sesión cerrada responde `INVALID_TOKEN`, igual que un token inventado.

## Registro de cambios

- **2026-10-28** — Creación de la spec con las decisiones 1 a 15 de la fase de clarificación, tomando como plantilla la spec de la 001. Estado → *Clarificada*, pendiente de la aprobación del responsable del proyecto.
- **2026-10-28** — *Contexto* reescrito con un ejemplo de la suplantación de la 001 y cómo la elimina esta funcionalidad; nuevo caso límite (`X-User-Id` sin sesión → `MISSING_TOKEN`) y CE-02 ampliado.
- **2026-10-28** — `X-User-Id` se elimina de la API en lugar de solo ignorarse: RF-32 reescrito (desaparecen la cabecera y `MISSING_USER`, y la sesión es la única forma de identificarse); *Contexto* y tabla de relación con la 001 ajustados.
- **2026-10-28** — Decisión 16: el token CSRF previo a la sesión vale 30 minutos y es reutilizable; pasa del supuesto S-04 (60 minutos) a RF-22, con ejemplo y dos casos límite nuevos. S-04 eliminado.
- **2026-10-28** — Decisión 17: confirmado RF-24 (token CSRF de sesión estable durante toda la sesión).
- **2026-10-28** — Decisión 18: frontend en el mismo dominio y atributos de las cookies confirmados; el supuesto S-05 pasa a *Convenciones* y a *Clarificaciones* y se elimina.
- **2026-10-28** — Decisión 18 concretada: frontend en `https://yandrydev.cloud` y API en `https://api.yandrydev.cloud`; añadidos RF-35 (CORS con credenciales solo para el origen del frontend) y RF-36 (preflight `OPTIONS` con `200`, excepción a la regla de la 001 de responder `ROUTE_NOT_FOUND` a todo `OPTIONS`); *Convenciones*, *Relación con la 001*, *Fuera de alcance* y casos límite ajustados.
- **2026-10-28** — Dominios definitivos de la decisión 18: frontend en `https://kompitu.yandrydev.cloud` y API en `https://apikompitu.yandrydev.cloud` (antes `yandrydev.cloud` y `api.yandrydev.cloud`).
- **2026-10-28** — Orígenes de desarrollo: frontend en `http://localhost:5173` (origen permitido por CORS) y API en `http://localhost:3000`, sin cambios en la API (RF-35, *Convenciones*).
- **2026-10-28** — Spec aprobada por el responsable del proyecto; estado → *Aprobada*.
- **2026-10-28** — Decisión 19 (detectada al planificar): RF-23 precisa qué responde un `X-CSRF-Token` sin sesión con la que compararlo, con ejemplo; coherente con el caso límite de «logout dos veces».
