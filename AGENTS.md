# AGENTS.md — TaskApiSDD

## 1. Contexto y Propósito del Proyecto
- **Nombre:** TaskApiSDD
- **Descripción:** API REST backend para la gestión de tareas diarias y seguimiento analítico de rachas de productividad (días consecutivos).
- **Stack Tecnológico:** 
  - Runtime & Lenguaje: Node.js, TypeScript (Strict Mode)
  - Framework: Express.js
  - Base de Datos & ORM: PostgreSQL, Prisma ORM
  - Empaquetado / Build: Vite
  - Validación: Zod
  - Pruebas: Jest
  - Gestor de Paquetes: pnpm
  - Contenedores: Docker (`Dockerfile.dev` para desarrollo, `Dockerfile.prod` para producción) orquestado con Docker Compose
- **Ejecución:** El proyecto **siempre** se ejecuta dentro de contenedores Docker. No se instalan dependencias ni se lanzan el servidor, las migraciones o los tests directamente en la máquina host.
- **Ley Suprema:** Debes seguir estrictamente las leyes arquitectónicas, metodológicas y de calidad definidas en el archivo **`CONSTITUTION.md`**.



## 2. Estructura de Directorios (Módulos Verticales + Hexagonal)
El código fuente se organiza en módulos de negocio independientes bajo `src/modules/`. Los ficheros de Docker se ubican en la raíz del proyecto:

```text
./
├── AGENTS.md                     # Instrucciones para agentes de IA (este fichero)
├── CONSTITUTION.md               # Leyes arquitectónicas, metodológicas y de calidad
├── sdd/                          # Documentación Spec-Driven Development: una carpeta numerada por funcionalidad
├── Dockerfile.dev                # Imagen de desarrollo (dependencias de dev, hot reload, código montado como volumen)
├── Dockerfile.prod               # Imagen de producción (multi-stage: build con Vite → poda de devDependencies → runtime mínimo con NODE_ENV=production y usuario node)
├── docker-compose.dev.yml        # Orquesta api (Dockerfile.dev) + PostgreSQL con .env.dev
├── docker-compose.prod.yml       # Proyecto taskapisdd-prod: api (Dockerfile.prod) + PostgreSQL con .env.prod y el servicio migrate de un solo uso
├── .env.dev                      # Variables de desarrollo (no versionado), cargado por docker-compose.dev.yml
├── .env.prod                     # Variables de producción (no versionado), cargado por docker-compose.prod.yml
├── prisma/                       # schema.prisma y migraciones
├── tests/                        # Soporte común de tests: fakes (support/), setup de integración (integration/) y rendimiento (performance/)
├── .githooks/                    # Hooks de git versionados (pre-commit: README vivo; pre-push: quality gate de SonarQube); activar con git config core.hooksPath .githooks
├── docker-compose.sonar.yml      # SonarQube local (servidor en :9000) y el scanner bajo demanda, sin tocar package.json
├── sonar-project.properties      # Configuración del análisis: fuentes, tests, exclusiones y cobertura (coverage/lcov.info)
├── scripts/sonar-setup.sh        # Prepara SonarQube una vez (contraseña de admin, quality gate predeterminado, token global); idempotente
├── scripts/sonar-scan.sh         # Analiza la rama actual en su proyecto taskapisdd-<rama> y espera el quality gate (lo usa pre-push)
├── scripts/sonar-issues.sh       # Detalle del proyecto de la rama: condiciones del gate, incidencias y hotspots con fichero y línea (pre-push lo muestra si el gate falla)
├── vite.config.ts                # Build SSR de producción (dist/server.js) y, para `pnpm dev`, carpetas generadas que no reinician la API
├── .claude/settings.json         # Configuración de Claude Code del proyecto: hook que recuerda actualizar README.md, hooks de graphify y permisos que impiden leer secretos (.env.*, *.pem) y ficheros generados
├── .claudeignore                 # Ficheros que Claude no debe leer (dependencias, builds, secretos, cobertura); la protección efectiva son los permisos de .claude/settings.json
├── .claude/skills/graphify/      # Skill /graphify para Claude Code (generado por `graphify install --project`)
├── CLAUDE.md                     # Reglas de graphify para Claude Code (generado por `graphify install --project`)
├── graphify-out/                 # Grafo de conocimiento del repo (no versionado; cada uno genera el suyo)
├── README.md                     # Documentación general del proyecto; se mantiene al día (CONSTITUTION.md, Gobierno 7)
└── src/
    ├── shared/                   # Infraestructura global, errores base (AppError) y utilidades
    └── modules/
        └── [nombre-del-modulo]/  # tasks, streaks, alerts (001) y users (002: cuentas, sesiones y CSRF)
            ├── domain/           # Modelos, Value Objects e interfaces de puertos (Salida)
            │   └── tests/        # Tests de los ficheros de domain/
            ├── application/      # Casos de uso / Comandos y Consultas
            │   └── tests/        # Tests de los ficheros de application/
            └── infrastructure/   # Adaptadores de entrada (Controladores Express, Rutas, Schemas Zod) y salida (Prisma Repositories)
                └── tests/        # Tests de los ficheros de infrastructure/
```

> **Ubicación de los tests:** cada carpeta con código probado tiene una subcarpeta `tests/` con un test por fichero y el mismo nombre base (`application/create-task.use-case.ts` → `application/tests/create-task.use-case.test.ts`). Aplica también a `src/shared/` y sus subcarpetas. Nunca se deja un `*.test.ts` junto al código.



## 3. Comandos
Todos los comandos se ejecutan a través de Docker Compose. El servicio de la API se llama `api` y el de PostgreSQL `db`.

### Configuración inicial
Cada entorno tiene su propio fichero de variables, que su `docker-compose.*.yml` carga mediante `env_file`. `.env.dev` y `.env.prod` están ignorados por git y nunca deben versionarse.

Crear ambos ficheros en la raíz con las variables: `DATABASE_URL`, `PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `SESSION_ENCRYPTION_KEY` y `CORS_ORIGIN` (`.env.example` las lista sin valor). La API no arranca si falta alguna de las dos últimas o no es válida (`src/shared/infrastructure/config/app.config.ts`):
- `SESSION_ENCRYPTION_KEY`: clave AES-256 secreta de 64 caracteres hexadecimales (`openssl rand -hex 32`), distinta en cada entorno. Cifra la copia de los tokens de sesión durante los 30 s del margen de gracia de la renovación.
- `CORS_ORIGIN`: origen exacto del frontend que puede usar la API con cookies, sin barra final: `http://localhost:5173` en desarrollo y `https://kompitu.yandrydev.cloud` en producción.

`.env.dev` lleva además `SONAR_ADMIN_PASSWORD` (mínimo 12 caracteres con mayúscula, minúscula, dígito y símbolo) y `SONAR_TOKEN`, que rellena `scripts/sonar-setup.sh`.

### Desarrollo (`Dockerfile.dev`)
```bash
docker compose -f docker-compose.dev.yml up --build               # Construir y levantar api + db con hot reload
docker compose -f docker-compose.dev.yml up -d                    # Levantar en segundo plano
docker compose -f docker-compose.dev.yml logs -f api              # Ver logs de la API
docker compose -f docker-compose.dev.yml down                     # Parar los contenedores
docker compose -f docker-compose.dev.yml down -v                  # Parar y borrar volúmenes (incluida la BDD)
docker compose -f docker-compose.dev.yml exec api pnpm add <pkg>  # Añadir una dependencia dentro del contenedor
docker compose -f docker-compose.dev.yml up --build -d -V         # Tras cambiar package.json (o un pull que lo cambie): reconstruir y renovar el volumen de node_modules
docker compose -f docker-compose.dev.yml cp api:/app/node_modules ./  # Copiar node_modules del contenedor al host para que el editor vea los tipos (tras clonar o cambiar dependencias)
```

> **`node_modules` vive en un volumen anónimo del contenedor** (`/app/node_modules` en `docker-compose.dev.yml`), así que el montaje del código no lo pisa. Consecuencias:
> - `docker compose ... run --rm api pnpm install` ya **no** sirve: instala en un volumen temporal que se borra al terminar.
> - `up --build` sin `-V` reutiliza el volumen anterior y mantiene las dependencias viejas; tras cambiar `package.json` hay que usar `-V` (`--renew-anon-volumes`).
> - El `./node_modules` del host es solo una copia para el editor (`docker compose cp`); la API nunca lo usa. Para refrescarlo sin restos, bórralo antes de copiar.
> - **Navegador en desarrollo:** las cookies de sesión son `Secure`. Chrome, Firefox, `curl` y Postman las aceptan en `http://localhost`, pero Safari no: para probar el frontend en desarrollo, usa Chrome o Firefox (riesgo R-2 del plan de la 002).
> - PostgreSQL publica el puerto `5432` en el host: un cliente de base de datos o `psql` local se conecta a `localhost:5432` con las credenciales de `.env.dev` (dentro de Docker el host sigue siendo `db`).

### Análisis estático (SonarQube)
SonarQube corre en su propio compose y el scanner es una imagen de Docker: nada se añade a `package.json` (principio I). Los scripts de `scripts/` y el hook `pre-push` se ejecutan en el host, pero solo llaman a `docker compose` y a la API HTTP de SonarQube. SonarQube Community no distingue ramas, así que **cada rama de git tiene su propio proyecto**, `taskapisdd-<rama>` (`feature/x` → `taskapisdd-feature-x`), con su historial y su comparación de código nuevo. El proyecto de una rama se crea en su primer análisis y hereda el quality gate «TaskApiSDD», que es el predeterminado.
```bash
docker compose -f docker-compose.sonar.yml up -d sonarqube              # Levantar SonarQube en http://localhost:9000
./scripts/sonar-setup.sh                                                # Primera vez (y tras borrar sus volúmenes): admin, quality gate predeterminado y token global
docker compose -f docker-compose.dev.yml exec api pnpm test:coverage    # Tests con cobertura → coverage/lcov.info
./scripts/sonar-scan.sh                                                 # Analizar la rama actual (taskapisdd-<rama>) y esperar el quality gate (falla si no pasa)
./scripts/sonar-issues.sh                                               # Ver por qué no pasa: condiciones, incidencias y hotspots con fichero, línea y regla
docker compose -f docker-compose.sonar.yml down                         # Parar SonarQube (conserva configuración y análisis)
```
> `scripts/sonar-issues.sh` usa la cuenta de administrador (`SONAR_ADMIN_PASSWORD`), porque el token de análisis (`SONAR_TOKEN`) no puede leer hotspots ni métricas, y nunca imprime las credenciales; formatea la respuesta con `node` en el contenedor `api`.
>
> El hook `.githooks/pre-push` hace los dos últimos pasos en cada `git push` y rechaza el push si el quality gate no pasa (y entonces muestra el detalle con `scripts/sonar-issues.sh`), si SonarQube o `api` no están levantados, si hay cambios de código sin commitear o si lo que se sube no es la rama actual (el análisis se hace sobre el árbol de trabajo).

### Producción (`Dockerfile.prod`)
Proyecto de Compose propio (`taskapisdd-prod`): convive con desarrollo sin sustituir sus contenedores. Las migraciones se aplican **antes** de levantar la API. `.env.prod` lleva `PORT=3000`; `API_HOST_PORT` publica la API en otro puerto del host (por ejemplo `3001` si desarrollo ocupa el 3000).
```bash
docker compose -f docker-compose.prod.yml run --rm migrate        # 1. Aplicar migraciones (servicio de un solo uso con el CLI de prisma)
docker compose -f docker-compose.prod.yml up --build -d           # 2. Construir la imagen de producción y levantarla
docker compose -f docker-compose.prod.yml down                    # Parar los contenedores
docker build -f Dockerfile.prod -t taskapisdd:latest .            # Construir solo la imagen de producción
```

### Base de datos (Prisma)
```bash
# Desarrollo
docker compose -f docker-compose.dev.yml exec api pnpm prisma generate                      # Generar el cliente de Prisma
docker compose -f docker-compose.dev.yml run --rm api pnpm prisma generate                  # Regenerar el cliente de Prisma cuando api no está levantado
docker compose -f docker-compose.dev.yml exec api pnpm prisma migrate dev --name <nombre>   # Crear y aplicar una migración
# Sin terminal interactiva (agentes de IA), `migrate dev` aborta si la migración tiene avisos que confirmar.
# Alternativa no interactiva: generar el SQL de la migración nueva y aplicarlo
docker compose -f docker-compose.dev.yml exec -T api pnpm exec prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<AAAAMMDDHHMMSS>_<nombre>/migration.sql
docker compose -f docker-compose.dev.yml exec api pnpm prisma migrate deploy                # Aplicar migraciones pendientes en desarrollo
docker compose -f docker-compose.dev.yml exec api pnpm prisma migrate reset                 # Reiniciar la BDD y reaplicar migraciones
docker compose -f docker-compose.dev.yml exec api pnpm prisma studio                        # Explorar la BDD (puerto 5555 expuesto)

# Producción
docker compose -f docker-compose.prod.yml run --rm migrate                                  # Aplicar migraciones pendientes (servicio de un solo uso con el CLI de prisma)
```

### Tests (Jest)
```bash
docker compose -f docker-compose.dev.yml exec api pnpm test                 # Ejecutar todos los tests
docker compose -f docker-compose.dev.yml exec api pnpm test:watch           # Tests en modo watch
docker compose -f docker-compose.dev.yml exec api pnpm test:coverage        # Tests con informe de cobertura
docker compose -f docker-compose.dev.yml exec api pnpm test:perf            # Rendimiento: p95 por endpoint con 10 000 tareas y pasada del planificador (esquema test)
```

### Grafo de conocimiento (graphify)
Herramienta de apoyo para explorar el código. **No es una dependencia del proyecto** (no está en `package.json`) y es la única excepción a la ejecución en Docker: se instala y se ejecuta en el host (`uv tool install graphifyy` o `pip install graphifyy`). Los hooks de `.claude/settings.json` llaman al binario `graphify`; si no está instalado, no hacen nada.
```bash
/graphify .                                   # (en Claude Code) Construir el grafo completo en graphify-out/
graphify update .                             # Actualizar el grafo tras cambiar código (solo AST, sin coste de LLM)
graphify query "<pregunta>"                   # Consultar el grafo antes de buscar o leer ficheros
graphify path "<A>" "<B>"                     # Camino más corto entre dos nodos
graphify explain "<nodo>"                     # Explicar un nodo y sus conexiones
```
### 4. Convención de Nombres (Naming Conventions)

#### 1. Convención Base: `kebab-case`
- **Carpetas y Ficheros:** Siempre en minúsculas y separados por guiones (ej. `task-manager`, `create-task.use-case.ts`).
- **Por qué:** Evita errores críticos al pasar de entornos locales (Windows/Mac) a servidores de producción (Linux/Docker).

#### 2. Reglas Generales
- **Carpetas:** Nombres descriptivos o en plural según su contenido (ej. `modules`, `shared`, `tasks`).
- **Entidades (Clases):** Singular y en `PascalCase` (ej. `class Task`, `class UserProfile`).
- **Ficheros:** Singular en `kebab-case` seguido de un sufijo de responsabilidad.

#### 3. Guía Rápida de Sufijos

| Elemento / Rol | Convención de Fichero | Ejemplo |
| :--- | :--- | :--- |
| **Entidad de Dominio** | `[nombre].entity.ts` | `task.entity.ts` |
| **Value Object** | `[nombre].value-object.ts` (o `.vo.ts`) | `task-title.vo.ts` |
| **Caso de Uso / Acción** | `[accion]-[entidad].use-case.ts` | `create-task.use-case.ts` |
| **Controlador (Express)** | `[nombre].controller.ts` | `task.controller.ts` |
| **Rutas (Express)** | `[nombre].routes.ts` | `task.routes.ts` |
| **Esquema de Validación** | `[nombre].schema.ts` | `task.schema.ts` |
| **Repositorio (BD)** | `prisma-[nombre].repository.ts` | `prisma-task.repository.ts` |
| **Mapeador (Mapper)** | `[nombre].mapper.ts` | `task.mapper.ts` |
| **Test unitario o HTTP** | `tests/[fichero-probado].test.ts` (subcarpeta de la carpeta del fichero) | `application/tests/create-task.use-case.test.ts` |
| **Test de integración** | `tests/[fichero-probado].int.test.ts` | `infrastructure/tests/prisma-task.repository.int.test.ts` |
| **Carpeta de funcionalidad (SDD)** | `sdd/[NNN]-[funcionalidad]/` | `sdd/001-taskApiSDD-mvp/` |
| **Spec (SDD)** | `sdd/[NNN]-[funcionalidad]/spec.md` | `sdd/001-taskApiSDD-mvp/spec.md` |
| **Plan (SDD)** | `sdd/[NNN]-[funcionalidad]/plan.md` | `sdd/001-taskApiSDD-mvp/plan.md` |
| **Tasks (SDD)** | `sdd/[NNN]-[funcionalidad]/tasks.md` | `sdd/001-taskApiSDD-mvp/tasks.md` |

> **Trazabilidad SDD:** `[NNN]` es un número secuencial con **mínimo** tres dígitos, rellenado con ceros a la izquierda (`001`, `002`, … `999`, `1000`, `1001`, …). No hay límite: al superar `999` se sigue numerando sin renombrar las carpetas existentes. Cada funcionalidad nueva usa el siguiente número libre y agrupa su spec, plan y tasks en su propia carpeta.

### 4. Convención de Idioma 

- **Nombres de código** (funciones, clases, métodos, variables y propiedades): Estrictamente en **inglés** (ej. `function createTask()`, `class TaskRepository`).
- **Comentarios** (comentarios en código y explicaciones): Estrictamente en **español** (ej. `// Calcula la racha actual de productividad del usuario`).

---

## 5. Documentos
Los documentos AGENTS.md y Constitution.md  del proyecto están en la raíz:

- **`AGENTS.md`**: Contexto, estructura, comandos y convenciones para agentes de IA.
- **`CONSTITUTION.md`**: Ley suprema del proyecto. Prevalece sobre cualquier otro documento en caso de conflicto.
- **`CLAUDE.md`**: Reglas de uso del grafo de graphify para Claude Code (generado por la herramienta, en inglés). En caso de conflicto prevalecen `CONSTITUTION.md` y este fichero.

Los documentos del flujo Spec-Driven Development se guardan en `sdd/`, con una carpeta numerada por funcionalidad que contiene su spec, plan y tasks:

```text
sdd/
├── 001-taskApiSDD-mvp/
│   ├── spec.md                   # Especificación funcional: qué se construye y por qué
│   ├── plan.md                   # Plan técnico: cómo se implementa la spec
│   └── tasks.md                  # Tareas: desglose ejecutable del plan
└── 002-[funcionalidad]/
    ├── spec.md
    ├── plan.md
    └── tasks.md
```

---

## 6. Al terminar cualquier tarea
Ejecutar la suite de tests dentro del contenedor de desarrollo y confirma en tu respuesta que todo pasa, salvo en las tareas que solo modifican ficheros `.md` (CONSTITUTION.md, principio III):

```bash
docker compose -f docker-compose.dev.yml exec api pnpm test
```

### README vivo (CONSTITUTION.md, Gobierno 7)
Si la tarea ha modificado `CONSTITUTION.md`, la estructura, los comandos o las convenciones de este fichero, o un `spec.md`, `plan.md` o `tasks.md` de `sdd/`, actualiza `README.md` **en el mismo cambio**:

```bash
# 1. Qué ha cambiado en los ficheros vigilados desde el último commit que tocó README.md
git diff $(git log -1 --format=%H -- README.md) -- CONSTITUTION.md AGENTS.md sdd/
# 2. Lo que aún no está commiteado
git status --short CONSTITUTION.md AGENTS.md sdd/
```

3. Actualiza las secciones afectadas del README: estado del proyecto, endpoints, reglas de negocio, estructura de carpetas, comandos, convenciones, decisiones…
4. Indica en tu respuesta qué secciones has cambiado y por qué.

Dos hooks lo refuerzan:
- **`.claude/settings.json`** (Claude Code): tras editar cualquiera de esos ficheros, inyecta al agente un recordatorio.
- **`.githooks/pre-commit`** (git): rechaza el commit que toque esos ficheros sin tocar también `README.md`. Se activa una vez por clon con `git config core.hooksPath .githooks`. Saltárselo con `git commit --no-verify` está prohibido.

---

### Quality gate antes del push (CONSTITUTION.md, principio III)
Antes de proponer o hacer un `git push`, el código debe cumplir las reglas de §8. El hook `.githooks/pre-push` ejecuta los tests con cobertura, lanza el análisis de SonarQube y rechaza el push si el quality gate no pasa o si SonarQube no está levantado. Si el análisis encuentra incidencias, el hook las muestra con `scripts/sonar-issues.sh`; se informa de cada una (fichero, línea, regla) y se corrigen en el código; nunca se marcan como falso positivo ni se salta el hook (`--no-verify`) sin aprobación explícita del usuario.

---

## 7. Reglas
- Lee `CONSTITUTION.md` y la spec activa (`sdd/[NNN]-[funcionalidad]/spec.md`) antes de tocar código.
- No añadas dependencias sin justificarlas antes en el `plan.md` de la funcionalidad (CONSTITUTION.md, principio I), ni cambies el formato del JSON sin actualizar antes la spec.
- No modifiques ningún `spec.md` dentro de `sdd/` salvo petición explícita.
- Escribe el código cumpliendo las reglas de §8 desde el principio: es más barato que corregir lo que encuentre SonarQube.

---

## 8. Código que pasa SonarQube
El push solo pasa si el quality gate de SonarQube está en verde (CONSTITUTION.md, principio III). Se mide sobre **todo** el código y, además, sobre el código nuevo de cada análisis: cualquier incidencia nueva, aunque sea un *code smell* menor, bloquea el push.

| Métrica | Condición para pasar |
| :--- | :--- |
| Bugs | 0 |
| Vulnerabilidades | 0 |
| Security hotspots revisados | 100 % |
| Calificación de fiabilidad, seguridad y mantenibilidad | A |
| Cobertura de tests | ≥ 80 % |
| Líneas duplicadas | ≤ 3 % |
| **Código nuevo:** incidencias nuevas de cualquier tipo, incluidos *code smells* | 0 |
| **Código nuevo:** cobertura / duplicación / hotspots revisados | ≥ 80 % / ≤ 3 % / 100 % |

Reglas de código (prohibiciones comprobables):

**Fiabilidad y seguridad**
- Sin secretos, tokens ni contraseñas en el código ni en ficheros versionados: viven en `.env.dev` y `.env.prod` (principio IV).
- Sin SQL concatenado: solo la API de Prisma o `$queryRaw`/`$executeRaw` con plantilla etiquetada (parámetros enlazados). Prohibido `$queryRawUnsafe`/`$executeRawUnsafe` con datos de entrada.
- Toda promesa se espera con `await` o se descarta explícitamente con `void`; ninguna promesa queda flotando.
- Sin `catch` vacíos: cada error capturado se relanza, se convierte en `AppError` o se registra. Solo se lanzan instancias de `Error`/`AppError`, nunca cadenas ni objetos literales.
- Sin `Math.random()` para identificadores ni nada relacionado con seguridad: `crypto.randomUUID()` o los ids de PostgreSQL.

**Mantenibilidad**
- Complejidad cognitiva ≤ 15 por función: si se supera, se extraen funciones con nombre.
- Sin `any`: se usa `unknown` y se valida (Zod en `infrastructure/`) o se estrecha el tipo. Sin aserciones no nulas `!` que se puedan evitar comprobando el valor.
- Sin variables, imports, parámetros ni funciones sin usar.
- Sin bloques duplicados: lo común se extrae a `src/shared/` o dentro del módulo.
- Sin código comentado ni `TODO`/`FIXME` en lo que se sube.
- Sin ternarios anidados ni funciones con más de 4 parámetros; los constructores con inyección de dependencias quedan exceptuados.
- Sin números mágicos: los valores con significado (límites, minutos, tamaños de lote) van en constantes con nombre.

**Tests**
- Cobertura ≥ 80 %, con un fichero de test por cada `*.use-case.ts` y cada fichero de `domain/` con lógica (principio III).
