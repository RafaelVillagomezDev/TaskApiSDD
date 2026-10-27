# Quickstart: pruebas manuales de TaskApiSDD MVP

Guía para probar a mano cada historia. Los *checkpoints* de `tasks.md` citan estos pasos (QS-0.1, QS-H1.1…).
Todo el servidor corre en Docker (AGENTS.md); en tu máquina solo se usan `curl` y `date`.

> **Alternativa con Postman (QS-H1 a QS-H6):** importa `sdd/001-taskApiSDD-mvp/mvp-p1.postman-collection.json`, ajusta la variable de colección `timeZone` a la zona de tu ordenador y ejecuta la carpeta "1. Flujo MVP" (*Run folder*) y después "2. Errores". La carpeta "3. Mis tareas" lista las tareas del usuario de la variable `myUserId`: ponle el mismo valor que uses en `X-User-Id` al crear tus tareas. Para ejecutarla desde la terminal sin instalar nada:
> ```bash
> docker run --rm -e TZ=Europe/Madrid -v "$PWD/sdd/001-taskApiSDD-mvp":/etc/newman postman/newman:6-alpine \
>   run mvp-p1.postman-collection.json --env-var baseUrl=http://host.docker.internal:3000
> ```

---

## QS-0 — Base

### Requisitos previos
- Docker Desktop arrancado.
- `.env.dev` en la raíz, creado a partir de `.env.example` y con todos los valores rellenos.

### Pasos
- **QS-0.1** Construir y levantar `api` y `db`:
  ```bash
  docker compose -f docker-compose.dev.yml up -d --build
  docker compose -f docker-compose.dev.yml cp api:/app/node_modules ./   # copia para el editor: la primera vez o tras cambiar package.json
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

---

## QS-H4 — Consultar todas mis tareas por estado (HU-04)

Usa `api`, `id` y `TODAY` de las secciones anteriores, con un usuario nuevo para que la lista solo tenga estas tareas. La API no deja crear tareas en días pasados, así que el rango se prueba con días futuros:

```bash
export USER_ID=h4-$RANDOM
D1=$(date -v+1d +%F 2>/dev/null || date -d '1 day' +%F)
D2=$(date -v+2d +%F 2>/dev/null || date -d '2 days' +%F)
D3=$(date -v+3d +%F 2>/dev/null || date -d '3 days' +%F)
A=$(api -X POST $API/tasks -d "{\"title\":\"A hoy\",\"date\":\"$TODAY\"}" | id)
api -X POST $API/tasks -d "{\"title\":\"B hoy\",\"date\":\"$TODAY\"}" > /dev/null
for d in $D1 $D2 $D3; do api -X POST $API/tasks -d "{\"title\":\"Tarea $d\",\"date\":\"$d\"}" > /dev/null; done
api -X PATCH $API/tasks/$A -d '{"completed":true}' > /dev/null   # A queda completada; el resto, pendientes
```

- **QS-H4.1** Todas las tareas, paginadas:
  ```bash
  api $API/tasks
  api "$API/tasks?page=2&pageSize=2"
  ```
  → `200` con las 5 tareas ordenadas por fecha y creación (`A hoy`, `B hoy`, `Tarea $D1`, `$D2`, `$D3`), `totalItems: 5`, `totalPages: 1`. La segunda petición → `Tarea $D1` y `Tarea $D2`, `page: 2`, `pageSize: 2`, `totalPages: 3`.
- **QS-H4.2** Solo las pendientes (y solo las completadas):
  ```bash
  api "$API/tasks?status=pending"
  api "$API/tasks?status=completed"
  ```
  → 4 pendientes (todas menos `A hoy`); la segunda → solo `A hoy` con `completed: true`.
- **QS-H4.3** Rango con ambos días incluidos:
  ```bash
  api "$API/tasks?from=$D1&to=$D2"
  ```
  → `Tarea $D1` y `Tarea $D2`, `totalItems: 2`.
- **QS-H4.4** Página demasiado grande:
  ```bash
  api "$API/tasks?pageSize=101"
  ```
  → `400 VALIDATION_ERROR` con `details` sobre `pageSize`.
- **QS-H4.5** `date` combinado con `from`, y `from` posterior a `to`:
  ```bash
  api "$API/tasks?date=$TODAY&from=$TODAY"
  api "$API/tasks?from=$D2&to=$D1"
  ```
  → `400 VALIDATION_ERROR` con `details` sobre `date`; la segunda, sobre `to`.
- **QS-H4.6** Consultar una tarea por id, propia y ajena:
  ```bash
  api $API/tasks/$A
  USER_ID=otra api $API/tasks/$A
  ```
  → `200` con la tarea `A hoy` y `completed: true`; la segunda → `404 TASK_NOT_FOUND`.

## QS-H5 — Editar y borrar tareas (HU-05)

Usa `api`, `id`, `TODAY` y `YESTERDAY` de las secciones anteriores, con un usuario nuevo:

```bash
export USER_ID=h5-$RANDOM
E=$(api -X POST $API/tasks -d "{\"title\":\"Borrador\",\"description\":\"Nota\",\"date\":\"$TODAY\"}" | id)
```

- **QS-H5.1** Cambiar el título de una tarea de hoy:
  ```bash
  api -X PATCH $API/tasks/$E -d '{"title":"   Título definitivo   "}'
  ```
  → `200`, `message: "Tarea actualizada con éxito"`, `title: "Título definitivo"` (recortado) y el resto igual (`description: "Nota"`, misma `date`, `completed: false`).
- **QS-H5.2** Intentar cambiar el día:
  ```bash
  api -X PATCH $API/tasks/$E -d "{\"date\":\"$TODAY\"}"
  ```
  → `400 VALIDATION_ERROR`; la tarea no cambia. Para mover una tarea de día se borra y se crea de nuevo (RF-37).
- **QS-H5.3** Borrar una tarea de hoy:
  ```bash
  api -X DELETE $API/tasks/$E
  api "$API/tasks?date=$TODAY"
  api $API/tasks/$E
  ```
  → `200` con `message: "Tarea eliminada con éxito"` y `data: null`; la lista de hoy ya no la incluye (`items: []`) y la consulta por id → `404 TASK_NOT_FOUND`.
- **QS-H5.4** Borrar una tarea de ayer. Como en QS-H2.4, se inserta directamente en la base de datos:
  ```bash
  Y=$(docker compose -f docker-compose.dev.yml exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"insert into tasks (user_id, title, date, updated_at) values ('$USER_ID', 'Ayer', '$YESTERDAY', now()) returning id\"" | head -1)
  api -X DELETE $API/tasks/$Y
  api -X PATCH $API/tasks/$Y -d '{"title":"Otro"}'
  ```
  → `409 DAY_CLOSED` en las dos; la tarea sigue existiendo.

## QS-H6 — Recibir avisos de tareas que van a quedar sin completar (HU-06)

Los avisos se disparan a las 22:00 en la zona recordada del usuario. Para no esperar a la noche, se usa una zona IANA cuya hora local actual esté entre las 22:00 y las 23:59. Usa `api` e `id` de las secciones anteriores; abre una terminal nueva o restaura `TZ` y `TZ_NAME` al terminar.

```bash
# Busca una zona donde ahora sean entre las 22:00 y las 23:59 (si no sale ninguna, prueba dentro de una hora)
for z in Pacific/Pago_Pago Pacific/Honolulu America/Anchorage America/Los_Angeles America/Denver America/Chicago \
         America/New_York America/Halifax America/Sao_Paulo Atlantic/South_Georgia Atlantic/Azores Atlantic/Reykjavik \
         Europe/Madrid Europe/Athens Europe/Moscow Asia/Dubai Asia/Karachi Asia/Dhaka Asia/Bangkok Asia/Shanghai \
         Asia/Tokyo Australia/Brisbane Pacific/Noumea Pacific/Auckland Pacific/Kiritimati; do
  [ "$(TZ=$z date +%H)" -ge 22 ] && { ZONE=$z; break; }
done; echo "$ZONE"
export TZ=$ZONE TZ_NAME=$ZONE            # `now` y las cabeceras de `api` pasan a usar esa zona
export USER_ID=h6-$RANDOM
ZTODAY=$(date +%F)                       # "hoy" en esa zona
```

- **QS-H6.1** Una petición con esa zona (la API la recuerda) y una tarea pendiente para su "hoy":
  ```bash
  N=$(api -X POST $API/tasks -d "{\"title\":\"Llamar al banco\",\"date\":\"$ZTODAY\"}" | id)
  ```
  → `201`.
- **QS-H6.2** Esperar como mucho 5 minutos (el planificador pasa cada 60 s) y consultar los avisos:
  ```bash
  api $API/alerts
  ```
  → `200` con un aviso `daily` de `periodStart` y `periodEnd` `$ZTODAY` cuya copia de `tasks` incluye `Llamar al banco`. Si ese día es viernes o el primero de los 3 últimos del mes, aparecen también el semanal o el mensual.
- **QS-H6.3** Completar la tarea y volver a consultar:
  ```bash
  api -X PATCH $API/tasks/$N -d '{"completed":true}' > /dev/null
  api $API/alerts
  ```
  → el aviso no cambia: sigue incluyendo la tarea con su título y su fecha de entonces (RF-30).
- **QS-H6.4** Reiniciar la API antes del fin del día local y consultar de nuevo:
  ```bash
  docker compose -f docker-compose.dev.yml restart api
  docker compose -f docker-compose.dev.yml logs --since 1m api | grep ALERT_PASS   # pasada inicial sin errores
  api $API/alerts
  ```
  → los mismos avisos, sin duplicados (RF-28, RF-47).
- **QS-H6.5** Un usuario que nunca ha hecho una petición no recibe avisos. Su tarea se inserta directamente en la base de datos y se comprueba allí, porque consultar `GET /alerts` con ese usuario ya recordaría su zona:
  ```bash
  docker compose -f docker-compose.dev.yml exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -qc \"insert into tasks (user_id, title, date, updated_at) values ('nunca-$USER_ID', 'Sin zona', '$ZTODAY', now())\""
  sleep 65
  docker compose -f docker-compose.dev.yml exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"select count(*) from alerts where user_id = 'nunca-$USER_ID'\""
  ```
  → `0` (RF-36).
