# Feature: TaskApiSDD MVP — tareas diarias, rachas y avisos
Rama: 001-taskApiSDD-mvp · Estado: Borrador · Fecha: 2026-10-24

## Contexto y objetivo

Quien organiza su trabajo en tareas diarias pierde la constancia porque no ve si está cumpliendo día a día ni se entera a tiempo de lo que se le va a quedar sin hacer. El MVP permite registrar tareas por día, ver cuáles están hechas, medir la constancia como racha de días productivos consecutivos y avisar de las tareas que van a quedar pendientes al cerrar el día, la semana y el mes.

## Historias de usuario (con prioridad y prueba independiente)

### HU-01 — Planificar y consultar las tareas de un día (P1)
Como usuario, quiero crear tareas para un día concreto y consultarlas, para saber qué tengo que hacer ese día.
- **Por qué P1:** sin tareas no existe nada más (ni racha ni avisos).
- **Prueba independiente:** crear dos tareas para un día y consultar ese día devuelve exactamente esas dos, pendientes.
- **Escenarios:**
  - Dado un usuario sin tareas, cuando crea la tarea "Comprar pan" para 2026-10-24, entonces la consulta de 2026-10-24 devuelve esa tarea como pendiente.
  - Dado un usuario con tareas los días 2026-10-24 y 2026-10-25, cuando consulta 2026-10-24, entonces solo recibe las tareas de ese día.
  - Dado un usuario, cuando intenta crear una tarea sin título, entonces la petición se rechaza con un error de validación.

### HU-02 — Completar tareas (P1)
Como usuario, quiero marcar una tarea como completada, para registrar mi progreso.
- **Por qué P1:** completar tareas es lo que alimenta la racha.
- **Prueba independiente:** marcar una tarea como completada y consultarla devuelve su estado completada.
- **Escenarios:**
  - Dada una tarea pendiente, cuando el usuario la marca como completada, entonces la consulta la devuelve completada.
  - Dada una tarea de otro usuario, cuando el usuario intenta completarla, entonces recibe "tarea no encontrada".

### HU-03 — Ver mi racha actual y mi mejor racha (P1)
Como usuario, quiero ver cuántos días consecutivos llevo siendo productivo y cuál ha sido mi mejor racha, para mantener la constancia.
- **Por qué P1:** la racha es la propuesta de valor diferencial del producto.
- **Prueba independiente:** con tareas completadas en días consecutivos conocidos, la consulta de racha devuelve los valores calculados a mano (ver ejemplos de RF-17 a RF-21).
- **Escenarios:**
  - Dado un usuario sin tareas completadas, cuando consulta su racha, entonces recibe racha actual 0 y mejor racha 0.
  - Dado un usuario con al menos una tarea completada en cada día de 2026-10-20 a 2026-10-23, y hoy 2026-10-23, cuando consulta su racha, entonces recibe racha actual 4.

### HU-04 — Consultar todas mis tareas por estado (P2)
Como usuario, quiero consultar todas mis tareas y distinguir las realizadas de las pendientes, para tener una visión global.
- **Por qué P2:** útil, pero el uso diario (HU-01) funciona sin ella.
- **Prueba independiente:** con tareas completadas y pendientes en varios días, filtrar por "pendientes" devuelve solo las pendientes.
- **Escenarios:**
  - Dado un usuario con 3 tareas completadas y 2 pendientes en días distintos, cuando consulta todas sus tareas, entonces recibe las 5, cada una con su estado.
  - Dado el mismo usuario, cuando filtra por pendientes, entonces recibe solo las 2 pendientes.

### HU-05 — Editar y borrar tareas (P2)
Como usuario, quiero corregir o eliminar tareas, para que mi lista refleje lo que realmente quiero hacer.
- **Por qué P2:** corrige errores, pero el flujo principal funciona sin ella.
- **Prueba independiente:** editar el título de una tarea y consultarla devuelve el nuevo título; borrarla hace que deje de aparecer.
- **Escenarios:**
  - Dada una tarea "Comprar pan", cuando el usuario cambia el título a "Comprar pan integral", entonces la consulta devuelve el nuevo título.
  - Dada una tarea existente, cuando el usuario la borra, entonces deja de aparecer en cualquier consulta.

### HU-06 — Recibir avisos de tareas que van a quedar sin completar (P3)
Como usuario, quiero que el sistema registre un aviso cuando tengo tareas pendientes a punto de cerrar el día, la semana o el mes, para reaccionar a tiempo.
- **Por qué P3:** aporta valor sobre un sistema que ya funciona; no es necesario para registrar tareas ni calcular la racha.
- **Prueba independiente:** con una tarea pendiente para hoy, al llegar el momento de disparo del aviso diario, la consulta de avisos devuelve un aviso diario que incluye esa tarea.
- **Escenarios:**
  - Dada una tarea pendiente para hoy, cuando llega el momento de disparo del aviso diario, entonces aparece un aviso diario con esa tarea.
  - Dado un día sin tareas pendientes, cuando llega el momento de disparo, entonces no se registra ningún aviso.

## Requisitos funcionales (EARS, con ID RF-xx)

### Identificación del usuario
- **RF-01** — Si una petición no incluye el identificador de usuario, entonces el sistema deberá rechazarla con el error `MISSING_USER`.
- **RF-02** — El sistema deberá limitar cada operación a las tareas, la racha y los avisos del usuario identificado en la petición.

### Hora local y zona horaria del usuario
- **RF-31** — Si la cabecera `X-Client-Time` falta, no es una fecha y hora ISO 8601 con desfase, o se desvía más de 5 minutos del reloj del sistema, entonces el sistema deberá rechazar la petición con el error `INVALID_CLIENT_TIME`.
- **RF-32** — Si la cabecera `X-Timezone` falta o no es un nombre de zona horaria IANA válido, entonces el sistema deberá rechazar la petición con el error `INVALID_TIMEZONE`.
- **RF-33** — Si el desfase de `X-Client-Time` no coincide con el desfase de la zona `X-Timezone` en ese instante, entonces el sistema deberá rechazar la petición con el error `INVALID_TIMEZONE`.
  - *Ejemplo:* `X-Client-Time: 2026-10-24T23:30:00+05:00` con `X-Timezone: Europe/Madrid` (que ese día es `+02:00`) → `INVALID_TIMEZONE`.
- **RF-34** — Cuando el sistema acepta una petición, el sistema deberá recordar su `X-Timezone` como zona horaria actual del usuario.
- **RF-35** — El sistema deberá calcular el fin del día, de la semana y del mes de cada usuario para los avisos según su última zona horaria recordada, incluidos los cambios de horario de verano.
- **RF-36** — Mientras un usuario no tenga ninguna zona horaria recordada, el sistema deberá omitir sus avisos.

### Tareas
- **RF-03** — Cuando un usuario crea una tarea con título y fecha válidos, el sistema deberá registrarla como pendiente, asociada a ese usuario y a ese día.
- **RF-04** — Si el título, tras recortar los espacios del principio y del final, está vacío o tiene más de 200 caracteres, entonces el sistema deberá rechazar la petición con el error `VALIDATION_ERROR`.
- **RF-05** — Si la descripción, tras recortar los espacios del principio y del final, tiene más de 1000 caracteres, entonces el sistema deberá rechazar la petición con el error `VALIDATION_ERROR`.
- **RF-38** — El sistema deberá guardar el título y la descripción sin los espacios del principio y del final, y una descripción vacía o con solo espacios como `null`.
  - *Ejemplo:* `"  Comprar pan  "` se guarda como `"Comprar pan"`; la descripción `"   "` se guarda como `null`.
- **RF-06** — Si la fecha no es un día de calendario válido en formato `AAAA-MM-DD`, entonces el sistema deberá rechazar la petición con el error `VALIDATION_ERROR`.
- **RF-07** — Si la fecha de una tarea nueva es anterior al día actual, entonces el sistema deberá rechazar la petición con el error `DAY_CLOSED`. Las fechas del día actual y de días futuros se aceptan sin límite.
  - *Ejemplo:* día actual 2026-10-24 → crear para 2026-10-23 responde `DAY_CLOSED`; crear para 2026-10-24 o para 2027-03-01 se acepta.
- **RF-08** — Cuando un usuario consulta sus tareas de un día, el sistema deberá devolver todas sus tareas de ese día con su estado.
- **RF-09** — Cuando un usuario consulta sus tareas sin indicar día, el sistema deberá devolver sus tareas con su estado, paginadas (RF-39) y opcionalmente acotadas por rango de fechas (RF-40).
- **RF-10** — Cuando un usuario consulta sus tareas filtrando por estado, el sistema deberá devolver solo las tareas completadas o solo las pendientes, según el filtro.
- **RF-11** — Cuando un usuario marca una tarea como completada, el sistema deberá cambiar su estado a completada.
- **RF-12** — Cuando un usuario desmarca una tarea completada, el sistema deberá volver a ponerla como pendiente (limitado por RF-14).
  - *Ejemplo:* día actual 2026-10-24, con la única tarea completada de hoy → al desmarcarla, hoy deja de ser productivo y la racha actual pasa de 2 a 1 (RF-20).
- **RF-13** — Cuando un usuario edita una tarea, el sistema deberá actualizar solo su título y su descripción.
- **RF-39** — Cuando un usuario consulta una lista de tareas o de avisos, el sistema deberá devolver la página `page` (por defecto 1) de tamaño `pageSize` (por defecto 50) junto con `page`, `pageSize`, `totalItems` y `totalPages`.
  - *Ejemplo:* 230 tareas, `page=5`, `pageSize=50` → 30 tareas, `totalItems` 230, `totalPages` 5. Con `page=6` → `items` vacío y los mismos totales.
- **RF-42** — Si `page` o `pageSize` no son enteros positivos, o `pageSize` es mayor que 100, entonces el sistema deberá rechazar la petición con el error `VALIDATION_ERROR`.
- **RF-40** — Cuando un usuario consulta sus tareas con `from` y/o `to`, el sistema deberá devolver solo las tareas con fecha dentro de ese rango, ambos días incluidos.
  - *Ejemplo:* `from=2026-10-20&to=2026-10-24` → tareas del 20 al 24, ambos incluidos.
- **RF-43** — Si `from` es posterior a `to`, o la consulta combina `date` con `from` o `to`, entonces el sistema deberá rechazar la petición con el error `VALIDATION_ERROR`.
- **RF-41** — El sistema deberá ordenar las listas de tareas por fecha ascendente y, dentro de cada fecha, por orden de creación.
- **RF-37** — Si una petición de edición incluye un campo distinto de `title`, `description` o `completed`, incluido `date`, entonces el sistema deberá rechazarla con el error `VALIDATION_ERROR`. Para cambiar una tarea de día, se borra y se crea de nuevo.
- **RF-14** — Si un usuario intenta completar, desmarcar, editar o borrar una tarea cuya fecha es anterior al día actual, entonces el sistema deberá rechazar la petición con el error `DAY_CLOSED`.
  - *Ejemplo:* día actual 2026-10-24 → completar una tarea del 2026-10-23 responde `DAY_CLOSED`; la misma tarea se sigue pudiendo consultar.
- **RF-15** — Cuando un usuario borra una tarea, el sistema deberá dejar de devolverla en cualquier consulta.
- **RF-16** — Si la tarea indicada no existe o pertenece a otro usuario, entonces el sistema deberá responder con el error `TASK_NOT_FOUND`.

### Racha
- **RF-17** — El sistema deberá considerar productivo un día cuando el usuario tiene al menos una tarea de ese día completada.
  - *Ejemplo:* el 2026-10-20 el usuario tiene 3 tareas y completa 1 → 2026-10-20 es productivo.
- **RF-18** — El sistema deberá considerar no productivo un día en el que el usuario no tiene ninguna tarea completada, incluidos los días sin tareas.
  - *Ejemplo:* el 2026-10-22 el usuario tiene 2 tareas pendientes y ninguna completada → no productivo. El 2026-10-25 no tiene tareas → no productivo.
- **RF-19** — Cuando un usuario consulta su racha y el día actual es productivo, el sistema deberá devolver como racha actual el número de días productivos consecutivos que terminan en el día actual.
  - *Ejemplo:* hoy es 2026-10-23; los días 2026-10-21, 2026-10-22 y 2026-10-23 son productivos y 2026-10-20 no → racha actual 3.
- **RF-20** — Mientras el día actual aún no sea productivo, el sistema deberá devolver como racha actual el número de días productivos consecutivos que terminan en el día anterior, de modo que la racha solo se rompe cuando el día actual termina sin ser productivo.
  - *Ejemplo:* hoy es 2026-10-24 y aún no ha completado nada; 2026-10-23 fue productivo y 2026-10-22 no → racha actual 1. Si completa una tarea de hoy → racha actual 2. Si el 2026-10-24 termina sin completar nada, el 2026-10-25 la racha actual es 0.
- **RF-21** — Cuando un usuario consulta su racha, el sistema deberá devolver como mejor racha la secuencia más larga de días productivos consecutivos de todo su historial, incluida la racha actual.
  - *Ejemplo:* días productivos 2026-10-01 a 2026-10-05 (5 días), después 2026-10-10 a 2026-10-12 (3 días) → mejor racha 5.
- **RF-22** — El sistema deberá mantener sin cambios la productividad de todo día anterior al día actual, ya que sus tareas no se pueden modificar (RF-07, RF-14).
  - *Ejemplo:* el 2026-10-22 terminó sin tareas completadas → seguirá siendo no productivo para siempre, y las rachas que lo atraviesan no cambian.
- **RF-23** — El sistema deberá tomar como día actual del usuario la fecha local indicada en la cabecera `X-Client-Time` de la petición.
  - *Ejemplo:* con `X-Client-Time: 2026-10-24T23:30:00+02:00`, el día actual es 2026-10-24 aunque en UTC ya sean las 21:30 del mismo día; con `2026-10-25T00:10:00+02:00`, el día actual es 2026-10-25.

### Avisos
Los avisos son anticipados: solo incluyen tareas pendientes que aún se pueden completar. La semana va de lunes a domingo. Todas las horas son locales según la zona recordada del usuario (RF-35).
- **RF-24** — Cuando son las 22:00 hora local (2 horas antes del fin del día) y el usuario tiene tareas pendientes de ese día, el sistema deberá registrar un aviso diario con esas tareas.
  - *Ejemplo:* el 2026-10-24 a las 22:00 el usuario tiene 2 tareas pendientes de ese día → aviso diario con esas 2 tareas.
- **RF-25** — Cuando son las 22:00 hora local del viernes y el usuario tiene tareas pendientes con fecha entre ese viernes y el domingo siguiente, el sistema deberá registrar un aviso semanal con esas tareas.
  - *Ejemplo:* viernes 2026-10-23 a las 22:00, con tareas pendientes el 23, el 24 y el 25 → aviso semanal con las tres; `periodStart` 2026-10-19 y `periodEnd` 2026-10-25.
- **RF-26** — Cuando son las 22:00 hora local del primero de los 3 últimos días del mes y el usuario tiene tareas pendientes con fecha en esos 3 días, el sistema deberá registrar un aviso mensual con esas tareas.
  - *Ejemplo:* 2026-10-29 a las 22:00, con tareas pendientes el 29 y el 31 → aviso mensual con ambas; `periodStart` 2026-10-01 y `periodEnd` 2026-10-31. En febrero de 2027 se dispara el 26.
- **RF-27** — Si en el momento de disparo el usuario no tiene tareas pendientes en el periodo, entonces el sistema deberá omitir el aviso de ese periodo.
- **RF-28** — El sistema deberá registrar como máximo un aviso de cada tipo por usuario y periodo.
- **RF-29** — Cuando un usuario consulta sus avisos, el sistema deberá devolverlos ordenados del más reciente al más antiguo y paginados (RF-39).
- **RF-30** — Cuando un usuario completa, desmarca o borra una tarea incluida en un aviso ya registrado, el sistema deberá mantener el aviso sin cambios, con el `id`, el título y la fecha que tenía cada tarea en el momento del aviso.
  - *Ejemplo:* aviso semanal del viernes 2026-10-23 con 3 tareas; el sábado el usuario completa una y borra otra → el aviso sigue mostrando las 3 tareas con los datos del viernes.

## Contrato de la API

### Resumen de endpoints

| Método | Ruta | Descripción | RF |
| :--- | :--- | :--- | :--- |
| POST | `/tasks` | Crear una tarea | RF-03 a RF-07 |
| GET | `/tasks` | Consultar tareas (de un día o todas, con filtros de estado y rango, paginadas) | RF-08 a RF-10, RF-39 a RF-43 |
| PATCH | `/tasks/{id}` | Editar, completar o desmarcar una tarea | RF-11 a RF-14, RF-16, RF-37 |
| DELETE | `/tasks/{id}` | Borrar una tarea | RF-15, RF-16 |
| GET | `/streak` | Consultar la racha actual y la mejor racha | RF-17 a RF-23 |
| GET | `/alerts` | Consultar los avisos, paginados | RF-24 a RF-30, RF-39, RF-42 |

Todas las peticiones requieren las cabeceras `X-User-Id` (RF-01, RF-02), `X-Client-Time` y `X-Timezone` (RF-23, RF-31 a RF-34).

### Convenciones
- **Cabecera de usuario:** `X-User-Id`, cadena no vacía.
- **Cabecera de hora del dispositivo:** `X-Client-Time`, fecha y hora ISO 8601 con desfase obligatorio (ej. `2026-10-24T23:30:00+02:00`).
- **Cabecera de zona horaria:** `X-Timezone`, nombre de zona IANA (ej. `Europe/Madrid`).
- **Nombres de campos:** inglés, `camelCase`.
- **Días:** `AAAA-MM-DD` (ej. `"2026-10-24"`).
- **Instantes:** ISO 8601 con zona horaria (ej. `"2026-10-24T09:15:00Z"`).
- **Identificadores:** cadenas opacas; el cliente no debe interpretar su formato.
- **Mensajes:** el campo `message` de éxitos y errores va en español.

### Sobre de respuesta (CONSTITUTION.md, principio VII)
Todas las respuestas, de éxito o de error, usan uno de estos dos sobres. En cada endpoint solo se describe el contenido de `data` o el código de error.

**Éxito:**

```json
{
  "success": true,
  "status": 200,
  "message": "Operación realizada con éxito",
  "data": { }
}
```

`data` es un objeto, `null` (cuando no hay nada que devolver) o, en las listas, un objeto paginado con `items`, `page`, `pageSize`, `totalItems` y `totalPages` (RF-39).

**Error:**

```json
{
  "success": false,
  "status": 404,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "La tarea no existe o ya fue eliminada."
  }
}
```

En `VALIDATION_ERROR`, `error` incluye además `details`:

```json
{
  "success": false,
  "status": 400,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "La petición no es válida.",
    "details": [ { "field": "title", "message": "El título es obligatorio." } ]
  }
}
```

`status` siempre coincide con el código HTTP de la respuesta.

### Recurso `Task`

```json
{
  "id": "b3f1c2e4-0000-4000-8000-000000000001",
  "title": "Comprar pan",
  "description": null,
  "date": "2026-10-24",
  "completed": false,
  "createdAt": "2026-10-24T09:15:00Z",
  "updatedAt": "2026-10-24T09:15:00Z"
}
```

### POST `/tasks`

**Cuerpo:**

```json
{ "title": "Comprar pan", "description": "Integral", "date": "2026-10-24" }
```

| Campo | Tipo | Obligatorio | Restricciones |
| :--- | :--- | :--- | :--- |
| `title` | string | Sí | 1–200 caracteres tras recortar espacios (RF-04, RF-38) |
| `description` | string \| null | No | 0–1000 caracteres tras recortar espacios; vacía se guarda como `null` (RF-05, RF-38) |
| `date` | string | Sí | Día válido `AAAA-MM-DD`; restricción de pasado/futuro según RF-07 |

**Respuestas:**
- `201 Created` → `data`: recurso `Task` creado.

```json
{
  "success": true,
  "status": 201,
  "message": "Tarea creada con éxito",
  "data": { "id": "…", "title": "Comprar pan", "description": "Integral", "date": "2026-10-24", "completed": false, "createdAt": "…", "updatedAt": "…" }
}
```

- `400 Bad Request` → `VALIDATION_ERROR`.
- `400 Bad Request` → `INVALID_CLIENT_TIME` o `INVALID_TIMEZONE`.
- `401 Unauthorized` → `MISSING_USER`.
- `409 Conflict` → `DAY_CLOSED` (fecha anterior al día actual, RF-07).

### GET `/tasks`

**Query:**

| Parámetro | Tipo | Obligatorio | Restricciones |
| :--- | :--- | :--- | :--- |
| `date` | string | No | Día válido `AAAA-MM-DD`. Si se envía, solo devuelve las tareas de ese día. No se combina con `from`/`to` (RF-43) |
| `from` | string | No | Día válido `AAAA-MM-DD`, inclusivo (RF-40) |
| `to` | string | No | Día válido `AAAA-MM-DD`, inclusivo; no anterior a `from` (RF-40, RF-43) |
| `status` | string | No | `all` (por defecto), `completed`, `pending` |
| `page` | integer | No | ≥ 1; por defecto 1 (RF-39, RF-42) |
| `pageSize` | integer | No | 1–100; por defecto 50 (RF-39, RF-42) |

Orden: fecha ascendente y, dentro de cada fecha, orden de creación (RF-41).

**Respuestas:**
- `200 OK` → `data`: página de recursos `Task` (RF-39).

```json
{
  "success": true,
  "status": 200,
  "message": "Operación realizada con éxito",
  "data": {
    "items": [
      { "id": "…", "title": "Comprar pan", "description": null, "date": "2026-10-24", "completed": true, "createdAt": "…", "updatedAt": "…" },
      { "id": "…", "title": "Llamar al banco", "description": null, "date": "2026-10-24", "completed": false, "createdAt": "…", "updatedAt": "…" }
    ],
    "page": 1,
    "pageSize": 50,
    "totalItems": 2,
    "totalPages": 1
  }
}
```

- `400 Bad Request` → `VALIDATION_ERROR` (fecha, rango, estado o paginación no válidos).
- `400 Bad Request` → `INVALID_CLIENT_TIME` o `INVALID_TIMEZONE`.
- `401 Unauthorized` → `MISSING_USER`.

### PATCH `/tasks/{id}`

**Cuerpo** (al menos un campo):

```json
{ "title": "Comprar pan integral", "completed": true }
```

| Campo | Tipo | Obligatorio | Restricciones |
| :--- | :--- | :--- | :--- |
| `title` | string | No | 1–200 caracteres tras recortar espacios (RF-04, RF-38) |
| `description` | string \| null | No | 0–1000 caracteres tras recortar espacios; `null` o vacía la borra (RF-05, RF-38) |
| `completed` | boolean | No | Pasar a `false` según RF-12 |

Cualquier otro campo, incluido `date`, responde `VALIDATION_ERROR` (RF-37).

**Respuestas:**
- `200 OK` → `data`: recurso `Task` actualizado.
- `400 Bad Request` → `VALIDATION_ERROR` (incluido el cuerpo sin campos).
- `400 Bad Request` → `INVALID_CLIENT_TIME` o `INVALID_TIMEZONE`.
- `401 Unauthorized` → `MISSING_USER`.
- `404 Not Found` → `TASK_NOT_FOUND`.
- `409 Conflict` → `DAY_CLOSED` (tarea de un día pasado, RF-14).

### DELETE `/tasks/{id}`

**Respuestas:**
- `200 OK` → `data`: `null`.

```json
{
  "success": true,
  "status": 200,
  "message": "Tarea eliminada con éxito",
  "data": null
}
```

- `400 Bad Request` → `INVALID_CLIENT_TIME` o `INVALID_TIMEZONE`.
- `401 Unauthorized` → `MISSING_USER`.
- `404 Not Found` → `TASK_NOT_FOUND`.
- `409 Conflict` → `DAY_CLOSED` (tarea de un día pasado, RF-14).

### GET `/streak`

**Respuestas:**
- `200 OK` → `data`: racha actual y mejor racha.

```json
{
  "success": true,
  "status": 200,
  "message": "Operación realizada con éxito",
  "data": { "current": 3, "best": 5 }
}
```

- `400 Bad Request` → `INVALID_CLIENT_TIME` o `INVALID_TIMEZONE`.
- `401 Unauthorized` → `MISSING_USER`.

### GET `/alerts`

**Query:**

| Parámetro | Tipo | Obligatorio | Restricciones |
| :--- | :--- | :--- | :--- |
| `page` | integer | No | ≥ 1; por defecto 1 (RF-39, RF-42) |
| `pageSize` | integer | No | 1–100; por defecto 50 (RF-39, RF-42) |

Orden: del más reciente al más antiguo (RF-29).

**Respuestas:**
- `200 OK` → `data`: página de avisos (RF-39).

```json
{
  "success": true,
  "status": 200,
  "message": "Operación realizada con éxito",
  "data": {
    "items": [
      {
        "id": "…",
        "type": "daily",
        "periodStart": "2026-10-24",
        "periodEnd": "2026-10-24",
        "tasks": [ { "id": "…", "title": "Llamar al banco", "date": "2026-10-24" } ],
        "createdAt": "2026-10-24T22:00:00Z"
      }
    ],
    "page": 1,
    "pageSize": 50,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

`type`: `daily`, `weekly` o `monthly`. `periodStart` y `periodEnd` delimitan el día, la semana o el mes del aviso.

`tasks` es una copia de las tareas pendientes en el momento del aviso, no su estado actual (RF-30). Para el estado actual se usa `GET /tasks`.

- `400 Bad Request` → `VALIDATION_ERROR` (paginación no válida).
- `400 Bad Request` → `INVALID_CLIENT_TIME` o `INVALID_TIMEZONE`.
- `401 Unauthorized` → `MISSING_USER`.

### Códigos de error

Todos se devuelven con el sobre de error. `details` solo aparece en `VALIDATION_ERROR`.

| Código | HTTP | Cuándo |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | 400 | Cuerpo, parámetros o query no válidos, incluido un cuerpo con JSON mal formado (RF-04 a RF-06, RF-10, RF-37, RF-42, RF-43) |
| `INVALID_CLIENT_TIME` | 400 | Falta `X-Client-Time`, tiene mal formato o se desvía más de 5 minutos del reloj del sistema (RF-31) |
| `INVALID_TIMEZONE` | 400 | Falta `X-Timezone`, no es una zona IANA válida o no coincide con el desfase de `X-Client-Time` (RF-32, RF-33) |
| `MISSING_USER` | 401 | Falta la cabecera `X-User-Id` o está vacía (RF-01) |
| `TASK_NOT_FOUND` | 404 | La tarea no existe o es de otro usuario (RF-16) |
| `ROUTE_NOT_FOUND` | 404 | La ruta o el método pedidos no existen en la API |
| `DAY_CLOSED` | 409 | Se intenta crear una tarea en un día pasado o modificar o borrar una tarea de un día pasado (RF-07, RF-14) |
| `INTERNAL_ERROR` | 500 | Error inesperado del servidor |

## Requisitos no funcionales (RNF-xx, sin tecnología)

- **RNF-01** — El 95 % de las peticiones a cualquier endpoint responde en menos de 300 ms con un usuario de hasta 10 000 tareas, medido desde que la petición llega a la API hasta que sale la respuesta, sin contar la red del cliente.
- **RNF-02** — Retraso máximo entre el momento de disparo de un aviso y su aparición en la consulta de avisos. [NEEDS CLARIFICATION: ¿objetivo? Propuesta: 5 minutos.]
- **RNF-03** — El 100 % de las respuestas lleva el campo `message` en español, tanto en éxitos como en errores.

## Casos límite

- Petición sin cabecera `X-User-Id` o con ella vacía → `MISSING_USER` (RF-01).
- Usuario sin ninguna tarea → `GET /tasks` devuelve `200` con `items: []`, `totalItems: 0` y `totalPages: 0`; `GET /streak` devuelve `200` con `data: { "current": 0, "best": 0 }`.
- Ruta o método inexistente (ej. `GET /foo`, `PUT /tasks`) → `ROUTE_NOT_FOUND` con el sobre de error.
- Cuerpo con JSON mal formado → `VALIDATION_ERROR` con el sobre de error.
- Error inesperado del servidor → `INTERNAL_ERROR` con el sobre de error, sin exponer detalles internos.
- Varias tareas completadas el mismo día cuentan como un único día productivo (RF-17).
- La racha cruza meses y años: 2026-12-31 y 2027-01-01 productivos cuentan como 2 días consecutivos; en años bisiestos, el 29 de febrero es un día más de la secuencia.
- Fecha inexistente, como `2026-02-30` → `VALIDATION_ERROR` (RF-06).
- `pageSize=101` o `page=0` → `VALIDATION_ERROR` (RF-42).
- `from` posterior a `to`, o `date` junto con `from` → `VALIDATION_ERROR` (RF-43).
- `page` mayor que `totalPages` → `200` con `items: []` y los totales reales (RF-39).
- Título de exactamente 200 caracteres → se acepta; de 201 → `VALIDATION_ERROR` (RF-04).
- Descripción de exactamente 1000 caracteres → se acepta; de 1001 → `VALIDATION_ERROR` (RF-05).
- Título con solo espacios → `VALIDATION_ERROR` (RF-04).
- Texto con espacios al principio o al final → la respuesta lo devuelve ya recortado (RF-38).
- `PATCH` sin ningún campo → `VALIDATION_ERROR`.
- Marcar como completada una tarea que ya lo está → `200` sin cambios (idempotente).
- Desmarcar una tarea que ya está pendiente → `200` sin cambios (idempotente).
- `PATCH` con `date` → `VALIDATION_ERROR` (RF-37).
- Desmarcar una tarea después de que haya aparecido en un aviso → el aviso no cambia (RF-30).
- Completar todas las tareas de un aviso → el aviso sigue igual (RF-30).
- Borrar una tarea después de que haya aparecido en un aviso → el aviso la sigue mostrando con sus datos de entonces; `GET /tasks` ya no la devuelve y un `PATCH` sobre ella responde `TASK_NOT_FOUND` (RF-15, RF-16, RF-30).
- Borrar la única tarea completada de un día pasado → `DAY_CLOSED`; la racha no cambia (RF-14, RF-22).
- Completar una tarea de hoy a las 23:59 hora local se acepta; la misma petición a las 00:01 del día siguiente → `DAY_CLOSED` (RF-14, RF-23).
- Petición a las 23:59 y siguiente a las 00:01 hora local: el día actual cambia entre ambas según `X-Client-Time` (RF-23).
- Reloj del dispositivo desviado 6 minutos respecto al del sistema → `INVALID_CLIENT_TIME` (RF-31).
- Zona que no coincide con el desfase de la hora → `INVALID_TIMEZONE` (RF-33).
- Usuario que viaja y cambia de zona: el día actual sigue a cada petición (RF-23) y los avisos pasan a usar la nueva zona desde su siguiente petición aceptada (RF-34, RF-35).
- Noche del cambio de horario de verano: el fin del día para los avisos se calcula con la zona IANA, no con un desfase fijo (RF-35).
- Usuario que nunca ha hecho una petición aceptada: no tiene zona recordada y no recibe avisos (RF-36).
- Una semana que cruza dos meses genera su aviso semanal y no altera el mensual de ninguno de los dos meses.
- Un mismo día puede generar a la vez aviso diario, semanal y mensual (ej. viernes 2026-10-30, que es además uno de los 3 últimos días de octubre): son avisos independientes y una tarea puede aparecer en varios.
- Tarea creada para hoy después de las 22:00 → no entra en el aviso diario ya registrado (RF-28).
- Identificador de tarea con formato extraño o inexistente → `TASK_NOT_FOUND` (RF-16).

## Fuera de alcance

- Autenticación real: registro, login, contraseñas y tokens (decisión 1B).
- Avisos enviados fuera de la API (email, push, SMS); los avisos solo se consultan por la API (decisión 8A).
- [NEEDS CLARIFICATION: ¿quedan fuera también las tareas recurrentes, compartir tareas, categorías o etiquetas, prioridad y estadísticas más allá de la racha?]

## Criterios de éxito (CE-xx)

- **CE-01** — Un usuario nuevo puede crear una tarea, completarla y ver racha actual 1 con 3 peticiones.
- **CE-02** — El 100 % de los ejemplos de RF-17 a RF-21 devuelven la racha esperada.
- **CE-03** — 0 casos en los que un usuario lea o modifique tareas, racha o avisos de otro usuario.
- **CE-04** — Para cada periodo con tareas pendientes en el momento de disparo existe exactamente un aviso de su tipo, y para cada periodo sin pendientes no existe ninguno.
- **CE-05** — En una prueba con un usuario de 10 000 tareas repartidas en 3 años, el 95 % de las peticiones a cada endpoint, incluido `GET /streak`, responde en menos de 300 ms (RNF-01).

## Supuestos

- **S-01** — El usuario se identifica con la cabecera `X-User-Id`; cualquier valor no vacío identifica a un usuario sin necesidad de registro previo. Cualquiera que conozca un identificador puede actuar como ese usuario: es un riesgo aceptado en el MVP (deriva de la decisión 1B).
- **S-02** — Los campos JSON y las rutas van en inglés, coherente con la convención de nombres en inglés de `AGENTS.md`; los campos, en `camelCase`.
- **S-03** — Una tarea de otro usuario responde `404` y no `403`, para no revelar que existe.
- **S-04** — Que los días sin tareas sean no productivos (RF-18) se deduce de la decisión 5A: sin ninguna tarea completada no hay día productivo. Si se quiere que los días sin tareas se ignoren, hay que cambiar RF-18.
- **S-06** — La hora y la zona las envía el dispositivo, así que un usuario que cambie ambas cabeceras de forma coherente puede mover su día actual dentro de los desfases reales (hasta unas 26 horas). Es un riesgo aceptado en el MVP, del mismo tipo que S-01.

## Clarificaciones

- **2026-10-24** — ¿Usuarios y autenticación? → Varios usuarios identificados por cabecera, sin login real (1B).
- **2026-10-24** — ¿Campos de una tarea? → Título obligatorio, descripción opcional, día y estado completada (2, recomendado).
- **2026-10-24** — ¿Qué es un día productivo? → Al menos una tarea de ese día completada (5A).
- **2026-10-24** — ¿Qué es un aviso? → Un registro que se consulta por la API, sin envío externo (8A).
- **2026-10-24** — ¿Zona horaria (RF-23)? → Cada petición envía la hora del dispositivo (`X-Client-Time`, ISO 8601 con desfase) y su zona IANA (`X-Timezone`). El día actual sale de la hora del dispositivo; los avisos usan la última zona recordada. Tolerancia de 5 minutos frente al reloj del sistema y desfase coherente con la zona; si no, `400`.
- **2026-10-24** — ¿Formato de las respuestas? → Sobre único de éxito (`success`, `status`, `message`, `data`) y de error (`success`, `status`, `error.code`, `error.message`, `error.details` solo en validación), fijado en CONSTITUTION.md principio VII. El borrado responde `200` con `data: null`; los ids siguen siendo cadenas opacas; `message` en español; en las listas `data` es el array; rutas inexistentes → `ROUTE_NOT_FOUND`; JSON mal formado → `VALIDATION_ERROR`.
- **2026-10-24** — ¿Racha si hoy aún no es productivo (RF-20)? → Se mantiene hasta fin de día: la racha actual se cuenta hasta ayer y solo se rompe si hoy termina sin ninguna tarea completada (A).
- **2026-10-24** — ¿Cambios en días pasados (RF-07, RF-14, RF-22)? → Los días pasados quedan cerrados: no se pueden crear, completar, desmarcar, editar ni borrar sus tareas; error `DAY_CLOSED` (`409`). Los días futuros se aceptan sin límite (C).
- **2026-10-24** — ¿Momento y contenido de los avisos (RF-24 a RF-26)? → Avisos anticipados con tareas aún completables: diario a las 22:00 con las pendientes de hoy; semanal el viernes a las 22:00 con las pendientes de viernes a domingo; mensual a las 22:00 del primero de los 3 últimos días del mes con las pendientes de esos 3 días. Semana de lunes a domingo (A).
- **2026-10-24** — ¿Desmarcar y cambiar la fecha (RF-12, RF-13)? → Se puede desmarcar una tarea de hoy o futura; la fecha no se puede cambiar: en edición solo se aceptan `title`, `description` y `completed`, y cualquier otro campo responde `VALIDATION_ERROR` (B).
- **2026-10-24** — ¿Qué pasa con un aviso si se completa una de sus tareas (RF-30)? → El aviso es histórico y no cambia al completar, desmarcar o borrar sus tareas; conserva el `id`, el título y la fecha de cada tarea en el momento del aviso (A).
- **2026-10-24** — ¿Longitud máxima de título y descripción (RF-04, RF-05)? → Título 1–200 caracteres y descripción hasta 1000, contados tras recortar espacios; la descripción vacía se guarda como `null` (A).
- **2026-10-24** — ¿Rango de fechas y paginación (RF-09)? → Listas de tareas y avisos paginadas dentro de `data` (`items`, `page`, `pageSize`, `totalItems`, `totalPages`; por defecto 50, máximo 100). Sustituye la decisión anterior de que en las listas `data` fuera el array. `GET /tasks` admite `from`/`to` inclusivos, no combinables con `date`; tareas ordenadas por fecha y creación; página fuera de rango → `items` vacío (B).
- **2026-10-24** — ¿Tiempo de respuesta (RNF-01)? → El 95 % de las peticiones en menos de 300 ms con hasta 10 000 tareas por usuario, medido en la API sin la red del cliente; se añade CE-05 (A).

## Registro de cambios

- **2026-10-24** — Creación del borrador con las decisiones 1B, 2, 5A y 8A.
- **2026-10-24** — Clarificación 1 (zona horaria): reescrito RF-23; añadidos RF-31 a RF-36; contrato con cabeceras `X-Client-Time` y `X-Timezone` y errores `INVALID_CLIENT_TIME` e `INVALID_TIMEZONE`; nuevos casos límite y supuesto S-06.
- **2026-10-24** — Formato de respuesta único (CONSTITUTION.md 1.3.0, principio VII): sección *Sobre de respuesta*; ejemplos del contrato con el sobre; `DELETE` pasa de `204` a `200`; añadido `ROUTE_NOT_FOUND`; JSON mal formado como `VALIDATION_ERROR`; RNF-03 resuelto; eliminado S-05; nuevos casos límite.
- **2026-10-24** — Clarificación 2 (racha de hoy): RF-20 resuelto con la opción A y RF-19 acotado al caso en que hoy ya es productivo.
- **2026-10-24** — Clarificación 3 (días pasados): RF-07, RF-14 y RF-22 resueltos con la opción C; añadido `DAY_CLOSED` (`409`) al contrato y a la tabla de códigos; casos límite actualizados.
- **2026-10-24** — Clarificación 4 (avisos): RF-24 a RF-26 resueltos con la opción A, con ejemplos; nuevos casos límite de avisos simultáneos y tareas creadas tras el disparo.
- **2026-10-24** — Clarificación 5 (desmarcar y fecha): RF-12 y RF-13 resueltos con la opción B; añadido RF-37; quitado `date` del cuerpo de `PATCH`; nuevos casos límite.
- **2026-10-24** — Clarificación 6 (avisos históricos): RF-30 resuelto con la opción A; nota en `GET /alerts` sobre la copia de tareas; casos límite actualizados.
- **2026-10-24** — Clarificación 7 (longitudes): RF-04 y RF-05 resueltos con la opción A; añadido RF-38; límites en las tablas de `POST` y `PATCH`; casos límite de frontera.
- **2026-10-24** — Clarificación 8 (paginación): RF-09 y RF-29 reescritos; añadidos RF-39 a RF-43; contrato de `GET /tasks` y `GET /alerts` con query de paginación y `data` paginado; sustituida la decisión de `data` como array en las listas; casos límite nuevos.
- **2026-10-24** — Clarificación 9 (rendimiento): RNF-01 resuelto con la opción A; añadido CE-05.
