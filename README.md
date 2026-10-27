# TaskApiSDD

API REST para **organizar tareas diarias** y medir la **constancia** con una **racha de días productivos consecutivos**.

Está construida con **Spec-Driven Development (SDD)**: primero se escribe *qué* debe hacer el sistema (la spec), después *cómo* (el plan), después las *tareas*, y solo al final el código.

> **Estado:** el MVP P1 funciona de principio a fin: crear tareas, consultarlas, completarlas y ver la racha. Las historias P2 y P3 también están hechas: listar todas las tareas con filtros de estado y rango de fechas, consultar una tarea por su id (H4), editar el título y la descripción o borrar tareas (H5), y avisos diarios, semanales y mensuales de tareas pendientes (H6). Faltan la fase de robustez y la imagen de producción. Ver [Estado del proyecto](#estado-del-proyecto).

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

- **No hay login.** Cada petición indica quién eres con la cabecera `X-User-Id`. Cada usuario solo ve sus tareas.
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

### Las tres cabeceras obligatorias

**Todas** las peticiones necesitan estas cabeceras:

| Cabecera | Ejemplo | Para qué sirve |
| :--- | :--- | :--- |
| `X-User-Id` | `yandry` | Quién eres. Cualquier texto no vacío vale; no hay registro. |
| `X-Client-Time` | `2026-10-25T10:30:00+02:00` | La hora de tu dispositivo, **con desfase `±HH:MM`**. De ella sale tu "día actual". |
| `X-Timezone` | `Europe/Madrid` | Tu zona horaria en formato IANA. Se usa para los avisos. |

Reglas que conviene saber:

- `X-Client-Time` no puede desviarse **más de 5 minutos** de la hora del servidor. Se hace así para que nadie mueva su "hoy" a voluntad.
- El desfase de `X-Client-Time` tiene que **coincidir** con el de `X-Timezone` en ese momento. Por ejemplo, `+05:00` con `Europe/Madrid` se rechaza.
- `Z` no se acepta como desfase: usa `+00:00`.

### Ayuda para la terminal

Pega esto en tu terminal (zsh o bash) para no escribir las cabeceras a mano:

```bash
export API=http://localhost:3000
export TZ_NAME=$(readlink /etc/localtime | sed 's#.*/zoneinfo/##')   # tu zona, p. ej. Europe/Madrid
export USER_ID=yandry
now() { date +%Y-%m-%dT%H:%M:%S%z | sed -E 's/([+-][0-9]{2})([0-9]{2})$/\1:\2/'; }
api() { curl -s -H "X-User-Id: $USER_ID" -H "X-Client-Time: $(now)" -H "X-Timezone: $TZ_NAME" \
             -H "Content-Type: application/json" "$@"; echo; }
```

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

Si una petición tiene **varios** fallos a la vez, la API responde **solo el primero** de esta tabla (RF-46):

| Orden | Código | HTTP | Cuándo |
| :--- | :--- | :--- | :--- |
| 1 | `ROUTE_NOT_FOUND` | 404 | La ruta o el método no existen (por ejemplo, `PUT /tasks`) |
| 2 | `MISSING_USER` | 401 | Falta `X-User-Id` o está vacío |
| 3 | `INVALID_CLIENT_TIME` | 400 | `X-Client-Time` falta, tiene mal formato o se desvía más de 5 minutos |
| 4 | `INVALID_TIMEZONE` | 400 | `X-Timezone` falta, no es una zona IANA o no coincide con el desfase |
| 5 | `VALIDATION_ERROR` | 400 | El cuerpo o los parámetros no son válidos (incluido un JSON mal formado, `date` junto con `from`/`to`, `from` posterior a `to`, o un `PATCH` con un campo distinto de `title`, `description` y `completed`) |
| 6 | `TASK_NOT_FOUND` | 404 | La tarea no existe o es de otro usuario |
| 7 | `DAY_CLOSED` | 409 | Se intenta crear, modificar o borrar una tarea de un día pasado |
| 7 | `DAY_NOT_STARTED` | 409 | Se intenta completar una tarea de un día futuro |
| — | `INTERNAL_ERROR` | 500 | Error inesperado del servidor (sin detalles internos) |

### Probar con Postman

Importa `sdd/001-taskApiSDD-mvp/mvp-p1.postman-collection.json` en Postman y ajusta la variable de colección `timeZone` a la zona de tu ordenador. Después:

- ejecuta la carpeta **"1. Flujo MVP"** (*Run folder*) y luego **"2. Errores"**;
- en **"3. Mis tareas"**, pon tu usuario en la variable `myUserId` para ver siempre las mismas tareas.

La colección cubre H1 a H6: crear, consultar, completar, racha, filtros de estado y rango de fechas, paginación, consulta por id, edición, borrado y consulta de avisos, con sus casos de error. La generación de avisos no entra porque depende de que sean las 22:00 en tu zona: se prueba con la guía manual (QS-H6). Las cabeceras dinámicas (`X-Client-Time` y las fechas) las calcula sola la colección.

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
3. request-context.middleware  ¿X-User-Id?  ¿X-Client-Time válido?  ¿X-Timezone coherente?
   │                           → calcula tu "día actual" (today)
   ▼
4. json-body.middleware        ¿El cuerpo es un JSON válido de menos de 100 kB?  si no → VALIDATION_ERROR
   │
   ▼
5. task.controller             Valida params y cuerpo con Zod (task.schema.ts)  si no → VALIDATION_ERROR
   │
   ▼
6. update-task.use-case        Busca la tarea del usuario                        si no → TASK_NOT_FOUND
   │                           task.complete(today) aplica las reglas de día     → DAY_CLOSED / DAY_NOT_STARTED
   ▼
7. prisma-task.repository      Guarda en PostgreSQL
   │
   ▼
8. sendSuccess(...)            Responde con el sobre { success, status, message, data }

Si algo falla en cualquier paso → error-handler.middleware construye el sobre de error.
```

Los middlewares 3 y 4 se encadenan **en cada ruta**, no de forma global (decisión D-8 del plan). Si fueran globales, `PUT /tasks` sin usuario respondería `MISSING_USER` en lugar de `ROUTE_NOT_FOUND`, y se rompería el orden de los errores.

### ¿Dónde se "enchufa" todo?

| Fichero | Papel |
| :--- | :--- |
| `src/server.main.ts` | Punto de entrada: arranca el servidor en el puerto 3000 y el **planificador de avisos** (una pasada al arrancar y otra cada 60 s; deja una línea `ALERT_PASS_COMPLETED` en el log) |
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
├── vite.config.ts             # Solo para `pnpm dev`: carpetas que no reinician la API
├── .claude/settings.json      # Claude Code: recuerda al agente actualizar README.md tras editar esos ficheros, y hooks de graphify
├── .claude/skills/graphify/   # Skill /graphify para Claude Code
├── CLAUDE.md                  # Reglas de graphify para Claude Code (generado por la herramienta)
├── graphify-out/              # Grafo de conocimiento del repo (no versionado)
├── sdd/001-taskApiSDD-mvp/    # Documentación SDD de la funcionalidad
│   ├── spec.md                #   QUÉ se construye (requisitos, contrato de la API)
│   ├── plan.md                #   CÓMO se construye (arquitectura, decisiones, riesgos)
│   ├── tasks.md               #   Tareas ejecutables, con su estado [x]/[ ]
│   ├── quickstart.md          #   Pruebas manuales paso a paso con curl
│   └── mvp-p1.postman-collection.json
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
│   │       ├── prisma/        #   Cliente único de Prisma
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
│       └── alerts/            # Avisos: ventanas de aviso, planificador de 60 s, GET /alerts y zona recordada de cada usuario
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
| **Rendimiento** | `tests/performance/` | Tiempos de respuesta (pendiente) | Sí |

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
```

> **Un proyecto por rama:** SonarQube Community no distingue ramas, así que cada rama de git se analiza en su propio proyecto: `taskapisdd-dev`, `taskapisdd-main`, etc. Así cada rama tiene su historial y su comparación de código nuevo, y un push de `main` no se mezcla con los de `dev`. Los ves todos en http://localhost:9000/projects. El de una rama nueva se crea en su primer análisis, con el mismo quality gate.

Estado actual (`taskapisdd-dev`): *quality gate* en verde, con 0 bugs, 0 vulnerabilidades, 0 hotspots, 0 *code smells*, un 92 % de cobertura según SonarQube y un 0 % de duplicación.

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
| **"No veo mis tareas"** (`items: []`) | Cada usuario solo ve las suyas. Usa el **mismo `X-User-Id`** con el que las creaste. Recuerda también que `?date=` usa tu día **local**. |
| `400 INVALID_CLIENT_TIME` | `X-Client-Time` debe llevar el desfase `±HH:MM` (no `Z`) y estar a menos de 5 minutos de la hora real. Usa la función `now()` de la sección [Cómo usar la API](#cómo-usar-la-api). |
| `400 INVALID_TIMEZONE` | La zona no existe o no coincide con el desfase de tu hora. En Postman, revisa la variable `timeZone`. |
| `409 DAY_CLOSED` | Intentas crear o tocar una tarea de un día pasado. Está prohibido a propósito. |
| `409 DAY_NOT_STARTED` | Intentas completar una tarea de un día futuro. Espera a ese día. |
| La tarea de "hoy" tiene un `createdAt` del día anterior | Es correcto: `createdAt` está en UTC y `date` es tu día local. |
| El editor marca errores como "Cannot find module" | Borra `./node_modules`, cópialo del contenedor con `docker compose -f docker-compose.dev.yml cp api:/app/node_modules ./` y reinicia el servidor de TypeScript del editor. |
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

Funcionalidad `001-taskApiSDD-mvp`. Progreso en [`tasks.md`](sdd/001-taskApiSDD-mvp/tasks.md):

| Fase | Historia | Prioridad | Estado |
| :--- | :--- | :--- | :--- |
| Base | Docker, Prisma, Jest, infraestructura común | — | ✅ (salvo la imagen de producción) |
| H1 | Crear y consultar las tareas de un día | P1 | ✅ |
| H2 | Completar tareas | P1 | ✅ |
| H3 | Ver la racha | P1 | ✅ |
| H4 | Consultar todas las tareas: rango de fechas `from`/`to` y `GET /tasks/{id}` | P2 | ✅ |
| H5 | Editar el título y la descripción (`PATCH`), y borrar tareas (`DELETE /tasks/{id}`) | P2 | ✅ |
| H6 | Avisos diarios, semanales y mensuales (`GET /alerts`) | P3 | ✅ |
| Robustez | Batería de precedencia de errores y tests de rendimiento | — | ⏳ Pendiente |

**Producción:** `Dockerfile.prod` y `docker-compose.prod.yml` (tareas T028 y T029) están pendientes de dos decisiones: mover `prisma` a `dependencies` para poder ejecutar `migrate deploy` en producción, y añadir `NODE_ENV=production`.

---

## Documentos de referencia

| Documento | Cuándo leerlo |
| :--- | :--- |
| [`CONSTITUTION.md`](CONSTITUTION.md) | **Antes de tocar nada.** Las 7 leyes del proyecto. |
| [`AGENTS.md`](AGENTS.md) | Comandos completos, estructura, convenciones de nombres y reglas de código para pasar SonarQube (§8). |
| [`CLAUDE.md`](CLAUDE.md) | Si usas Claude Code con graphify: cómo debe consultar el grafo. |
| [`spec.md`](sdd/001-taskApiSDD-mvp/spec.md) | Para saber exactamente qué debe hacer la API: requisitos `RF-xx` y contrato completo. |
| [`plan.md`](sdd/001-taskApiSDD-mvp/plan.md) | Para entender por qué el código está hecho así: decisiones `D-xx` y riesgos `R-xx`. |
| [`tasks.md`](sdd/001-taskApiSDD-mvp/tasks.md) | Para saber qué está hecho y qué falta. |
| [`quickstart.md`](sdd/001-taskApiSDD-mvp/quickstart.md) | Para probar la API a mano, historia por historia. |
