# Quickstart: Sesiones pomodoro — guía de pruebas manuales

Guía para probar a mano la funcionalidad 004. Los *checkpoints* de `tasks.md` citan estos pasos (QS-01…). Todo el servidor corre en Docker (AGENTS.md); en tu máquina solo se usan `curl` y `sed`.

> **Con Postman:** `sdd/004-pomodoro-sessions/pomodoro-sessions.postman-collection.json` recorre los 11 endpoints (flujo, errores y CORS). No espera a que una sesión termine por tiempo: eso, la racha y los logros que dependen de ello se prueban aquí, en QS-06 y QS-07.

## Preparación

- Contenedores de desarrollo levantados y la migración de la 004 aplicada (`docker compose -f docker-compose.dev.yml exec api pnpm prisma migrate deploy`).
- Tras aplicar la migración, reinicia la API: `docker compose -f docker-compose.dev.yml restart api`. El proceso de desarrollo conserva el cliente de Prisma con el que arrancó, y sin reiniciar las rutas del pomodoro responderían `500 INTERNAL_ERROR` (y el barrido escribiría `POMODORO_SETTLE_FAILED` en el log).

Pega esto en tu terminal (zsh o bash). Crea una cuenta nueva, inicia sesión y deja la función `api`, que envía la cookie, el token CSRF y las cabeceras de hora y zona:

```bash
export API=http://localhost:3000
export TZ_NAME=$(readlink /etc/localtime | sed 's#.*/zoneinfo/##')
now() { date +%Y-%m-%dT%H:%M:%S%z | sed -E 's/([+-][0-9]{2})([0-9]{2})$/\1:\2/'; }
csrf_of() { sed -E 's/.*"csrfToken":"([^"]+)".*/\1/'; }
id_of() { sed -E 's/.*"data":\{"id":"([^"]+)".*/\1/'; }
EMAIL="qs004-$RANDOM@example.com"; P=$(curl -s $API/auth/csrf | csrf_of)
curl -s -o /dev/null -X POST $API/auth/register -H "Content-Type: application/json" -H "X-CSRF-Token: $P" -d "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\"}"
JAR=$(mktemp)
CSRF=$(curl -s -c $JAR -X POST $API/auth/login -H "Content-Type: application/json" -H "X-CSRF-Token: $P" -d "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\"}" | csrf_of)
# api <método> <ruta> [cuerpo JSON]
api() {
  local body=(); [ -n "$3" ] && body=(-d "$3")
  curl -s -b $JAR -X "$1" "$API$2" -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" -H "X-Client-Time: $(now)" -H "X-Timezone: $TZ_NAME" "${body[@]}"; echo
}
TODAY=$(date +%F)
```

> El token de acceso dura 15 minutos (002). Si una respuesta es `401 TOKEN_EXPIRED`, renueva la sesión con `curl -s -o /dev/null -b $JAR -c $JAR -X POST $API/auth/refresh -H "X-CSRF-Token: $CSRF"`.

## QS-01 — Empezar una sesión con sus tareas (HU-01, HU-02)

```bash
SESSION=$(api POST /pomodoros "{\"durationMinutes\":25,\"newTasks\":[{\"title\":\"Repasar el tema 3\",\"date\":\"$TODAY\"},{\"title\":\"Preparar el examen\",\"date\":\"2099-01-01\"}]}")
echo "$SESSION"; POMODORO=$(echo "$SESSION" | id_of)
api POST /pomodoros '{}'
api POST /pomodoros "{\"newTasks\":[{\"title\":\"Tarde\",\"date\":\"2000-01-01\"}]}"
```
→ `201` «Sesión pomodoro iniciada», en curso, con `endsAt` 25 minutos después, `remainingSeconds: 1500` y las dos tareas en ese orden. Después, `409 POMODORO_ALREADY_ACTIVE` (RF-12). La tarea con fecha pasada también da `POMODORO_ALREADY_ACTIVE`, porque va antes que `DAY_CLOSED` (RF-63); sin sesión activa sería `409 DAY_CLOSED` (RF-05).

## QS-02 — Completar, editar, añadir y quitar tareas (HU-03, HU-07)

```bash
TASK_A=$(echo "$SESSION" | sed -E 's/.*"tasks":\[\{"id":"([^"]+)".*/\1/')
api PATCH /pomodoro-tasks/$TASK_A '{"completed":true}'
api PATCH /pomodoro-tasks/$TASK_A '{"date":"2099-01-02"}'
ADDED=$(api POST /pomodoros/$POMODORO/tasks "{\"newTasks\":[{\"title\":\"Llamar a Marta\",\"date\":\"$TODAY\"}]}"); echo "$ADDED"
TASK_C=$(echo "$ADDED" | sed -E 's/.*"id":"([^"]+)","title":"Llamar a Marta".*/\1/')
api DELETE /pomodoros/$POMODORO/tasks/$TASK_C
api DELETE /pomodoros/$POMODORO/tasks/$TASK_A
```
→ completar: `200` con `completedAt`. Cambiar la fecha: `400 VALIDATION_ERROR` (RF-54). Añadir: la tarea nueva al final (RF-64). Quitarla: `200`, la tarea pasa a espera. Quitar la completada: `409 POMODORO_TASK_COMPLETED` (RF-37).

## QS-03 — Pausar, reanudar y terminar a mano (HU-05)

```bash
api PATCH /pomodoros/$POMODORO '{"status":"paused"}'
api PATCH /pomodoros/$POMODORO '{"status":"paused"}'
api PATCH /pomodoros/$POMODORO '{"status":"running"}'
api PATCH /pomodoros/$POMODORO '{"status":"finished"}'
```
→ pausada con `endsAt: null` y el tiempo restante fijo; pausar otra vez, `409 INVALID_POMODORO_STATE` (RF-61); reanudada con un `endsAt` nuevo; terminada con `endReason: "manual"`, los segundos reales de concentración y la foto de las tareas.

## QS-04 — Consultar las sesiones y la foto (HU-04)

```bash
api GET /pomodoros/$POMODORO
api GET "/pomodoros?page=1&pageSize=10"
```
→ la sesión terminada con su foto: la tarea completada y la pendiente tal como estaban al terminar, aunque después cambien (RF-16). El listado, de la más reciente a la más antigua (RF-18).

## QS-05 — Tareas en espera: pasarlas a otra sesión y borrarlas (HU-07)

```bash
api GET /pomodoro-tasks
WAITING=$(api GET /pomodoro-tasks | sed -E 's/.*"items":\[\{"id":"([^"]+)".*/\1/')
SECOND=$(api POST /pomodoros "{\"waitingTaskIds\":[\"$WAITING\"]}"); echo "$SECOND"
api DELETE /pomodoro-tasks/$WAITING
api PATCH /pomodoros/$(echo "$SECOND" | id_of) '{"status":"finished"}'
api DELETE /pomodoro-tasks/$WAITING
```
→ las tareas en espera, por fecha y orden de creación (RF-24). La sesión nueva la incluye con su mismo id (RF-21). Borrarla mientras está en la sesión activa: `409 POMODORO_TASK_IN_SESSION` (RF-29). Al terminar la sesión vuelve a espera y entonces se borra: `200` con `data: null` (RF-22).

## QS-06 — Una sesión termina sola por tiempo (RF-15, RF-40)

```bash
SHORT=$(api POST /pomodoros '{"durationMinutes":1}' | id_of)
sleep 65
api GET /pomodoros/$SHORT
```
→ terminada con `endReason: "time"`, `finishedAt` igual a su fin previsto y `focusedSeconds: 60`, sin que nadie la haya terminado. Si no consultas nada, el barrido la asienta en menos de 60 s; en el log de la API (`docker compose -f docker-compose.dev.yml logs api`) aparece `POMODORO_SETTLE_COMPLETED`.

## QS-07 — Racha y logros (HU-06)

```bash
api GET /pomodoro-streak
api GET /pomodoro-achievements
api GET /streak
```
→ tras QS-06, racha `{ "current": 1, "best": 1 }`: solo cuentan las sesiones terminadas por tiempo (RF-38). En los logros, `FIRST_POMODORO` conseguido con `unlockedAt` igual al fin de esa sesión (RF-44), y `FOCUS_10H` con `target: 600` y el progreso en minutos (RF-65). La racha de tareas de la 001 no cambia (RF-42).

## QS-R — Producción

Producción usa su propio proyecto de Docker Compose (`taskapisdd-prod`, QS-R de la 001 a la 003). La migración de la 004 no borra ni cambia datos existentes: solo crea las tres tablas del pomodoro.

```bash
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up --build -d
```

Repite QS-01 y QS-06 contra la URL de producción (`export API=https://apikompitu.yandrydev.cloud`) desde un navegador o con `curl`, y comprueba que el log de producción no muestra `POMODORO_SETTLE_FAILED`.
