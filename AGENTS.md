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
├── Dockerfile.prod               # Imagen de producción (multi-stage: build con Vite + runtime mínimo solo con dependencias de prod)
├── docker-compose.dev.yml        # Orquesta api (Dockerfile.dev) + PostgreSQL con .env.dev
├── docker-compose.prod.yml       # Orquesta api (Dockerfile.prod) + PostgreSQL con .env.prod
├── .env.dev                      # Variables de desarrollo (no versionado), cargado por docker-compose.dev.yml
├── .env.prod                     # Variables de producción (no versionado), cargado por docker-compose.prod.yml
├── prisma/                       # schema.prisma y migraciones
└── src/
    ├── shared/                   # Infraestructura global, errores base (AppError) y utilidades
    └── modules/
        └── [nombre-del-modulo]/  # Ej: tasks, users, streaks
            ├── domain/           # Modelos, Value Objects e interfaces de puertos (Salida)
            ├── application/      # Casos de uso / Comandos y Consultas
            └── infrastructure/   # Adaptadores de entrada (Controladores Express, Rutas, Schemas Zod) y salida (Prisma Repositories)
```



## 3. Comandos
Todos los comandos se ejecutan a través de Docker Compose. El servicio de la API se llama `api` y el de PostgreSQL `db`.

### Configuración inicial
Cada entorno tiene su propio fichero de variables, que su `docker-compose.*.yml` carga mediante `env_file`. `.env.dev` y `.env.prod` están ignorados por git y nunca deben versionarse.

Crear ambos ficheros en la raíz con las variables: `DATABASE_URL`, `PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.

### Desarrollo (`Dockerfile.dev`)
```bash
docker compose -f docker-compose.dev.yml up --build               # Construir y levantar api + db con hot reload
docker compose -f docker-compose.dev.yml up -d                    # Levantar en segundo plano
docker compose -f docker-compose.dev.yml logs -f api              # Ver logs de la API
docker compose -f docker-compose.dev.yml down                     # Parar los contenedores
docker compose -f docker-compose.dev.yml down -v                  # Parar y borrar volúmenes (incluida la BDD)
docker compose -f docker-compose.dev.yml exec api pnpm add <pkg>  # Añadir una dependencia dentro del contenedor
```

### Producción (`Dockerfile.prod`)
```bash
docker compose -f docker-compose.prod.yml up --build -d           # Construir la imagen de producción y levantarla
docker compose -f docker-compose.prod.yml down                    # Parar los contenedores
docker build -f Dockerfile.prod -t taskapisdd:latest .            # Construir solo la imagen de producción
```

### Base de datos (Prisma)
```bash
# Desarrollo
docker compose -f docker-compose.dev.yml exec api pnpm prisma generate                      # Generar el cliente de Prisma
docker compose -f docker-compose.dev.yml exec api pnpm prisma migrate dev --name <nombre>   # Crear y aplicar una migración
docker compose -f docker-compose.dev.yml exec api pnpm prisma migrate reset                 # Reiniciar la BDD y reaplicar migraciones
docker compose -f docker-compose.dev.yml exec api pnpm prisma studio                        # Explorar la BDD (puerto 5555 expuesto)

# Producción
docker compose -f docker-compose.prod.yml exec api pnpm prisma migrate deploy               # Aplicar migraciones pendientes
```

### Tests (Jest)
```bash
docker compose -f docker-compose.dev.yml exec api pnpm test                 # Ejecutar todos los tests
docker compose -f docker-compose.dev.yml exec api pnpm test:watch           # Tests en modo watch
docker compose -f docker-compose.dev.yml exec api pnpm test:coverage        # Tests con informe de cobertura
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
Ejecutar la suite de tests dentro del contenedor de desarrollo y confirma en tu respuesta que todo pasa .:

```bash
docker compose -f docker-compose.dev.yml exec api pnpm test
```

---

## 7. Reglas
- Lee `CONSTITUTION.md` y la spec activa (`sdd/[NNN]-[funcionalidad]/spec.md`) antes de tocar código.
- No añadas dependencias ni cambies el formato del JSON sin actualizar antes la spec.
- No modifiques ningún `spec.md` dentro de `sdd/` salvo petición explícita.
