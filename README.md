# TaskApiSDD

API REST para **organizar tareas diarias** y medir la **constancia** con una **racha de días productivos consecutivos**.

Está construida con **Spec-Driven Development (SDD)**: primero se escribe *qué* debe hacer el sistema (la spec), después *cómo* (el plan), después las *tareas*, y solo al final el código.

> **Estado:** el MVP P1 funciona de principio a fin: crear tareas, consultarlas, completarlas y ver la racha. Las historias P2 y P3 también están hechas: listar todas las tareas con filtros de estado y rango de fechas, consultar una tarea por su id (H4), editar el título y la descripción o borrar tareas (H5), y avisos diarios, semanales y mensuales de tareas pendientes (H6). La fase de robustez también está hecha (precedencia de errores por pares y rendimiento). La imagen de producción está construida y probada en local (`Dockerfile.prod`, `docker-compose.prod.yml`): todas las tareas de la funcionalidad 001 están hechas. **En curso:** funcionalidad 002, cuentas de usuario (registro, login, sesión en cookies con refresh token y protección CSRF), con la spec y el plan aprobados y la fase base, las siete historias (H1 a H7) y casi toda la fase de robustez de `tasks.md` hechas (120 de 121 tareas): ya se puede registrar una cuenta (`GET /auth/csrf`, `POST /auth/register`), iniciar sesión con cookies (`POST /auth/login`), renovarla con el refresh token (`POST /auth/refresh`), consultar la cuenta (`GET /me`), cerrar sesión (`POST /auth/logout`) usar las tareas, la racha y los avisos con esa sesión (`X-User-Id` ya no existe) cambiar el nombre visible (`PATCH /me`) y la contraseña (`PATCH /me/password`, que cierra las demás sesiones), y borrar la cuenta con todos sus datos (`DELETE /me`). Falta solo T121: ejecutar contra producción la guía QS-R (cookies y CORS con `docker-compose.prod.yml`). Ver [Estado del proyecto](#estado-del-proyecto).

---

## Índice

1. [Qué hace la API](#qué-hace-la-api)
2. [Tecnologías](#tecnologías)
3. [Puesta en marcha en 5 minutos](#puesta-en-marcha-en-5-minutos)
4. [Cómo usar la API](#cómo-usar-la-api)
5. [Reglas de negocio que conviene conocer](#reglas-de-negocio-que-conviene-conocer)
6. [Arquitectura](#arquitectura)
7. [Estructura de carpetas](#estructura-de-carpetas)
8. [Tests](#tests)
9. [Cómo se trabaja en este proyecto (SDD)](#cómo-se-trabaja-en-este-proyecto-sdd)
10. [Convenciones](#convenciones)
11. [Comandos útiles](#comandos-útiles)
12. [Problemas frecuentes](#problemas-frecuentes)
13. [Estado del proyecto](#estado-del-proyecto)
14. [Documentos de referencia](#documentos-de-referencia)

---

## Qué hace la API

Imagina una app de tareas en la que:

1. **Creas tareas para un día concreto**: "Comprar pan" para hoy, "Ir al gimnasio" para mañana.
2. **Las marcas como completadas** cuando las haces.
3. La API calcula tu **racha**: cuántos días seguidos has completado al menos una tarea, y cuál ha sido tu mejor racha.
4. La API te **avisa** de las tareas que se te van a quedar sin hacer al terminar el día, la semana o el mes (`GET /alerts`).

Detalles importantes desde el principio:

- **Cuentas con sesión.** Te registras y entras con email y contraseña; la sesión viaja en cookies `HttpOnly` y cada petición que modifica algo lleva además el token CSRF de la sesión. Cada usuario solo ve sus tareas.
- **La API trabaja con tu día local.** Cada petición envía la hora y la zona horaria de tu dispositivo. Así, las 00:30 en Madrid ya cuentan como "mañana" aunque en UTC sigan siendo las 22:30 del día anterior.
- **Los días pasados están cerrados.** Las tareas de ayer se pueden consultar, pero no modificar. Así nadie puede "maquillar" su racha.

---

## Tecnologías

| Para qué | Herramienta | Por qué esta |
| :--- | :--- | :--- |
| Lenguaje | **TypeScript** (modo estricto) en **Node.js 22** | Los tipos evitan muchos errores antes de ejecutar nada |
| Servidor HTTP | **Express 5** | Sencillo y muy conocido; la versión 5 gestiona los errores de las funciones `async` sin código extra |
| Base de datos | **PostgreSQL 16** | Base de datos relacional robusta |
| Acceso a datos | **Prisma 6** (ORM) | Esquema declarativo, migraciones versionadas y consultas tipadas |
| Validación de entrada | **Zod 4** | Valida y transforma lo que llega del cliente, con mensajes en español |
| Tests | **Jest 30** + `ts-jest` | Tests unitarios, HTTP y de integración |
| Build y desarrollo | **Vite** + **vite-node** | Recarga en caliente al guardar y build de producción |
| Gestor de paquetes | **pnpm** | Rápido y estricto con las dependencias |
| Entorno | **Docker** + **Docker Compose** | Todo corre en contenedores: nadie instala Node ni PostgreSQL en su máquina |

> **Regla de oro:** el proyecto **siempre** se ejecuta dentro de Docker. No ejecutes `pnpm install`, `pnpm test` ni el servidor directamente en tu ordenador.

El proyecto es **ESM** de principio a fin (`"type": "module"`). En la práctica, los imports relativos llevan la extensión `.js` aunque el fichero sea `.ts`:

```ts
import { Task } from './task.entity.js'; // el fichero real es task.entity.ts
```

---

## Puesta en marcha en 5 minutos

### Requisitos

- **Docker Desktop** instalado y arrancado. No hace falta nada más: ni Node, ni pnpm, ni PostgreSQL.

### Pasos

```bash
# 1. Clonar el repositorio
git clone git@github.com:RafaelVillagomezDev/TaskApiSDD.git
cd TaskApiSDD

# 2. Activar los hooks de git del proyecto (una vez por clon; ver "README vivo")
git config core.hooksPath .githooks

# 3. Crear el fichero de variables de desarrollo a partir de la plantilla
cp .env.example .env.dev
#    Rellena los valores. Ejemplo:
#    PORT=3000
#    POSTGRES_USER=taskapisdd_dev
#    POSTGRES_PASSWORD=una-contraseña-larga
#    POSTGRES_DB=taskapisdd_dev
#    DATABASE_URL=postgresql://taskapisdd_dev:una-contraseña-larga@db:5432/taskapisdd_dev?schema=public
#    SESSION_ENCRYPTION_KEY=<salida de openssl rand -hex 32>   # clave secreta de las sesiones, distinta en cada entorno
#    CORS_ORIGIN=http://localhost:5173                          # origen del frontend; en producción, https://kompitu.yandrydev.cloud

# 4. Construir y levantar la API y la base de datos
docker compose -f docker-compose.dev.yml up -d --build

# 5. Copiar las dependencias del contenedor a ./node_modules (solo para que tu editor vea los tipos)
docker compose -f docker-compose.dev.yml cp api:/app/node_modules ./

# 6. Aplicar las migraciones de la base de datos
docker compose -f docker-compose.dev.yml exec api pnpm prisma migrate deploy

# 7. Comprobar que la API responde
docker compose -f docker-compose.dev.yml logs api --tail 3   # debe mostrar {"event":"SERVER_STARTED","port":3000}
curl -s http://localhost:3000/foo                            # {"success":false,"status":404,"error":{"code":"ROUTE_NOT_FOUND",...}}

# 8. Ejecutar los tests
docker compose -f docker-compose.dev.yml exec api pnpm test

# 9. Levantar y preparar SonarQube (sin él no se puede hacer push; ver "Calidad")
#    Añade antes a .env.dev: SONAR_ADMIN_PASSWORD=<12+ caracteres con mayúscula, minúscula, dígito y símbolo> y SONAR_TOKEN=
docker compose -f docker-compose.sonar.yml up -d sonarqube
./scripts/sonar-setup.sh                                     # rellena SONAR_TOKEN en .env.dev
```

> **¿Por qué `.env.dev` no está en git?** Contiene contraseñas. Los secretos solo viven en `.env.dev` y `.env.prod`, que nunca se versionan (principio IV de la constitución). `.env.example` sí está en git, pero sin ningún valor.

En la base de datos, `db` es el **nombre del servicio** de PostgreSQL dentro de Docker Compose: desde el contenedor de la API, la base de datos se llama `db`, no `localhost`.

---

## Cómo usar la API

### Sesión y cabeceras obligatorias

Las rutas de tareas, racha y avisos (`/tasks`, `/streak`, `/alerts`) necesitan:

| Qué | Ejemplo | Para qué sirve |
| :--- | :--- | :--- |
| Cookie `access_token` | La pone `POST /auth/login` | Quién eres: la API identifica al usuario **solo** por su sesión. Dura 15 minutos y se renueva con `POST /auth/refresh`. |
| `X-CSRF-Token` | El `csrfToken` que devuelve el login | Solo en `POST`, `PATCH` y `DELETE`: protege frente a peticiones falsificadas desde otra web. |
| `X-Client-Time` | `2026-10-25T10:30:00+02:00` | La hora de tu dispositivo, **con desfase `±HH:MM`**. De ella sale tu "día actual". |
| `X-Timezone` | `Europe/Madrid` | Tu zona horaria en formato IANA. Se usa para los avisos. |

`X-User-Id` ya no existe desde la funcionalidad 002: si llega, se ignora. `/auth` y `/me` no piden `X-Client-Time` ni `X-Timezone`.

Reglas que conviene saber:

- `X-Client-Time` no puede desviarse **más de 5 minutos** de la hora del servidor. Se hace así para que nadie mueva su "hoy" a voluntad.
- El desfase de `X-Client-Time` tiene que **coincidir** con el de `X-Timezone` en ese momento. Por ejemplo, `+05:00` con `Europe/Madrid` se rechaza.
- `Z` no se acepta como desfase: usa `+00:00`.

### Ayuda para la terminal

Pega esto en tu terminal (zsh o bash) para no escribir las cabeceras a mano. `signin` crea la cuenta si no existe e inicia sesión (cookies en `$JAR`, token CSRF en `$CSRF`); `api` las envía con la hora y la zona de tu máquina:

```bash
export API=http://localhost:3000
export TZ_NAME=$(readlink /etc/localtime | sed 's#.*/zoneinfo/##')   # tu zona, p. ej. Europe/Madrid
now() { date +%Y-%m-%dT%H:%M:%S%z | sed -E 's/([+-][0-9]{2})([0-9]{2})$/\1:\2/'; }
signin() {
  local name=${1:-yandry} presession
  export EMAIL="$name@example.com" JAR="${TMPDIR:-/tmp}/taskapi-$name.jar"
  presession=$(curl -s $API/auth/csrf | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
  curl -s -o /dev/null -X POST $API/auth/register -H "Content-Type: application/json" -H "X-CSRF-Token: $presession" \
       -d "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\"}"
  export CSRF=$(curl -s -c "$JAR" -X POST $API/auth/login -H "Content-Type: application/json" -H "X-CSRF-Token: $presession" \
       -d "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\"}" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
}
api() { curl -s -b "$JAR" -c "$JAR" -H "X-CSRF-Token: ${CSRF:-}" -H "X-Client-Time: $(now)" -H "X-Timezone: $TZ_NAME" \
             -H "Content-Type: application/json" "$@"; echo; }
signin
```

Si una petición responde `401 TOKEN_EXPIRED` (el token de acceso dura 15 minutos), vuelve a ejecutar `signin` o renueva con `curl -s -b "$JAR" -c "$JAR" -X POST -H "X-CSRF-Token: $CSRF" $API/auth/refresh`.

### Endpoints disponibles

| Método | Ruta | Qué hace |
| :--- | :--- | :--- |
| `POST` | `/tasks` | Crea una tarea para hoy o un día futuro |
| `GET` | `/tasks` | Lista tus tareas, paginadas. Filtros: un día (`date`) o un rango inclusivo (`from`, `to`), nunca ambos; `status` (`all`, `completed`, `pending`); `page`, `pageSize` |
| `GET` | `/tasks/{id}` | Consulta una de tus tareas, también de días pasados |
| `PATCH` | `/tasks/{id}` | Edita el título y la descripción, o marca la tarea como completada o pendiente. Solo admite `title`, `description` y `completed`; el día no se puede cambiar |
| `DELETE` | `/tasks/{id}` | Borra una tarea de hoy o de un día futuro; responde `data: null` |
| `GET` | `/streak` | Tu racha actual y tu mejor racha |
| `GET` | `/alerts` | Tus avisos de tareas pendientes, del más reciente al más antiguo y paginados (`page`, `pageSize`) |
| `GET` | `/auth/csrf` | **(002)** Token CSRF previo a la sesión, válido 30 minutos, para registrarse e iniciar sesión |
| `POST` | `/auth/register` | **(002)** Crea una cuenta sin abrir sesión |
| `POST` | `/auth/login` | **(002)** Abre una sesión: cookies `access_token` (15 min) y `refresh_token` (7 días) y, en el cuerpo, la cuenta y el token CSRF de la sesión. 5 fallos en 15 minutos bloquean el email 15 minutos |
| `POST` | `/auth/refresh` | **(002)** Renueva la sesión: cookies nuevas, el mismo token CSRF. El refresh token anterior devuelve los mismos tokens durante 30 s; después, reutilizarlo cierra la sesión. Caduca a los 7 días sin renovar y a los 30 días del login |
| `POST` | `/auth/logout` | **(002)** Cierra la sesión de las cookies (también con el token de acceso caducado) y las borra |
| `GET` | `/me` | **(002, ampliado en la 003)** Tu cuenta y el token CSRF de tu sesión: `data: { user, csrfToken }`, la misma forma que el login, para recuperar el token tras recargar la página. La respuesta lleva `Cache-Control: no-store` |
| `PATCH` | `/me` | **(002)** Cambia tu nombre visible (`{ "name": "Ana" }`; `null` o vacío lo borra). Cualquier otro campo, incluido el email, responde `VALIDATION_ERROR` |
| `PATCH` | `/me/password` | **(002)** Cambia tu contraseña (`{ "currentPassword": "…", "newPassword": "…" }`) y cierra todas tus demás sesiones; la actual sigue abierta. Una contraseña actual errónea responde `WRONG_PASSWORD` y cuenta para el bloqueo, como un login fallido |
| `DELETE` | `/me` | **(002)** Borra tu cuenta para siempre (`{ "password": "…" }`) con tus tareas, avisos, zona y sesiones, y borra las cookies. Una contraseña errónea responde `WRONG_PASSWORD` y la cuenta sigue |

Ejemplos:

```bash
# Crear una tarea para hoy
api -X POST $API/tasks -d "{\"title\":\"Comprar pan\",\"description\":\"Integral\",\"date\":\"$(date +%F)\"}"

# Listar todas tus tareas / solo las de hoy / solo las pendientes / la segunda página de 10
api $API/tasks
api "$API/tasks?date=$(date +%F)"
api "$API/tasks?status=pending"
api "$API/tasks?page=2&pageSize=10"

# Tareas entre dos días, ambos incluidos (se puede omitir uno de los extremos)
api "$API/tasks?from=2026-10-20&to=2026-10-24"

# Consultar una tarea por su id
api $API/tasks/<id>

# Completar y desmarcar una tarea (sustituye <id> por el id que devolvió POST)
api -X PATCH $API/tasks/<id> -d '{"completed":true}'
api -X PATCH $API/tasks/<id> -d '{"completed":false}'

# Editar el título y borrar la descripción (para cambiar el día: borrar y crear de nuevo)
api -X PATCH $API/tasks/<id> -d '{"title":"Comprar pan y leche","description":null}'

# Borrar una tarea
api -X DELETE $API/tasks/<id>

# Ver tu racha
api $API/streak

# Ver tus avisos (los registra el servidor a las 22:00 de tu zona; ver Reglas de negocio)
api $API/alerts
api "$API/alerts?page=2&pageSize=10"
```

### Formato de las respuestas: siempre el mismo "sobre"

**Todas** las respuestas tienen la misma forma (principio VII de la constitución). El cliente siempre sabe qué esperar.

**Éxito:**

```json
{
  "success": true,
  "status": 201,
  "message": "Tarea creada con éxito",
  "data": {
    "id": "c1f3d08f-004c-49db-b2c8-abc780cbca94",
    "title": "Comprar pan",
    "description": "Integral",
    "date": "2026-10-25",
    "completed": false,
    "createdAt": "2026-10-24T22:55:36.313Z",
    "updatedAt": "2026-10-24T22:55:36.313Z"
  }
}
```

En las listas, `data` es un objeto paginado:

```json
{ "items": [ ... ], "page": 1, "pageSize": 50, "totalItems": 1, "totalPages": 1 }
```

**Error:**

```json
{
  "success": false,
  "status": 400,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "La petición no es válida.",
    "details": [ { "field": "title", "message": "Demasiado pequeño: se esperaba que texto tuviera >=1 caracteres" } ]
  }
}
```

`details` solo aparece en los errores de validación e indica qué campo está mal.

### Códigos de error

Si una petición tiene **varios** fallos a la vez, la API responde **solo el primero** de esta tabla (RF-34 de la 002, que sustituye a RF-46 de la 001):

| Orden | Código | HTTP | Cuándo |
| :--- | :--- | :--- | :--- |
| 1 | `ROUTE_NOT_FOUND` | 404 | La ruta o el método no existen (por ejemplo, `PUT /tasks`) |
| 2 | `INVALID_CSRF_TOKEN` | 403 | `POST`, `PATCH` o `DELETE` sin `X-CSRF-Token` o con un token que no vale para esa petición |
| 3 | `MISSING_TOKEN` | 401 | Ruta protegida sin la cookie de sesión |
| 3 | `INVALID_TOKEN` | 401 | Token de acceso inexistente o de una sesión cerrada |
| 3 | `TOKEN_EXPIRED` | 401 | Token de acceso caducado (15 minutos): hay que renovar con `POST /auth/refresh` |
| 3 | `INVALID_REFRESH_TOKEN` | 401 | En `/auth/refresh`: refresh token inexistente, de una sesión cerrada o reutilizado fuera del margen |
| 3 | `SESSION_EXPIRED` | 401 | En `/auth/refresh`: 7 días sin renovar o 30 desde el login |
| 4 | `INVALID_CLIENT_TIME` | 400 | `X-Client-Time` falta, tiene mal formato o se desvía más de 5 minutos |
| 5 | `INVALID_TIMEZONE` | 400 | `X-Timezone` falta, no es una zona IANA o no coincide con el desfase |
| 6 | `VALIDATION_ERROR` | 400 | El cuerpo o los parámetros no son válidos (incluido un JSON mal formado, `date` junto con `from`/`to`, `from` posterior a `to`, o un `PATCH` con un campo distinto de `title`, `description` y `completed`) |
| 7 | `TOO_MANY_ATTEMPTS` | 429 | 5 fallos de contraseña en 15 minutos: el email queda bloqueado 15 minutos |
| 7 | `INVALID_CREDENTIALS` | 401 | Login con email o contraseña incorrectos (no dice cuál) |
| 7 | `WRONG_PASSWORD` | 403 | Contraseña actual incorrecta al cambiarla o al borrar la cuenta |
| 7 | `EMAIL_ALREADY_REGISTERED` | 409 | El email ya pertenece a una cuenta |
| 7 | `TASK_NOT_FOUND` | 404 | La tarea no existe o es de otro usuario |
| 8 | `DAY_CLOSED` | 409 | Se intenta crear, modificar o borrar una tarea de un día pasado |
| 8 | `DAY_NOT_STARTED` | 409 | Se intenta completar una tarea de un día futuro |
| — | `INTERNAL_ERROR` | 500 | Error inesperado del servidor (sin detalles internos) |

Con `X-CSRF-Token` pero sin sesión con la que compararlo (sin cookies o con una sesión cerrada), gana el error de sesión (decisión 19 de la 002).

### Probar con Postman

Importa `sdd/001-taskApiSDD-mvp/mvp-p1.postman-collection.json` en Postman y ajusta la variable de colección `timeZone` a la zona de tu ordenador. Después:

- ejecuta la carpeta **"1. Flujo MVP"** (*Run folder*) y luego **"2. Errores"**;
- en **"3. Mis tareas"**, pon tu email y tu contraseña (12 caracteres como mínimo) en las variables `myEmail` y `myPassword` y lanza cualquier petición suelta: el script de la carpeta crea la cuenta si no existe e inicia sesión antes de enviarla (y otra vez cuando la sesión tiene más de 14 minutos), así que no tienes que copiar ninguna cookie.

La colección cubre H1 a H6: crear, consultar, completar, racha, filtros de estado y rango de fechas, paginación, consulta por id, edición, borrado y consulta de avisos, con sus casos de error. La generación de avisos no entra porque depende de que sean las 22:00 en tu zona: se prueba con la guía manual (QS-H6). Las cabeceras dinámicas (`X-Client-Time` y las fechas) las calcula sola la colección.

> **Con sesión (002):** el flujo crea una cuenta nueva en cada ejecución e inicia sesión; cada petición envía la cookie y el token CSRF de esa sesión, y "2. Errores" incluye los de sesión y CSRF (`MISSING_TOKEN`, `INVALID_TOKEN`, `INVALID_CSRF_TOKEN`) y una segunda cuenta para comprobar que no ve tus tareas. Las cookies se guardan en variables y se envían en la cabecera `Cookie`, con las cookies automáticas de Postman desactivadas en cada petición (igual en la colección de la 002), porque Newman y Postman no reenvían cookies `Secure` por http a un host distinto de `localhost`.

**Cuentas de usuario (002):** importa `sdd/002-user-accounts/user-accounts.postman-collection.json` y ejecuta **"1. Flujo"**, después **"2. Errores"**, **"3. CORS"** y **"4. Borrar la cuenta"**; la carpeta **"5. Mi cuenta"** sirve para usar la API con tu propia cuenta (variables `myEmail` y `myPassword`): consultar tu cuenta, cambiar tu nombre, renovar y cerrar la sesión, con peticiones que funcionan sueltas porque inician sesión solas. Cubre las siete historias (H1 a H7): token CSRF previo a la sesión, registro, login, `GET /me`, renovación con su margen de gracia, cambio de nombre con `PATCH /me`, cambio de contraseña con `PATCH /me/password`, borrado de la cuenta con `DELETE /me` (en su propia carpeta, con una cuenta solo para eso), logout, sus errores y las peticiones previas de CORS. La primera petición genera una cuenta nueva en cada ejecución. El login guarda las cookies en la variable `sessionCookie` y las peticiones siguientes las envían en la cabecera `Cookie`, porque Newman y Postman no reenvían cookies `Secure` por http a un host distinto de `localhost`. Desde la terminal:

```bash
docker run --rm -v "$PWD/sdd/002-user-accounts":/etc/newman postman/newman:6-alpine \
  run user-accounts.postman-collection.json --env-var baseUrl=http://host.docker.internal:3000
```

---

## Reglas de negocio que conviene conocer

| Regla | Qué significa |
| :--- | :--- |
| **Día productivo** | Un día es productivo si tienes **al menos una** tarea de ese día completada. Un día sin tareas no es productivo. |
| **Racha actual** | Días productivos seguidos que terminan **hoy**. Si hoy aún no has completado nada, se cuentan hasta **ayer**: la racha no se rompe hasta que el día termina sin completar nada. |
| **Mejor racha** | El tramo de días productivos seguidos más largo de todo tu historial. |
| **Días pasados cerrados** | No se pueden crear, completar, desmarcar, editar ni borrar tareas de días pasados (`DAY_CLOSED`). |
| **Días futuros** | Se pueden crear tareas para cualquier día futuro, pero **no completarlas** hasta que llegue su día (`DAY_NOT_STARTED`). |
| **Textos** | El título tiene de 1 a 200 caracteres y la descripción hasta 1000, contados tras quitar los espacios del principio y del final. Una descripción vacía se guarda como `null`. |
| **Orden de las listas** | Tareas: por fecha y, dentro de cada día, por orden de creación. Avisos: del más reciente al más antiguo. |
| **Avisos** | A las **22:00** de tu zona horaria el servidor registra un aviso con tus tareas **pendientes** que aún puedes completar: **diario** (las de hoy), **semanal** el viernes (de viernes a domingo) y **mensual** el primero de los 3 últimos días del mes (esos 3 días). Sin pendientes no hay aviso, y nunca hay dos del mismo tipo y periodo. |
| **Zona de los avisos** | La API recuerda la `X-Timezone` de tu última petición con cabeceras válidas. Si nunca has hecho una, no recibes avisos. |
| **Avisos históricos** | Un aviso guarda una **copia** de sus tareas (id, título y fecha): no cambia aunque después completes, edites o borres esas tareas. |
| **Recuperación** | Si el servidor estaba parado a las 22:00, registra el aviso al volver mientras su periodo siga abierto (hasta el fin del día, del domingo o del mes), solo con los días que aún se pueden completar. |

Ejemplo de racha. Hoy es 24; el 22 y el 23 fueron productivos y el 21 no:

| Situación | Racha actual |
| :--- | :--- |
| Hoy (24) todavía no has completado nada | **2** (22 y 23; hoy aún puedes completar) |
| Completas una tarea de hoy | **3** |
| El 24 termina sin completar nada; ya es día 25 | **0** |

La especificación completa, con todos los casos, está en [`sdd/001-taskApiSDD-mvp/spec.md`](sdd/001-taskApiSDD-mvp/spec.md).

---

## Arquitectura

### Módulos verticales + arquitectura hexagonal

El código se divide en **módulos de negocio** (`tasks`, `streaks` y `alerts`). Cada módulo tiene **tres capas**:

```text
┌────────────────────────────────────────────────────────────────┐
│ infrastructure/  Express (rutas, controladores), Zod, Prisma    │  ← el "mundo exterior"
│   ┌────────────────────────────────────────────────────────┐   │
│   │ application/  Casos de uso: coordinan qué se hace      │   │
│   │   ┌────────────────────────────────────────────────┐   │   │
│   │   │ domain/  Entidades y reglas de negocio puras    │   │   │  ← el corazón
│   │   │          (sin frameworks)                       │   │   │
│   │   └────────────────────────────────────────────────┘   │   │
│   └────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

| Capa | Qué contiene | Qué puede importar |
| :--- | :--- | :--- |
| `domain/` | Entidades (`Task`), *value objects* (`Streak`) y **puertos**: interfaces de lo que el dominio necesita del exterior, como `TaskRepository` | Solo `src/shared/domain`. **Nunca** Express, Prisma ni Zod |
| `application/` | **Casos de uso**: un fichero por acción (`create-task.use-case.ts`) | `domain/` y `src/shared/` |
| `infrastructure/` | **Adaptadores**: rutas, controladores, schemas Zod, repositorios Prisma, mappers | Todo lo anterior y los frameworks |

**¿Por qué así?** Las reglas importantes, como el cálculo de la racha o los días cerrados, se pueden probar en milisegundos sin levantar servidor ni base de datos. Y si mañana cambiara Prisma por otra cosa, solo tocaríamos `infrastructure/`.

**Los módulos no se importan entre sí por dentro.** Por ejemplo, `streaks` necesita saber qué días tienen tareas completadas, pero no puede importar el repositorio de `tasks`. Usa la **fachada pública** del módulo, `src/modules/tasks/task.facade.ts`, que expone solo lo que otros módulos pueden usar (principio V).

### El recorrido de una petición

Ejemplo: `PATCH /tasks/{id}` con `{"completed": true}`.

```text
Petición HTTP
   │
   ▼
1. allowed-method.middleware   ¿Método permitido (GET, POST, PATCH, DELETE)?   si no → ROUTE_NOT_FOUND
   │
   ▼
2. Router de Express           ¿Existe la ruta?                                 si no → ROUTE_NOT_FOUND
   │
   ▼
3. session.middleware          ¿X-CSRF-Token (PATCH)?  ¿Cookie de sesión válida y vigente?
   │  (módulo users)           → INVALID_CSRF_TOKEN / MISSING_TOKEN / INVALID_TOKEN / TOKEN_EXPIRED
   │                           → deja el usuario y la sesión (SessionContext)
   ▼
4. request-context.middleware  ¿X-Client-Time válido?  ¿X-Timezone coherente?
   │                           → calcula tu "día actual" (today) y recuerda tu zona
   ▼
5. json-body.middleware        ¿El cuerpo es un JSON válido de menos de 100 kB?  si no → VALIDATION_ERROR
   │
   ▼
6. task.controller             Valida params y cuerpo con Zod (task.schema.ts)  si no → VALIDATION_ERROR
   │
   ▼
7. update-task.use-case        Busca la tarea del usuario                        si no → TASK_NOT_FOUND
   │                           task.complete(today) aplica las reglas de día     → DAY_CLOSED / DAY_NOT_STARTED
   ▼
8. prisma-task.repository      Guarda en PostgreSQL
   │
   ▼
9. sendSuccess(...)            Responde con el sobre { success, status, message, data }

Si algo falla en cualquier paso → error-handler.middleware construye el sobre de error.
```

Los middlewares 3, 4 y 5 se encadenan **en cada ruta**, no de forma global (decisión D-8 de los planes de la 001 y la 002). Si fueran globales, `PUT /tasks` sin sesión respondería `MISSING_TOKEN` en lugar de `ROUTE_NOT_FOUND`, y se rompería el orden de los errores. El middleware de sesión lo crea el módulo `users` y el contenedor se lo inyecta a las rutas de `tasks`, `streaks` y `alerts`, que no importan nada de `users` (principio V).

### ¿Dónde se "enchufa" todo?

| Fichero | Papel |
| :--- | :--- |
| `src/server.main.ts` | Punto de entrada: arranca el servidor en el puerto 3000, el **planificador de avisos** (una pasada al arrancar y otra cada 60 s; deja una línea `ALERT_PASS_COMPLETED` en el log) y la **limpieza de datos de sesión caducados** (al arrancar y cada minuto; deja `AUTH_CLEANUP_COMPLETED` en la pasada inicial) |
| `src/app.factory.ts` | Crea la app de Express y monta los middlewares y routers en orden |
| `src/dependency.container.ts` | **Composition root**: crea las piezas reales (repositorios Prisma, casos de uso, controladores, routers) y las conecta. Es el único sitio que conoce las implementaciones concretas |
| `tests/support/test.container.ts` | El mismo cableado, pero con **fakes en memoria**, para los tests HTTP |

Para añadir un endpoint nuevo: caso de uso en `application/` → método en el controlador → ruta en `*.routes.ts` → conectarlo en los dos contenedores.

### Modelo de datos

| Tabla | Para qué |
| :--- | :--- |
| `tasks` | Las tareas. Columnas clave: `user_id`, `title`, `description`, `date` (tipo `DATE`, sin hora), `completed` y `sequence` (orden de creación exacto) |
| `alerts` | Los avisos registrados (H6), con una copia de sus tareas en `JSONB` |
| `alert_period_checks` | Qué periodos de aviso ya se evaluaron, para no duplicar avisos (H6) |
| `user_time_zones` | La última zona horaria recibida de cada usuario, para los avisos (H6) |

El esquema está en `prisma/schema.prisma` y **solo cambia mediante migraciones** de `prisma/migrations/` (principio IV). Una migración ya aplicada nunca se edita: se crea una nueva.

---

## Estructura de carpetas

```text
TaskApiSDD/
├── AGENTS.md                  # Contexto, comandos y convenciones (también para agentes de IA)
├── CONSTITUTION.md            # Las 7 leyes del proyecto (prevalece sobre todo lo demás)
├── README.md                  # Este fichero (se mantiene al día: ver "README vivo")
├── .githooks/pre-commit       # Rechaza commits que cambian CONSTITUTION.md, AGENTS.md o sdd/ sin actualizar README.md
├── .githooks/pre-push         # Rechaza el push si el quality gate de SonarQube no pasa
├── docker-compose.sonar.yml   # SonarQube local (:9000) y el scanner
├── sonar-project.properties   # Qué analiza SonarQube y dónde está la cobertura
├── scripts/sonar-setup.sh     # Prepara SonarQube: admin, quality gate y token
├── scripts/sonar-scan.sh      # Analiza la rama actual en su propio proyecto de SonarQube
├── scripts/sonar-issues.sh    # Por qué no pasa el gate: condiciones, incidencias y hotspots con fichero y línea
├── vite.config.ts             # Build de producción (dist/server.js) y carpetas que no reinician la API en desarrollo
├── .claude/settings.json      # Claude Code: recuerda al agente actualizar README.md tras editar esos ficheros, hooks de graphify
│                              # y permisos que le impiden leer .env.dev, .env.prod, *.pem, node_modules, dist y coverage
├── .claudeignore              # Lista de ficheros que Claude no debe leer (la protección efectiva son los permisos de arriba)
├── .claude/skills/graphify/   # Skill /graphify para Claude Code
├── CLAUDE.md                  # Reglas de graphify para Claude Code (generado por la herramienta)
├── graphify-out/              # Grafo de conocimiento del repo (no versionado)
├── sdd/001-taskApiSDD-mvp/    # Documentación SDD de la funcionalidad
│   ├── spec.md                #   QUÉ se construye (requisitos, contrato de la API)
│   ├── plan.md                #   CÓMO se construye (arquitectura, decisiones, riesgos)
│   ├── tasks.md               #   Tareas ejecutables, con su estado [x]/[ ]
│   ├── quickstart.md          #   Pruebas manuales paso a paso con curl
│   └── mvp-p1.postman-collection.json
├── sdd/002-user-accounts/     # Funcionalidad 002: cuentas de usuario (en curso)
│   ├── spec.md                #   Registro, login, sesiones en cookies, refresh token, CSRF y gestión de la cuenta
│   ├── plan.md                #   Módulo users, tablas nuevas, Argon2id (argon2), tokens aleatorios y AES-GCM de node:crypto
│   └── tasks.md               #   121 tareas: base, H1–H7 y robustez, con su estado [x]/[ ]
├── sdd/003-session-csrf-on-me/ # Funcionalidad 003: token CSRF de la sesión en GET /me (en curso)
│   ├── spec.md                #   GET /me devuelve { user, csrfToken }
│   ├── plan.md                #   Copia AES-256-GCM del token CSRF en sessions, migración que cierra las sesiones y no-store
│   └── tasks.md               #   25 tareas: base, H1 y robustez, con su estado [x]/[ ]
├── prisma/
│   ├── schema.prisma          # Modelo de datos
│   └── migrations/            # Migraciones versionadas (nunca se editan)
├── src/
│   ├── server.main.ts         # Arranque
│   ├── app.factory.ts         # Montaje de la app Express
│   ├── dependency.container.ts
│   ├── shared/                # Común a todos los módulos
│   │   ├── domain/            #   LocalDate, paginación, AppError, códigos de error, puertos Clock y TimeZoneService
│   │   ├── application/       #   RequestContext (usuario, día actual, zona)
│   │   └── infrastructure/
│   │       ├── http/          #   Middlewares, sobre de respuesta, validación de cabeceras
│   │       ├── config/        #   Variables de entorno validadas con Zod (clave de sesión y origen CORS, 002)
│   │       ├── prisma/        #   Cliente único de Prisma
│   │       ├── scheduling/    #   IntervalRunner: tarea periódica sin solapes, base de los planificadores
│   │       └── time/          #   Reloj del sistema y zonas horarias con Intl
│   └── modules/
│       ├── tasks/             # Tareas: crear, listar, completar…
│       │   ├── domain/        #   task.entity.ts, task.repository.ts (puerto)
│       │   │   └── tests/     #   Tests de domain/
│       │   ├── application/   #   create-task, list-task, get-task, update-task, delete-task, get-productive-date, get-pending-task
│       │   │   └── tests/
│       │   ├── infrastructure/#   rutas, controlador, schemas Zod, repositorio Prisma, mapper
│       │   │   └── tests/
│       │   └── task.facade.ts #   Lo único que otros módulos pueden importar de tasks
│       ├── streaks/           # Racha (misma estructura)
│       ├── alerts/            # Avisos: ventanas de aviso, planificador de 60 s, GET /alerts y zona recordada de cada usuario
│       └── users/             # Cuentas y sesiones (002): registro, login, renovación, logout, /me, CSRF y limpieza cada minuto
├── tests/                     # Soporte común de tests
│   ├── support/               #   Fakes en memoria, reloj falso, contenedor de test
│   └── integration/           #   Setup del esquema `test` de PostgreSQL
├── Dockerfile.dev             # Imagen de desarrollo
├── docker-compose.dev.yml     # api + db en desarrollo
├── jest.config.ts             # Proyectos de Jest: unit, integration, performance
├── package.json
├── pnpm-workspace.yaml        # Autoriza los scripts de instalación de Prisma
└── tsconfig.json
```

---

## Tests

### Tipos de test

| Tipo | Nombre | Qué prueba | ¿Usa base de datos? |
| :--- | :--- | :--- | :--- |
| **Unitario** | `*.test.ts` | Entidades, *value objects*, casos de uso (con fakes en memoria) | No |
| **HTTP** | `*.routes.test.ts` | El contrato de la API: códigos, sobre, precedencia de errores. Arranca la app real con fakes y hace peticiones con `fetch` | No |
| **Integración** | `*.int.test.ts` | Los repositorios Prisma contra PostgreSQL real | Sí, en el esquema `test` |
| **Rendimiento** | `tests/performance/` | p95 de cada endpoint con un usuario de 10 000 tareas en 3 años (< 300 ms, RNF-01) y duración de una pasada del planificador con 10 000 usuarios. Solo con `pnpm test:perf` | Sí, en el esquema `test` |

### Dónde van

Cada carpeta con código tiene una subcarpeta **`tests/`**, y cada test tiene el **mismo nombre** que el fichero que prueba:

```text
src/modules/tasks/application/create-task.use-case.ts
src/modules/tasks/application/tests/create-task.use-case.test.ts
```

### Ejecutarlos

```bash
docker compose -f docker-compose.dev.yml exec api pnpm test                        # todos
docker compose -f docker-compose.dev.yml exec api pnpm test src/modules/streaks    # solo un módulo o carpeta
docker compose -f docker-compose.dev.yml exec api pnpm test:watch                  # se repiten al guardar
docker compose -f docker-compose.dev.yml exec api pnpm test:coverage               # con informe de cobertura
docker compose -f docker-compose.dev.yml exec api pnpm test:perf                   # rendimiento (imprime el p95 de cada endpoint; ~30 s)
docker compose -f docker-compose.dev.yml exec api pnpm exec tsc --noEmit           # comprobación de tipos
```

> **Importante:** ejecuta también `tsc --noEmit`. Jest, con `ts-jest` en modo `isolatedModules`, **no** detecta los errores de tipos, solo los de sintaxis. `tsc` sí.

Los tests de integración usan el esquema **`test`** de la base de datos de desarrollo y lo vacían antes de cada test (cada fichero solo sus propias tablas, porque Jest los ejecuta en paralelo). Tus datos de desarrollo, que están en el esquema `public`, no se tocan nunca: `truncateTables()` se niega a vaciar cualquier otro esquema.

### Test-Driven Development

En este proyecto, **los tests se escriben antes que el código**:

1. Escribes el test → lo ejecutas → **debe fallar** (rojo).
2. Escribes el código mínimo → lo ejecutas → **pasa** (verde).
3. Mejoras el código sin romper el test.

---

## Cómo se trabaja en este proyecto (SDD)

Cada funcionalidad sigue siempre este orden (principio II):

```text
spec.md  →  clarificación  →  plan.md  →  tasks.md  →  código
 (QUÉ)     (resolver dudas)    (CÓMO)     (pasos)
```

| Documento | Responde a | Ejemplo |
| :--- | :--- | :--- |
| `spec.md` | ¿Qué debe hacer y por qué? Sin tecnologías | "RF-07 — Si la fecha de una tarea nueva es anterior al día actual, el sistema deberá rechazarla con `DAY_CLOSED`" |
| `plan.md` | ¿Cómo se construye? | Arquitectura, modelo de datos, decisiones técnicas (D-1 a D-25) y riesgos |
| `tasks.md` | ¿En qué pasos? | `T039 Caso de uso crear tarea (RF-03, RF-07) — create-task.use-case.ts` |

Ideas clave:

- **Si el código y la spec discrepan, la spec manda**: el código es un defecto.
- Cambiar el comportamiento visible (endpoints, formato JSON, reglas) exige **actualizar antes la spec**.
- Los requisitos funcionales siguen el formato **EARS** ("Cuando…, el sistema deberá…") y tienen un identificador `RF-xx`. Los tests y las tareas citan esos identificadores, así que todo es trazable: requisito → tarea → fichero → test.
- Ante una duda, no se inventa la respuesta: se marca `[NEEDS CLARIFICATION]` en la spec y se pregunta.

Las 7 leyes del proyecto están en [`CONSTITUTION.md`](CONSTITUTION.md) (versión 1.7.1). Léelas antes de tocar código.

### README vivo: este fichero nunca se queda atrás

Regla innegociable (CONSTITUTION.md, *Gobierno* 7): **todo cambio** en `CONSTITUTION.md`, en la estructura, comandos o convenciones de `AGENTS.md`, o en un `spec.md`, `plan.md` o `tasks.md` (funcionalidad nueva, tarea nueva o tarea completada) **obliga a actualizar este README en el mismo commit**.

Para saber qué ha cambiado desde la última actualización del README:

```bash
git diff $(git log -1 --format=%H -- README.md) -- CONSTITUTION.md AGENTS.md sdd/
git status --short CONSTITUTION.md AGENTS.md sdd/
```

Dos mecanismos lo hacen cumplir:

| Mecanismo | Para quién | Qué hace |
| :--- | :--- | :--- |
| `.githooks/pre-commit` | Todo el equipo | **Rechaza el commit** si toca esos ficheros sin tocar `README.md`. Se activa con `git config core.hooksPath .githooks`. |
| `.claude/settings.json` | Agentes de IA (Claude Code) | Tras editar cualquiera de esos ficheros, le recuerda al agente que actualice el README. |

---

## Convenciones

| Qué | Regla | Ejemplo |
| :--- | :--- | :--- |
| Ficheros y carpetas | `kebab-case`, en singular, con sufijo de responsabilidad | `create-task.use-case.ts`, `task.routes.ts` |
| Clases | `PascalCase` | `CreateTaskUseCase` |
| Nombres en el código | **En inglés** | `function createTask()` |
| Comentarios | **En español** | `// Calcula la racha actual` |
| Mensajes de la API | En español | `"Tarea creada con éxito"` |
| Campos JSON | Inglés, `camelCase` | `createdAt`, `pageSize` |
| Imports relativos | Con extensión `.js` (ESM) | `from './task.entity.js'` |

Sufijos más usados: `.entity.ts`, `.value-object.ts`, `.use-case.ts`, `.controller.ts`, `.routes.ts`, `.schema.ts`, `.mapper.ts`, `prisma-*.repository.ts`, `.port.ts`, `.adapter.ts`, `.middleware.ts`, `.facade.ts`. La lista completa está en `AGENTS.md`.

### Calidad: el código debe pasar SonarQube

Desde la versión 1.7.0 de la constitución (1.7.1: también el código nuevo), el principio III se llama **«Tests y calidad no se negocian»**: además de los tests, **no se puede hacer `git push`** si el código no pasa el *quality gate* de SonarQube. Se mide sobre todo el código, no solo el nuevo:

| Métrica | Para pasar |
| :--- | :--- |
| Bugs y vulnerabilidades | 0 |
| *Security hotspots* revisados | 100 % |
| Fiabilidad, seguridad y mantenibilidad | Calificación A |
| Cobertura de tests | ≥ 80 % |
| Líneas duplicadas | ≤ 3 % |
| **Código nuevo:** incidencias nuevas, incluidos *code smells* | 0 |
| **Código nuevo:** cobertura / duplicación / hotspots revisados | ≥ 80 % / ≤ 3 % / 100 % |

Lo comprueba el hook `.githooks/pre-push`: ejecuta `pnpm test:coverage`, lanza el análisis y rechaza el push si el *quality gate* falla, si SonarQube o la API no están levantados o si tienes cambios de código sin commitear (el análisis tiene que corresponder exactamente a lo que subes). Saltárselo (`--no-verify`) o marcar incidencias como falso positivo sin aprobación del responsable del proyecto está prohibido: las incidencias se corrigen en el código.

Para pasar a la primera, `AGENTS.md` §8 recoge las reglas de código. En resumen:
- **Fiabilidad y seguridad:** sin secretos en el código, sin SQL concatenado (solo Prisma o `$queryRaw` con plantilla), sin promesas flotantes, sin `catch` vacíos, solo se lanzan `Error`/`AppError`, y nada de `Math.random()` para ids.
- **Mantenibilidad:** complejidad cognitiva ≤ 15 por función, sin `any` ni `!` evitables, nada sin usar, sin duplicados, sin código comentado ni `TODO`, sin ternarios anidados ni más de 4 parámetros (salvo constructores con inyección de dependencias), y sin números mágicos.

```bash
docker compose -f docker-compose.sonar.yml up -d sonarqube              # SonarQube en http://localhost:9000 (usuario admin, SONAR_ADMIN_PASSWORD)
docker compose -f docker-compose.dev.yml exec api pnpm test:coverage    # tests con cobertura
./scripts/sonar-scan.sh                                                 # analizar a mano la rama actual, sin hacer push
./scripts/sonar-issues.sh                                               # ver por qué no pasa el gate: condiciones, incidencias y hotspots
```

> **Un proyecto por rama:** SonarQube Community no distingue ramas, así que cada rama de git se analiza en su propio proyecto: `taskapisdd-dev`, `taskapisdd-main`, etc. Así cada rama tiene su historial y su comparación de código nuevo, y un push de `main` no se mezcla con los de `dev`. Los ves todos en http://localhost:9000/projects. El de una rama nueva se crea en su primer análisis, con el mismo quality gate.

Si el push se rechaza, el hook `pre-push` muestra con `scripts/sonar-issues.sh` qué condición falla y cada incidencia o hotspot con su fichero, línea y regla. El script usa la cuenta de administrador de `.env.dev` (el token de análisis no puede leer hotspots) y nunca imprime las credenciales.

Estado actual (`taskapisdd-dev`): *quality gate* en verde, con 0 bugs, 0 vulnerabilidades, 0 hotspots, 0 *code smells*, un 95,7 % de cobertura según SonarQube y un 0 % de duplicación.

---

## Comandos útiles

Todos se ejecutan desde la raíz del proyecto.

```bash
# Contenedores
docker compose -f docker-compose.dev.yml up -d --build          # construir y levantar
docker compose -f docker-compose.dev.yml logs -f api            # ver los logs de la API
docker compose -f docker-compose.dev.yml restart api            # reiniciar la API
docker compose -f docker-compose.dev.yml down                   # parar (los datos se conservan)
docker compose -f docker-compose.dev.yml down -v                # parar y BORRAR la base de datos

# Dependencias
docker compose -f docker-compose.dev.yml up --build -d -V               # tras cambiar package.json: reconstruir y renovar node_modules
docker compose -f docker-compose.dev.yml cp api:/app/node_modules ./    # copiar node_modules al host para el editor

# Base de datos (Prisma)
docker compose -f docker-compose.dev.yml exec api pnpm prisma migrate deploy   # aplicar migraciones pendientes
docker compose -f docker-compose.dev.yml exec api pnpm prisma generate         # regenerar el cliente tras cambiar schema.prisma
docker compose -f docker-compose.dev.yml exec api pnpm prisma studio           # explorar la base de datos en http://localhost:5555

# Abrir psql dentro del contenedor de la base de datos
docker compose -f docker-compose.dev.yml exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

> **Dependencias:** `node_modules` vive en un volumen del contenedor, no en tu carpeta. El `./node_modules` de tu ordenador es solo una copia para el editor. Si cambias `package.json`, levanta con `-V`; sin él, Docker reutiliza el volumen anterior con las dependencias viejas.
>
> **Base de datos desde tu ordenador:** PostgreSQL está publicado en `localhost:5432`. Conecta tu cliente (DBeaver, TablePlus, `psql`…) con el usuario, contraseña y base de `.env.dev`.

Para **crear una migración nueva** después de cambiar `schema.prisma`:

```bash
docker compose -f docker-compose.dev.yml run --rm api pnpm prisma migrate dev --name <nombre>
```

Si no tienes terminal interactiva (por ejemplo, desde un script), consulta la alternativa con `migrate diff` + `migrate deploy` en `AGENTS.md`.

### Explorar el código con un grafo (graphify, opcional)

[graphify](https://github.com/safishamsi/graphify) convierte el repo en un grafo de conocimiento (`graphify-out/`, no versionado) que Claude Code consulta antes de leer ficheros. No forma parte del stack de la API: se instala en tu máquina, no en Docker.

```bash
uv tool install graphifyy                     # o: pip install graphifyy
# En Claude Code: /graphify .                 # construir el grafo la primera vez
graphify update .                             # actualizarlo tras cambiar código (sin coste de LLM)
graphify query "¿cómo se calcula la racha?"   # preguntar al grafo
graphify explain "LocalDate"                  # ver un nodo y sus conexiones
```

Abre `graphify-out/graph.html` en el navegador para verlo de forma interactiva.

---

## Problemas frecuentes

| Síntoma | Causa y solución |
| :--- | :--- |
| **"No veo mis tareas"** (`items: []`) | Cada usuario solo ve las suyas. Inicia sesión con la **misma cuenta** con la que las creaste (`signin <nombre>`). Recuerda también que `?date=` usa tu día **local**. |
| `400 INVALID_CLIENT_TIME` | `X-Client-Time` debe llevar el desfase `±HH:MM` (no `Z`) y estar a menos de 5 minutos de la hora real. Usa la función `now()` de la sección [Cómo usar la API](#cómo-usar-la-api). |
| `400 INVALID_TIMEZONE` | La zona no existe o no coincide con el desfase de tu hora. En Postman, revisa la variable `timeZone`. |
| `409 DAY_CLOSED` | Intentas crear o tocar una tarea de un día pasado. Está prohibido a propósito. |
| `409 DAY_NOT_STARTED` | Intentas completar una tarea de un día futuro. Espera a ese día. |
| La tarea de "hoy" tiene un `createdAt` del día anterior | Es correcto: `createdAt` está en UTC y `date` es tu día local. |
| El editor marca errores como "Cannot find module" | Borra `./node_modules`, cópialo del contenedor con `docker compose -f docker-compose.dev.yml cp api:/app/node_modules ./` y reinicia el servidor de TypeScript del editor. |
| El editor marca `Property 'user' does not exist on type 'PrismaClient'` (o no encuentra `argon2`) aunque los tests pasan | La copia de `./node_modules` del editor es anterior a la última migración o dependencia. Cópiala de nuevo del contenedor: `docker compose -f docker-compose.dev.yml cp api:/app/node_modules/. ./node_modules/` (si `rm -rf node_modules` da «Permission denied», es la carpeta de montaje: basta con vaciar su contenido) y reinicia el servidor de TypeScript del editor. Dentro del contenedor, el test `prisma.client.test.ts` avisa si el cliente generado no coincide con `schema.prisma`. |
| La API no encuentra un paquete recién añadido a `package.json` | El volumen de `node_modules` es el anterior. Levanta con `docker compose -f docker-compose.dev.yml up --build -d -V`. |
| El puerto 5432 ya está en uso al levantar | Tienes otro PostgreSQL en tu ordenador. Páralo o cambia el puerto publicado en `docker-compose.dev.yml` (por ejemplo `"5433:5432"`). |
| `ERR_PNPM_IGNORED_BUILDS` al construir | pnpm bloquea los scripts de instalación. Los de Prisma están autorizados en `pnpm-workspace.yaml`. |
| `prisma migrate dev` dice "environment is non-interactive" | Usa `docker compose ... run --rm api ...` (asigna terminal) o la alternativa de `AGENTS.md`. |
| `git commit` falla con "✖ README vivo" | El commit toca `CONSTITUTION.md`, `AGENTS.md` o `sdd/` sin tocar `README.md`. Actualiza el README con lo que ha cambiado, `git add README.md` y repite el commit. |
| `git push` falla con "✖ … Push rechazado" | El hook `pre-push` explica el motivo: SonarQube o la API sin levantar, cambios sin commitear o incidencias. Las incidencias se ven en el proyecto de tu rama (`http://localhost:9000/dashboard?id=taskapisdd-<rama>`) y se corrigen en el código. Nunca uses `--no-verify` (principio III). |
| `scripts/sonar-setup.sh` dice que falta `SONAR_ADMIN_PASSWORD` | Añádela a `.env.dev`: mínimo 12 caracteres con mayúscula, minúscula, dígito y símbolo. |
| `FATAL: sorry, too many clients already` | PostgreSQL se ha quedado sin conexiones. Reinicia la API (`docker compose -f docker-compose.dev.yml restart api`). La recarga en caliente ya desconecta Prisma y no se dispara al generar la cobertura. |
| El contenedor `api` se para nada más arrancar | Mira `docker compose -f docker-compose.dev.yml logs api`. Suele ser `.env.dev` mal rellenado o la base de datos sin migrar. |

---

## Estado del proyecto

### Funcionalidad 003 — Token CSRF de la sesión en `GET /me` (en curso)

[`spec.md`](sdd/003-session-csrf-on-me/spec.md) *Aprobada*; [`plan.md`](sdd/003-session-csrf-on-me/plan.md) *Aprobado* (sin dependencias nuevas: columna `sessions.csrf_token_sealed` cifrada con `SESSION_ENCRYPTION_KEY`; a partir de ahí, cambiar esa clave obliga a cerrar todas las sesiones) y [`tasks.md`](sdd/003-session-csrf-on-me/tasks.md) con 25 tareas (base, H1 y robustez): hechas la fase base y la H1 (18 de 25 tareas: cifrado AES-GCM común, columna `csrf_token_sealed`, migración que cierra las sesiones, repositorio y login con la copia cifrada, y `GET /me` con el token y `Cache-Control: no-store`); falta la fase de robustez (rendimiento, colecciones de Postman, guías, AGENTS.md y la prueba en producción). `GET /me` devuelve ya `data: { user, csrfToken }`, la misma forma que el login, para que el frontend recupere el token CSRF de la sesión tras recargar la página sin guardarlo en el navegador. Para poder devolver el mismo token que el login, la API conserva una copia que solo el servidor puede descifrar (una copia de la base de datos sola no basta para usarlo, como exige RNF-06 de la 002); **al instalarla se cierran todas las sesiones abiertas** y cada usuario vuelve a iniciar sesión una vez. La respuesta de `GET /me` no se guarda en ninguna caché. `PATCH /me` no cambia. La pide TaskFrontSDD (requisito previo de su spec 001).

### Funcionalidad 002 — Cuentas de usuario (en curso)

[`spec.md`](sdd/002-user-accounts/spec.md) *Aprobada*, [`plan.md`](sdd/002-user-accounts/plan.md) *Aprobado* y [`tasks.md`](sdd/002-user-accounts/tasks.md): fase base, H1 a H7 y la fase de robustez hechas salvo la prueba en producción (120 de 121 tareas: `argon2`, configuración, migración, dominio, adaptadores criptográficos, repositorios, CORS, registro, login, logout, `GET /me`, renovación de la sesión, limpieza cada minuto de los datos de sesión caducados las rutas de la 001 con sesión y CSRF, sin `X-User-Id`, el cambio de nombre con `PATCH /me`, el de contraseña con `PATCH /me/password` el borrado de la cuenta con `DELETE /me`, la batería de precedencia por pares con CSRF y sesión, el rendimiento de `/auth` y `/me` y AGENTS.md); falta ejecutar QS-R contra producción (T121). Guía manual en [`quickstart.md`](sdd/002-user-accounts/quickstart.md). **La migración vacía las tareas, avisos y zonas de desarrollo** (RF-33). Lo que cambia respecto a la 001:

- **Cuentas propias:** registro con email y contraseña (12–128 caracteres), login, perfil (`GET`/`PATCH /me`), cambio de contraseña y borrado de la cuenta.
- **Sesión en cookies `HttpOnly`:** es la única forma de identificarse; `X-User-Id` y `MISSING_USER` se eliminan de la API; los datos guardados con identificadores antiguos se borran al migrar. Token de acceso de 15 minutos y *refresh token* de 7 días que rota en cada renovación, con un margen de gracia de 30 segundos y un tope de 30 días por sesión.
- **CSRF:** cabecera `X-CSRF-Token` en todo `POST`, `PATCH` y `DELETE`, también en el login y el registro (con un token previo de `GET /auth/csrf`).
- **Fuerza bruta:** 5 intentos fallidos en 15 minutos bloquean la cuenta 15 minutos.
- **Dominio:** frontend en `https://kompitu.yandrydev.cloud` y API en `https://apikompitu.yandrydev.cloud`, con CORS con credenciales solo para el origen del frontend; la petición previa `OPTIONS` de CORS responde `200` con el sobre de éxito en cada ruta y método de `/auth` y `/me` (también `PATCH /me`, `PATCH /me/password` y `DELETE /me`) y de la 001.
- **Errores nuevos:** `INVALID_CSRF_TOKEN`, `MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_REFRESH_TOKEN`, `SESSION_EXPIRED`, `INVALID_CREDENTIALS`, `TOO_MANY_ATTEMPTS`, `WRONG_PASSWORD` y `EMAIL_ALREADY_REGISTERED`. `MISSING_USER` desaparece.
- **Fuera de alcance:** recuperar la contraseña y verificar el email (necesitan enviar emails), cambiar el email, login con Google/GitHub y 2FA.
- **Cómo se ha construido (plan):** módulo nuevo `users`; contraseñas con Argon2id (paquete `argon2`, la **única dependencia nueva**) y tokens aleatorios de `node:crypto`, guardando solo sus huellas (y una copia cifrada de 30 s para el margen de gracia); cookies y CORS sin librerías. Dos variables nuevas en `.env.*`: `SESSION_ENCRYPTION_KEY` y `CORS_ORIGIN`. La migración vacía los datos de la 001 y enlaza todas las tablas con `users` en cascada. Para no revelar por el tiempo si un email existe, el login con un email desconocido verifica la contraseña contra un hash ficticio de Argon2, que se calcula la primera vez que hace falta (no en el constructor, regla S7059 de SonarQube) y se reutiliza.

### Funcionalidad 001 — Tareas, rachas y avisos (completa)

Progreso en [`tasks.md`](sdd/001-taskApiSDD-mvp/tasks.md):

| Fase | Historia | Prioridad | Estado |
| :--- | :--- | :--- | :--- |
| Base | Docker, Prisma, Jest, infraestructura común e imagen de producción | — | ✅ |
| H1 | Crear y consultar las tareas de un día | P1 | ✅ |
| H2 | Completar tareas | P1 | ✅ |
| H3 | Ver la racha | P1 | ✅ |
| H4 | Consultar todas las tareas: rango de fechas `from`/`to` y `GET /tasks/{id}` | P2 | ✅ |
| H5 | Editar el título y la descripción (`PATCH`), y borrar tareas (`DELETE /tasks/{id}`) | P2 | ✅ |
| H6 | Avisos diarios, semanales y mensuales (`GET /alerts`) | P3 | ✅ |
| Robustez | Batería de precedencia de errores por pares (T127), tests de rendimiento (T128) y guía de producción (T129) | — | ✅ |

**Rendimiento medido** (`pnpm test:perf`, 10 000 tareas en 3 años): p95 de 1,6 a 5,1 ms por endpoint frente al límite de 300 ms; una pasada del planificador con 10 000 avisos simultáneos tarda 11 s. Con la 002 y Argon2id real: registro 13,1 ms, login 14,6 ms, renovación 2,8 ms, `GET /me` 1,8 ms y cambio de contraseña 25,1 ms.

**Producción** (T028, T029, T129): imagen multi-stage de 382 MB con `NODE_ENV=production`, `TZ=UTC`, usuario `node` y solo las dependencias de producción, en su propio proyecto de Compose (`taskapisdd-prod`), que convive con desarrollo:

```bash
docker compose -f docker-compose.prod.yml run --rm migrate      # 1. migraciones (servicio de un solo uso con el CLI de prisma)
docker compose -f docker-compose.prod.yml up --build -d         # 2. API en el puerto 3000 (API_HOST_PORT=3001 si desarrollo ya lo ocupa)
docker compose -f docker-compose.prod.yml down                  # parar (con -v borra su base de datos)
```

Necesita `.env.prod` con las mismas variables que `.env.dev` y `PORT=3000`. La guía completa está en `quickstart.md` (QS-R). Desde la H4 de la 002 la API identifica al usuario solo por su sesión (cookies `HttpOnly`, `Secure` y `SameSite=Strict`, y `X-CSRF-Token`); en producción necesita además `SESSION_ENCRYPTION_KEY` y `CORS_ORIGIN` en `.env.prod`. Queda por ejecutar contra producción la guía QS-R de la 002 (cookies y CORS).

---

## Documentos de referencia

| Documento | Cuándo leerlo |
| :--- | :--- |
| [`CONSTITUTION.md`](CONSTITUTION.md) | **Antes de tocar nada.** Las 7 leyes del proyecto. |
| [`AGENTS.md`](AGENTS.md) | Comandos completos, estructura, convenciones de nombres y reglas de código para pasar SonarQube (§8). |
| [`CLAUDE.md`](CLAUDE.md) | Si usas Claude Code con graphify: cómo debe consultar el grafo. |
| [`spec.md`](sdd/001-taskApiSDD-mvp/spec.md) | Para saber exactamente qué debe hacer la API: requisitos `RF-xx` y contrato completo. |
| [`spec.md` de la 002](sdd/002-user-accounts/spec.md) | Cuentas de usuario y sesiones: qué cambia de la 001 (sección *Relación con la funcionalidad 001*) y el contrato de `/auth` y `/me`. |
| [`tasks.md` de la 002](sdd/002-user-accounts/tasks.md) | Qué falta de las cuentas de usuario, tarea a tarea, y la cobertura RF → tareas. |
| [`plan.md` de la 002](sdd/002-user-accounts/plan.md) | Cómo se implementan las cuentas: tablas, formato de tokens, contraseñas y copia cifrada, orden de los middlewares, decisiones `D-xx` y riesgos `R-xx`. |
| [`plan.md`](sdd/001-taskApiSDD-mvp/plan.md) | Para entender por qué el código está hecho así: decisiones `D-xx` y riesgos `R-xx`. |
| [`tasks.md`](sdd/001-taskApiSDD-mvp/tasks.md) | Para saber qué está hecho y qué falta. |
| [`quickstart.md`](sdd/001-taskApiSDD-mvp/quickstart.md) | Para probar la API a mano, historia por historia. |
