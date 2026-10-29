# Quickstart: Token CSRF de la sesión en `GET /me` — guía de pruebas manuales

Guía para probar a mano la funcionalidad 003. Los *checkpoints* de `tasks.md` citan estos pasos (QS-01…). Todo el servidor corre en Docker (AGENTS.md); en tu máquina solo se usan `curl` y `sed`.

> **Con Postman:** las colecciones de la 002 (`sdd/002-user-accounts/user-accounts.postman-collection.json`) ya comprueban la nueva forma de `GET /me`: `data` con `user` y `csrfToken`, el mismo token que el login (también tras renovar) y `Cache-Control: no-store`, incluso en el `401`.

## Preparación

- Contenedores de desarrollo levantados y la migración de la 003 aplicada (`docker compose -f docker-compose.dev.yml exec api pnpm prisma migrate deploy`). **La migración cierra todas las sesiones abiertas** (RF-04).
- Tras aplicar la migración, reinicia la API: `docker compose -f docker-compose.dev.yml restart api`. El proceso de desarrollo conserva el cliente de Prisma con el que arrancó, y sin reiniciar el login respondería `500 INTERNAL_ERROR`.

Pega esto en tu terminal (zsh o bash). `login` inicia sesión con una cuenta nueva y guarda las cookies en `$JAR` y el token CSRF del login en `$LOGIN_CSRF`; `me_csrf` imprime el `csrfToken` que devuelve `GET /me`:

```bash
export API=http://localhost:3000
export TZ_NAME=$(readlink /etc/localtime | sed 's#.*/zoneinfo/##')
now() { date +%Y-%m-%dT%H:%M:%S%z | sed -E 's/([+-][0-9]{2})([0-9]{2})$/\1:\2/'; }
csrf_of() { sed -E 's/.*"csrfToken":"([^"]+)".*/\1/'; }
EMAIL="qs003-$RANDOM@example.com"; P=$(curl -s $API/auth/csrf | csrf_of)
curl -s -o /dev/null -X POST $API/auth/register -H "Content-Type: application/json" -H "X-CSRF-Token: $P" -d "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\"}"
# login <fichero de cookies>: inicia sesión con $EMAIL e imprime su token CSRF
login() { curl -s -c "$1" -X POST $API/auth/login -H "Content-Type: application/json" -H "X-CSRF-Token: $P" -d "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\"}" | csrf_of; }
me_csrf() { curl -s -b "$1" $API/me | csrf_of; }
JAR=$(mktemp); LOGIN_CSRF=$(login $JAR)
```

## QS-01 — `GET /me` devuelve la cuenta y el token CSRF del login (RF-01, RF-02, RNF-03)

```bash
curl -s -i -b $JAR $API/me; echo
echo "login: $LOGIN_CSRF"; echo "me:    $(me_csrf $JAR)"
```
→ `200` con `data: { user: { id, email, name, createdAt }, csrfToken }`, la cabecera `Cache-Control: no-store` y el mismo `csrfToken` que devolvió el login. Ningún token de acceso ni de refresco en el cuerpo (RNF-02). Sin cookie (`curl -s -i $API/me`), `401 MISSING_TOKEN`, también con `Cache-Control: no-store`.

## QS-02 — El mismo token tras renovar la sesión (RF-02)

```bash
curl -s -o /dev/null -b $JAR -c $JAR -X POST $API/auth/refresh -H "X-CSRF-Token: $LOGIN_CSRF"
echo "login: $LOGIN_CSRF"; echo "me:    $(me_csrf $JAR)"
```
→ los dos tokens coinciden: renovar la sesión no cambia su token CSRF (RF-24 de la 002).

## QS-03 — Recuperar el token tras recargar: solo con las cookies (CE-01)

El frontend solo conserva las cookies al recargar. Con ellas basta `GET /me` para seguir haciendo peticiones que exigen el token:

```bash
TOKEN=$(me_csrf $JAR)
curl -s -b $JAR -X POST $API/tasks -H "Content-Type: application/json" -H "X-CSRF-Token: $TOKEN" -H "X-Client-Time: $(now)" -H "X-Timezone: $TZ_NAME" -d "{\"title\":\"Tras recargar\",\"date\":\"$(date +%F)\"}"; echo
```
→ `201`: dos peticiones (`GET /me` y `POST /tasks`) hasta crear una tarea.

## QS-04 — Cada sesión tiene su propio token (RF-01)

```bash
JAR2=$(mktemp); login $JAR2 > /dev/null
echo "sesión 1: $(me_csrf $JAR)"; echo "sesión 2: $(me_csrf $JAR2)"
curl -s -b $JAR2 -X PATCH $API/me -H "Content-Type: application/json" -H "X-CSRF-Token: $(me_csrf $JAR)" -d '{"name":"Otra"}'; echo
```
→ tokens distintos, y el de la primera sesión en la segunda responde `403 INVALID_CSRF_TOKEN` (RF-23 de la 002).

## QS-05 — `PATCH /me` no cambia (RF-03)

```bash
curl -s -b $JAR -X PATCH $API/me -H "Content-Type: application/json" -H "X-CSRF-Token: $LOGIN_CSRF" -d '{"name":"Ana"}'; echo
```
→ `200` con `data` como el recurso `User` (`id`, `email`, `name`, `createdAt`), sin `csrfToken`.

## QS-06 — Las sesiones de antes de la migración se cierran (RF-04)

Solo se puede ver una vez, al aplicar la migración en una base de datos con sesiones abiertas (en desarrollo ya se aplicó en la fase base). Con las cookies de una sesión abierta antes de migrar (guárdalas antes con `cp "$JAR" sesion-antigua.txt`):

```bash
curl -s -b sesion-antigua.txt $API/me; echo
```
→ `401 INVALID_TOKEN`; tras un nuevo login, `GET /me` devuelve su `csrfToken`.

## QS-R — Producción

Producción usa su propio proyecto de Docker Compose (`taskapisdd-prod`, QS-R de la 001 y la 002). Si desarrollo ocupa el puerto 3000, publica producción en otro:

```bash
export API_HOST_PORT=3001
export API=http://localhost:$API_HOST_PORT
```

- **QS-R.1** Iniciar sesión contra producción con las ayudas de arriba, guardar las cookies (`cp "$JAR" sesion-antigua.txt`) y aplicar la migración, que **cierra todas las sesiones de producción** (RF-04):
  ```bash
  docker compose -f docker-compose.prod.yml run --rm migrate
  docker compose -f docker-compose.prod.yml up --build -d
  ```
  → la migración `session_csrf_sealed` aplicada y la API levantada sin errores.
- **QS-R.2** Con la sesión anterior, `curl -s -b sesion-antigua.txt $API/me` → `401 INVALID_TOKEN`.
- **QS-R.3** Tras un nuevo login, `GET /me` desde el frontend de producción:
  ```bash
  JAR=$(mktemp); LOGIN_CSRF=$(login $JAR)
  curl -s -i -b $JAR $API/me -H "Origin: https://kompitu.yandrydev.cloud"
  ```
  → `200` con `data.csrfToken` igual a `$LOGIN_CSRF`, `Cache-Control: no-store`, `Access-Control-Allow-Origin: https://kompitu.yandrydev.cloud` y `Access-Control-Allow-Credentials: true`.

Para parar producción: `docker compose -f docker-compose.prod.yml down`. Vuelve a `export API=http://localhost:3000` para seguir contra desarrollo.
