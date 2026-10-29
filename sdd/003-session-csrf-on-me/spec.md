# Feature: Token CSRF de la sesión en `GET /me`
Rama: 003-session-csrf-on-me · Estado: Aprobada · Fecha: 2026-10-29

## Contexto y objetivo

El frontend (TaskFrontSDD) guarda el token CSRF de la sesión solo en memoria, porque no puede guardar ningún dato de sesión en el navegador fuera de las cookies (RNF-06 de su spec 001). Hoy ese token solo llega en la respuesta de `POST /auth/login` (RF-24 de la 002). Al recargar la página, el frontend lo pierde:
- Toda petición `POST`, `PATCH` o `DELETE` responde `INVALID_CSRF_TOKEN`, incluida la renovación de la sesión.
- El usuario tiene que volver a iniciar sesión cada vez que recarga.

Esta funcionalidad hace que `GET /me` devuelva también el token CSRF de la sesión, para que el frontend lo recupere al arrancar.

## Relación con la funcionalidad 002

Esta spec **modifica** la 002 (`sdd/002-user-accounts/spec.md`), que no se edita. Donde se contradicen, prevalece esta:

| De la 002 | Queda así |
| :--- | :--- |
| RF-25 (`GET /me` devuelve id, email, nombre y fecha de alta) | Ampliado por RF-01: `data` pasa a ser `{ user, csrfToken }`, con la misma forma que la respuesta del login. |
| RF-24 (el token CSRF se entrega en la respuesta del login) | Ampliado por RF-01: también se entrega en `GET /me`. |
| Contrato `GET /me` → `data`: recurso `User` | Sustituido por `data: { user: User, csrfToken: string }`. |
| Resumen de endpoints: `GET /me` → RF-25 | RF-25 de la 002 y RF-01 a RF-04 de esta spec. |
| RNF-06 (una copia de la base de datos no permite usar los tokens de sesión) | Sigue vigente y se aplica también al token CSRF de la sesión, aunque ahora el sistema deba poder devolverlo (RNF-04 de esta spec). |

El resto de la 002 no cambia. En particular, `PATCH /me` sigue devolviendo el recurso `User` (RF-03 de esta spec).

## Historias de usuario (con prioridad y prueba independiente)

### HU-01 — Recuperar el token CSRF de mi sesión (P1)
Como cliente con una sesión abierta, quiero obtener el token CSRF de esa sesión en cualquier momento, para seguir haciendo peticiones que lo exigen sin volver a iniciar sesión.
- **Por qué P1:** sin esto, el frontend obliga a volver a iniciar sesión en cada recarga.
- **Prueba independiente:** iniciar sesión, guardar el `csrfToken` del login, llamar a `GET /me` y comprobar que devuelve el mismo `csrfToken`; con él, `POST /tasks` responde `201`.
- **Escenarios:**
  - Dada una sesión abierta, cuando el cliente llama a `GET /me`, entonces recibe su cuenta en `data.user` y el token CSRF de esa sesión en `data.csrfToken`.
  - Dada una sesión renovada con `POST /auth/refresh`, cuando el cliente llama a `GET /me`, entonces recibe el mismo token CSRF que en el login (RF-24 de la 002).
  - Dadas dos sesiones de la misma cuenta, cuando cada una llama a `GET /me`, entonces cada una recibe su propio token CSRF.
- **RF:** RF-01 a RF-04.

## Requisitos funcionales (EARS, con ID RF-xx)

Los RF de esta spec se numeran desde RF-01 dentro de la funcionalidad 003. Cuando se cita un requisito de otra funcionalidad se indica («RF-24 de la 002»).

- **RF-01** — Cuando un usuario consulta su perfil con una sesión válida, el sistema deberá devolver en `data` su cuenta (`user`, con los campos de RF-25 de la 002) y el token CSRF de esa sesión (`csrfToken`).
- **RF-02** — El sistema deberá devolver en `GET /me` el mismo token CSRF que entregó en el login de esa sesión, durante toda la sesión y también tras cada renovación (RF-24 de la 002).
- **RF-03** — El sistema deberá mantener sin cambios la respuesta de `PATCH /me`: el recurso `User`, sin token CSRF.
- **RF-04** — Cuando se instala esta funcionalidad, el sistema deberá cerrar todas las sesiones abiertas, porque no conservan lo necesario para devolver su token CSRF (RF-02); cada usuario vuelve a iniciar sesión una vez.

## Contrato de la API

### GET `/me`

**Respuestas:**
- `200 OK` → `data`: la cuenta y el token CSRF de la sesión (RF-01, RF-02). La respuesta no puede guardarse en ninguna caché (RNF-03).

```json
{
  "success": true,
  "status": 200,
  "message": "Operación realizada con éxito",
  "data": {
    "user": { "id": "…", "email": "ana@example.com", "name": "Ana", "createdAt": "…" },
    "csrfToken": "…"
  }
}
```

- `401 Unauthorized` → `MISSING_TOKEN`, `INVALID_TOKEN` o `TOKEN_EXPIRED`, sin cambios respecto a la 002.

El resto de endpoints no cambia.

## Requisitos no funcionales (RNF-xx, sin tecnología)

- **RNF-01** — RNF-01 de la 001 (p95 < 300 ms) se mantiene en `GET /me`.
- **RNF-02** — `GET /me` no expone ningún token de acceso ni de refresco en el cuerpo (RNF-04 y RNF-05 de la 002 siguen vigentes): solo el token CSRF, que ya viajaba en el cuerpo del login.
- **RNF-03** — Ni el navegador ni ningún intermediario deberán poder guardar en caché la respuesta de `GET /me`, porque lleva el token CSRF de la sesión.
- **RNF-04** — RNF-06 de la 002 sigue vigente para el token CSRF de la sesión: aunque el sistema lo conserve para poder devolverlo (RF-02), una copia de la base de datos sola no deberá permitir obtenerlo ni usarlo.

## Casos límite

- `GET /me` justo tras el login → `csrfToken` igual al de la respuesta del login (RF-02).
- `GET /me` tras `POST /auth/refresh` → el mismo `csrfToken` (RF-02, RF-24 de la 002).
- `GET /me` con el token de acceso caducado → `TOKEN_EXPIRED`; tras renovar, `200` con el mismo `csrfToken`.
- `GET /me` de una sesión cerrada por cambio de contraseña desde otro dispositivo → `INVALID_TOKEN`, sin token CSRF.
- Dos pestañas de la misma sesión → el mismo `csrfToken` en ambas.
- Dos sesiones de la misma cuenta → `csrfToken` distintos; el de una responde `INVALID_CSRF_TOKEN` en la otra (RF-23 de la 002).
- `PATCH /me` → `data` es el recurso `User`, sin `csrfToken` (RF-03).
- Sesión abierta antes de instalar esta funcionalidad → `GET /me` y el resto de rutas protegidas responden `INVALID_TOKEN`; tras un nuevo login, `GET /me` devuelve su `csrfToken` (RF-04).
- Volver a pedir `GET /me` (recarga, botón «atrás») → la respuesta se pide de nuevo a la API, nunca sale de una caché (RNF-03).

## Fuera de alcance

- Rotar el token CSRF de la sesión: sigue siendo estable durante toda la sesión (decisión 17 de la 002).
- Un endpoint dedicado para el token CSRF de la sesión: `GET /me` ya es la consulta que un cliente hace al arrancar.
- Cambios en `GET /auth/csrf` (token previo a la sesión).
- Impedir que se guarden en caché las respuestas del resto de rutas protegidas (`/tasks`, `/streak`, `/alerts`, `PATCH /me`…): cambia endpoints de la 001 y la 002 y, si se quiere, irá en su propia funcionalidad.

## Criterios de éxito (CE-xx)

- **CE-01** — Con una sesión abierta, un cliente que solo conserva las cookies puede crear una tarea con 2 peticiones: `GET /me` y `POST /tasks`.
- **CE-02** — 0 respuestas de `GET /me` con un token de acceso o de refresco en el cuerpo.

## Supuestos

- **S-01** — Devolver el token CSRF en el cuerpo no debilita la protección frente a CSRF: una web de otro origen no puede leer la respuesta, porque CORS solo permite leerla al origen del frontend (RF-35 de la 002). Es el mismo criterio por el que el login ya lo devuelve en el cuerpo.
- **S-02** — El único cliente de `GET /me` es TaskFrontSDD, que aún no está en producción, así que cambiar la forma de `data` y cerrar las sesiones abiertas al instalar esta funcionalidad (RF-04) no rompe a nadie. La colección de Postman de la 002 se actualiza en el plan de esta funcionalidad.

## Clarificaciones

- **2026-10-29** — ¿Cómo recupera el frontend el token CSRF tras recargar sin guardarlo en el navegador? → `GET /me` lo devuelve (decisión del responsable del proyecto, detectada al planificar la spec 001 de TaskFrontSDD).
- **2026-10-29** — ¿Forma de `data` en `GET /me`? → `{ user, csrfToken }`, la misma que en el login; `PATCH /me` sigue devolviendo solo `User`.
- **2026-10-29** — La 002 solo guarda la huella del token CSRF de la sesión, así que no puede devolver «el mismo token que el login» (RF-02). ¿Cómo se recupera? (detectado en la revisión de QA) → El sistema conserva además una copia del token que solo el servidor puede descifrar; se descartan generar un token nuevo en cada `GET /me` (invalida las demás pestañas y contradice la decisión 17 de la 002) y derivarlo de la sesión. Las sesiones abiertas antes de instalar la funcionalidad no tienen esa copia y se cierran al instalarla (RF-04).
- **2026-10-29** — `GET /me` pasa a llevar un secreto en una petición `GET`: ¿qué respuestas no deben guardarse en caché? → Solo la de `GET /me` (RNF-03); el resto de rutas protegidas queda fuera de alcance.
- **2026-10-29** — ¿Sigue vigente RNF-06 de la 002 para el token CSRF de la sesión, ahora que debe poder devolverse? → Sí: una copia de la base de datos sola no permite obtenerlo ni usarlo (RNF-04).

## Registro de cambios

- **2026-10-29** — Creación de la spec con las dos clarificaciones. Sin marcas `[NEEDS CLARIFICATION]`. Estado → *Clarificada*, pendiente de la aprobación del responsable del proyecto.
- **2026-10-29** — Revisión de QA contra CONSTITUTION.md y AGENTS.md: tres clarificaciones nuevas (recuperar el token, caché y RNF-06 de la 002). Se añaden RF-04, RNF-03, RNF-04, dos casos límite, un punto fuera de alcance y dos filas en la relación con la 002; se precisa la referencia a RF-03. Sin marcas `[NEEDS CLARIFICATION]`. Estado → *Clarificada*, pendiente de la aprobación del responsable del proyecto.
- **2026-10-29** — Aprobada por el responsable del proyecto. Estado → *Aprobada*.
