# Quickstart: pruebas manuales de TaskApiSDD MVP

Guía para probar a mano cada historia. Los *checkpoints* de `tasks.md` citan estos pasos (QS-0.1, QS-H1.1…).
Todo el servidor corre en Docker (AGENTS.md); en tu máquina solo se usan `curl` y `date`.

---

## QS-0 — Base

### Requisitos previos
- Docker Desktop arrancado.
- `.env.dev` en la raíz, creado a partir de `.env.example` y con todos los valores rellenos.

### Pasos
- **QS-0.1** Construir y levantar `api` y `db`:
  ```bash
  docker compose -f docker-compose.dev.yml up -d --build
  docker compose -f docker-compose.dev.yml run --rm api pnpm install   # solo la primera vez o tras cambiar package.json
  docker compose -f docker-compose.dev.yml logs api --tail 5           # debe mostrar {"event":"SERVER_STARTED","port":3000}
  ```
- **QS-0.2** Aplicar las migraciones:
  ```bash
  docker compose -f docker-compose.dev.yml exec api pnpm prisma migrate dev
  ```
  → `Already in sync` o la lista de migraciones aplicadas.

### Ayuda para las peticiones
Pega esto en tu terminal (zsh o bash, macOS o Linux). Define la función `api`, que envía las tres cabeceras obligatorias con la hora y la zona actuales de tu máquina:

```bash
export API=http://localhost:3000
export TZ_NAME=$(readlink /etc/localtime | sed 's#.*/zoneinfo/##')   # p. ej. Europe/Madrid
now() { date +%Y-%m-%dT%H:%M:%S%z | sed -E 's/([+-][0-9]{2})([0-9]{2})$/\1:\2/'; }   # ISO 8601 con ±HH:MM
api() {
  curl -s -H "X-User-Id: ${USER_ID:-demo}" -H "X-Client-Time: $(now)" -H "X-Timezone: $TZ_NAME" \
       -H "Content-Type: application/json" "$@"
  echo
}
```

- Otro usuario: `USER_ID=otra api ...`.
- Petición sin alguna cabecera: usa `curl` directamente.

### Comprobaciones
- **QS-0.3** Ruta inexistente:
  ```bash
  api $API/foo
  ```
  → `404` con `{"success":false,"status":404,"error":{"code":"ROUTE_NOT_FOUND",...}}`.
- **QS-0.4** Método no permitido:
  ```bash
  curl -s -X OPTIONS $API/tasks; echo
  ```
  → `404` con el sobre `ROUTE_NOT_FOUND`.
- **QS-0.5** `HEAD` sin cuerpo:
  ```bash
  curl -s -o /dev/null -w "%{http_code} bytes=%{size_download}\n" -I $API/tasks
  ```
  → `404 bytes=0`.

---

## QS-H1 — Planificar y consultar las tareas de un día (HU-01)

Usa la función `api` de QS-0. Fechas de hoy y de ayer en tu zona local:

```bash
TODAY=$(date +%F)
YESTERDAY=$(date -v-1d +%F 2>/dev/null || date -d yesterday +%F)   # macOS || Linux
```

- **QS-H1.1** Crear una tarea para hoy:
  ```bash
  api -X POST $API/tasks -d "{\"title\":\"  Comprar pan \",\"date\":\"$TODAY\"}"
  ```
  → `201`, `message: "Tarea creada con éxito"`, `title: "Comprar pan"` (recortado), `completed: false`.
- **QS-H1.2** Consultar las tareas de hoy:
  ```bash
  api "$API/tasks?date=$TODAY"
  ```
  → `200`, la tarea aparece en `data.items`, con `page: 1`, `pageSize: 50` y `totalItems: 1`.
- **QS-H1.3** Crear sin título:
  ```bash
  api -X POST $API/tasks -d "{\"title\":\"\",\"date\":\"$TODAY\"}"
  ```
  → `400 VALIDATION_ERROR` con `details: [{ "field": "title", ... }]` en español.
- **QS-H1.4** Crear para ayer:
  ```bash
  api -X POST $API/tasks -d "{\"title\":\"Tarde\",\"date\":\"$YESTERDAY\"}"
  ```
  → `409 DAY_CLOSED`.
- **QS-H1.5** Sin `X-User-Id`:
  ```bash
  curl -s "$API/tasks?date=$TODAY"; echo
  ```
  → `401 MISSING_USER`.
- **QS-H1.6** Método inexistente:
  ```bash
  curl -s -X PUT $API/tasks; echo
  ```
  → `404 ROUTE_NOT_FOUND`.

---

## QS-H2 — Completar tareas (HU-02)

Usa `api`, `TODAY` y `YESTERDAY` de las secciones anteriores. Para leer el `id` de una respuesta:

```bash
TOMORROW=$(date -v+1d +%F 2>/dev/null || date -d tomorrow +%F)   # macOS || Linux
id() { sed -E 's/.*"id":"([^"]+)".*/\1/'; }
```

- **QS-H2.1** Completar una tarea de hoy:
  ```bash
  T=$(api -X POST $API/tasks -d "{\"title\":\"Hoy\",\"date\":\"$TODAY\"}" | id)
  api -X PATCH $API/tasks/$T -d '{"completed":true}'
  ```
  → `200`, `message: "Tarea actualizada con éxito"`, `completed: true`.
- **QS-H2.2** Desmarcarla:
  ```bash
  api -X PATCH $API/tasks/$T -d '{"completed":false}'
  ```
  → `200` con `completed: false`.
- **QS-H2.3** Completar una tarea de mañana:
  ```bash
  M=$(api -X POST $API/tasks -d "{\"title\":\"Mañana\",\"date\":\"$TOMORROW\"}" | id)
  api -X PATCH $API/tasks/$M -d '{"completed":true}'
  ```
  → `409 DAY_NOT_STARTED`.
- **QS-H2.4** Completar una tarea de ayer. La API no deja crear tareas en días pasados, así que se inserta directamente en la base de datos:
  ```bash
  Y=$(docker compose -f docker-compose.dev.yml exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"insert into tasks (user_id, title, date, updated_at) values ('${USER_ID:-demo}', 'Ayer', '$YESTERDAY', now()) returning id\"" | head -1)
  api -X PATCH $API/tasks/$Y -d '{"completed":true}'
  ```
  → `409 DAY_CLOSED`.
- **QS-H2.5** Id con formato no UUID:
  ```bash
  api -X PATCH $API/tasks/abc -d '{"completed":true}'
  ```
  → `404 TASK_NOT_FOUND`.

---

## QS-H3 — Ver mi racha actual y mi mejor racha (HU-03)

Usa `api`, `id` y `TODAY` de las secciones anteriores, con un usuario nuevo: `export USER_ID=racha-$RANDOM`.

- **QS-H3.1** Racha de un usuario nuevo:
  ```bash
  api $API/streak
  ```
  → `200` con `data: { "current": 0, "best": 0 }`.
- **QS-H3.2** Crear y completar una tarea de hoy:
  ```bash
  T=$(api -X POST $API/tasks -d "{\"title\":\"Hoy\",\"date\":\"$TODAY\"}" | id)
  api -X PATCH $API/tasks/$T -d '{"completed":true}' > /dev/null
  api $API/streak
  ```
  → `{ "current": 1, "best": 1 }`.
- **QS-H3.3** Desmarcarla:
  ```bash
  api -X PATCH $API/tasks/$T -d '{"completed":false}' > /dev/null
  api $API/streak
  ```
  → `{ "current": 0, "best": 0 }`.
- **QS-H3.4** La racha se mantiene hasta el fin del día (RF-20). Se insertan días productivos de ayer y anteayer, con hoy todavía sin completar:
  ```bash
  D1=$(date -v-1d +%F 2>/dev/null || date -d '1 day ago' +%F)
  D2=$(date -v-2d +%F 2>/dev/null || date -d '2 days ago' +%F)
  docker compose -f docker-compose.dev.yml exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -qc \"insert into tasks (user_id, title, date, completed, updated_at) values ('$USER_ID','Ayer','$D1',true,now()), ('$USER_ID','Anteayer','$D2',true,now())\""
  api $API/streak
  ```
  → `{ "current": 2, "best": 2 }`.
