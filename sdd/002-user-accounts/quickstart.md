# Quickstart: Cuentas de usuario — guía de pruebas manuales

Guía para probar a mano cada historia de la spec 002. Los *checkpoints* de `tasks.md` citan estos pasos (QS-H1.1…). Todo el servidor corre en Docker (AGENTS.md); en tu máquina solo se usan `curl`, `openssl` y `sed`.

> **Alternativa con Postman:** importa `sdd/002-user-accounts/user-accounts.postman-collection.json` y ejecuta las carpetas "1. Flujo", "2. Errores", "3. CORS" y "4. Borrar la cuenta" en ese orden. Cubre las historias implementadas hasta ahora. Desde la terminal, sin instalar nada:
> ```bash
> docker run --rm -v "$PWD/sdd/002-user-accounts":/etc/newman postman/newman:6-alpine \
>   run user-accounts.postman-collection.json --env-var baseUrl=http://host.docker.internal:3000
> ```

## QS-0 — Preparación

### Requisitos previos
- Contenedores de desarrollo levantados (`docker compose -f docker-compose.dev.yml up -d`).
- `.env.dev` con las variables de la 002 (`.env.example` las lista vacías):
  ```bash
  SESSION_ENCRYPTION_KEY=<openssl rand -hex 32>
  CORS_ORIGIN=http://localhost:5173
  ```
  Si las añades con la API ya levantada, recrea el contenedor para que las lea: `docker compose -f docker-compose.dev.yml up -d --force-recreate api`. Si falta alguna, la API no arranca y `docker compose -f docker-compose.dev.yml logs api` dice cuál.
- Migraciones aplicadas: `docker compose -f docker-compose.dev.yml exec api pnpm prisma migrate deploy`. **La migración de la 002 vacía las tareas, avisos y zonas de desarrollo** (RF-33).
- **Navegador en desarrollo:** usa Chrome o Firefox. Safari no acepta las cookies `Secure` en `http://localhost` (riesgo R-2 del plan); `curl` y Postman sí funcionan.

### Ayuda para las peticiones
Pega esto en tu terminal (zsh o bash). `JAR` es el fichero donde `curl` guarda y reenvía las cookies de la sesión; `CSRF` es el token que va en `X-CSRF-Token`:

```bash
export API=http://localhost:3000
export JAR=$(mktemp)
# Token CSRF previo a la sesión, para registrarse e iniciar sesión (RF-22)
csrf() { curl -s $API/auth/csrf | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/'; }
# Petición con las cookies de JAR y la cabecera X-CSRF-Token
apij() {
  curl -s -b "$JAR" -c "$JAR" -H "Content-Type: application/json" -H "X-CSRF-Token: ${CSRF:-}" "$@"
  echo
}
EMAIL="ana-$RANDOM@example.com"
```

- Para ver también las cabeceras de la respuesta (por ejemplo `Set-Cookie`), añade `-i` a `apij`.

## QS-H1 — Registrarme (HU-01)

```bash
CSRF=$(csrf)
```

- **QS-H1.1** Pedir el token CSRF previo a la sesión:
  ```bash
  curl -s -i $API/auth/csrf
  ```
  → `200` con `data.csrfToken` (43 caracteres) y **sin** `Set-Cookie`.
- **QS-H1.2** Registrarse:
  ```bash
  apij -i -X POST $API/auth/register -d "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\",\"name\":\"  Ana  \"}"
  ```
  → `201`, `message: "Cuenta creada con éxito"`, `data` con `id`, el email en minúsculas, `name: "Ana"` y `createdAt`; sin `Set-Cookie` (el registro no abre sesión, RF-06) y sin la contraseña en ningún sitio.
- **QS-H1.3** El mismo email con otras mayúsculas y espacios:
  ```bash
  apij -X POST $API/auth/register -d "{\"email\":\"  $(echo $EMAIL | tr a-z A-Z) \",\"password\":\"correct horse battery\"}"
  ```
  → `409 EMAIL_ALREADY_REGISTERED`.
- **QS-H1.4** Contraseña de 11 caracteres:
  ```bash
  apij -X POST $API/auth/register -d "{\"email\":\"bea-$RANDOM@example.com\",\"password\":\"abcdefghijk\"}"
  ```
  → `400 VALIDATION_ERROR` con `details` sobre `password`.
- **QS-H1.5** Registro sin `X-CSRF-Token`:
  ```bash
  curl -s -X POST $API/auth/register -H "Content-Type: application/json" -d "{\"email\":\"cris-$RANDOM@example.com\",\"password\":\"correct horse battery\"}"; echo
  ```
  → `403 INVALID_CSRF_TOKEN`.

## QS-H2 — Iniciar y cerrar sesión (HU-02)

Usa la cuenta `$EMAIL` registrada en QS-H1.2.

```bash
CSRF=$(csrf)
```

- **QS-H2.1** Iniciar sesión:
  ```bash
  RESP=$(apij -i -X POST $API/auth/login -d "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\"}"); echo "$RESP"
  CSRF=$(echo "$RESP" | tail -1 | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
  ```
  → `200`, `message: "Sesión iniciada con éxito"`, `data` con `user` y `csrfToken`; dos `Set-Cookie`: `access_token` (`Max-Age=900; Path=/`) y `refresh_token` (`Max-Age=604800; Path=/auth`), las dos con `HttpOnly; Secure; SameSite=Strict`. Ningún token de sesión aparece en el cuerpo (RNF-05). Desde aquí `CSRF` es el token de la sesión (RF-24).
- **QS-H2.2** Consultar la cuenta con las cookies:
  ```bash
  apij $API/me
  ```
  → `200` con el usuario, sin `X-Client-Time` ni `X-Timezone` (RF-30).
- **QS-H2.3** Contraseña errónea y email inexistente:
  ```bash
  P=$(csrf)
  curl -s -X POST $API/auth/login -H "Content-Type: application/json" -H "X-CSRF-Token: $P" -d "{\"email\":\"$EMAIL\",\"password\":\"contraseña equivocada\"}"; echo
  curl -s -X POST $API/auth/login -H "Content-Type: application/json" -H "X-CSRF-Token: $P" -d "{\"email\":\"nadie-$RANDOM@example.com\",\"password\":\"contraseña equivocada\"}"; echo
  ```
  → las dos, `401 INVALID_CREDENTIALS` con el mismo cuerpo: no se sabe si el email existe (RF-08).
- **QS-H2.5** Cerrar sesión (antes que QS-H2.4, que bloquea la cuenta 15 minutos):
  ```bash
  cp "$JAR" "$JAR.old"
  apij -i -X POST $API/auth/logout
  apij $API/me
  curl -s -b "$JAR.old" $API/me; echo
  ```
  → el logout responde `200` con `data: null` y dos `Set-Cookie` que borran las cookies. Después, `GET /me` responde `401 MISSING_TOKEN` (`curl` ya borró las cookies) y, con las cookies anteriores guardadas en `$JAR.old`, `401 INVALID_TOKEN`: la sesión está cerrada (RF-15, RF-19).
- **QS-H2.4** Cinco fallos y después la contraseña correcta:
  ```bash
  for i in 1 2 3 4 5; do curl -s -o /dev/null -X POST $API/auth/login -H "Content-Type: application/json" -H "X-CSRF-Token: $P" -d "{\"email\":\"$EMAIL\",\"password\":\"contraseña equivocada\"}"; done
  curl -s -X POST $API/auth/login -H "Content-Type: application/json" -H "X-CSRF-Token: $P" -d "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\"}"; echo
  ```
  → `429 TOO_MANY_ATTEMPTS`: el email queda bloqueado 15 minutos aunque la contraseña sea correcta (RF-09). QS-H2.3 ya contó un fallo, así que el bloqueo llega en el cuarto intento del bucle. Para seguir probando, registra otra cuenta con un `EMAIL` nuevo.

## QS-H3 — Mantener la sesión abierta mientras la uso (HU-03)

Con una sesión abierta: si QS-H2.4 bloqueó la cuenta, registra otra con un `EMAIL` nuevo e inicia sesión como en QS-H2.1. `CSRF` debe ser el token de esa sesión.

- **QS-H3.1** Renovar la sesión:
  ```bash
  cp "$JAR" "$JAR.old"
  apij -i -X POST $API/auth/refresh
  apij $API/me
  ```
  → `200`, `message: "Sesión renovada con éxito"`, `data: null` y dos `Set-Cookie` nuevos (`access_token` con `Max-Age=900` y `refresh_token` con `Max-Age=604800; Path=/auth`). `GET /me` sigue respondiendo `200` con el mismo `CSRF`: el token CSRF de la sesión no cambia (RF-24). `$JAR.old` guarda las cookies de antes de renovar.
- **QS-H3.2** El refresh token anterior antes de que pasen 30 s:
  ```bash
  curl -s -i -b "$JAR.old" -H "X-CSRF-Token: $CSRF" -X POST $API/auth/refresh | grep -i '^set-cookie' | cut -d';' -f1
  grep -E 'access_token|refresh_token' "$JAR" | awk '{print $6 "=" $7}'
  ```
  → `200` con **los mismos** tokens que entregó QS-H3.1 (las dos listas coinciden): es el margen de gracia para dos pestañas que renuevan a la vez (RF-13).
- **QS-H3.3** El refresh token anterior después de 30 s:
  ```bash
  sleep 31
  curl -s -b "$JAR.old" -H "X-CSRF-Token: $CSRF" -X POST $API/auth/refresh; echo
  apij $API/me
  ```
  → `401 INVALID_REFRESH_TOKEN` con las cookies borradas, y `GET /me` con las cookies vigentes → `401 INVALID_TOKEN`: reutilizar un refresh token rotado cierra la sesión entera (RF-13, CE-04).
- **QS-H3.4** Renovar sin la cookie de refresh:
  ```bash
  curl -s -H "X-CSRF-Token: $CSRF" -X POST $API/auth/refresh; echo
  ```
  → `401 INVALID_REFRESH_TOKEN`: con la cabecera y sin sesión gana el error de sesión (RF-14, decisión 19). Sin `X-CSRF-Token` respondería `403 INVALID_CSRF_TOKEN`.
- **Limpieza (D-12):** `docker compose -f docker-compose.dev.yml logs api | grep AUTH_CLEANUP` muestra la pasada inicial (`AUTH_CLEANUP_COMPLETED`). Las demás pasadas, cada minuto, solo dejan rastro si fallan (`AUTH_CLEANUP_FAILED`).

## QS-H4 — Usar mis tareas, racha y avisos con mi sesión (HU-04)

Las rutas de la 001 (`/tasks`, `/streak`, `/alerts`) ya no leen `X-User-Id`: el usuario sale de la sesión. Siguen pidiendo `X-Client-Time` y `X-Timezone`. Para trabajar con dos cuentas a la vez, cada una con su fichero de cookies, define estas ayudas:

```bash
export TZ_NAME=$(readlink /etc/localtime | sed 's#.*/zoneinfo/##')   # p. ej. Europe/Madrid
now() { date +%Y-%m-%dT%H:%M:%S%z | sed -E 's/([+-][0-9]{2})([0-9]{2})$/\1:\2/'; }
# login_as <fichero de cookies> <email>: crea la cuenta si no existe, inicia sesión e imprime su token CSRF
login_as() {
  local p; p=$(csrf)
  curl -s -o /dev/null -X POST $API/auth/register -H "Content-Type: application/json" -H "X-CSRF-Token: $p" -d "{\"email\":\"$2\",\"password\":\"correct horse battery\"}"
  curl -s -c "$1" -X POST $API/auth/login -H "Content-Type: application/json" -H "X-CSRF-Token: $p" -d "{\"email\":\"$2\",\"password\":\"correct horse battery\"}" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/'
}
ANA=$(mktemp); BEA=$(mktemp)
CSRF_ANA=$(login_as $ANA "ana-$RANDOM@example.com"); CSRF_BEA=$(login_as $BEA "bea-$RANDOM@example.com")
```

- **QS-H4.1** Con la sesión de Ana, crear y listar tareas:
  ```bash
  TASK=$(curl -s -b $ANA -X POST $API/tasks -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF_ANA" -H "X-Client-Time: $(now)" -H "X-Timezone: $TZ_NAME" -d "{\"title\":\"Comprar pan\",\"date\":\"$(date +%F)\"}"); echo "$TASK"
  ID=$(echo "$TASK" | sed -E 's/.*"id":"([^"]+)".*/\1/')
  curl -s -b $ANA $API/tasks -H "X-Client-Time: $(now)" -H "X-Timezone: $TZ_NAME"; echo
  ```
  → `201` con la tarea y `200` con la lista que la incluye. `GET /streak` y `GET /alerts` con las mismas cookies y cabeceras también responden `200`.
- **QS-H4.2** `POST /tasks` sin `X-CSRF-Token`:
  ```bash
  curl -s -b $ANA -X POST $API/tasks -H "Content-Type: application/json" -H "X-Client-Time: $(now)" -H "X-Timezone: $TZ_NAME" -d "{\"title\":\"Sin CSRF\",\"date\":\"$(date +%F)\"}"; echo
  ```
  → `403 INVALID_CSRF_TOKEN` (RF-23). Los `GET` no lo piden.
- **QS-H4.3** `GET /tasks` sin cookie y con el `X-User-Id` de Ana:
  ```bash
  ANA_ID=$(curl -s -b $ANA $API/me | sed -E 's/.*"id":"([^"]+)".*/\1/')
  curl -s $API/tasks -H "X-User-Id: $ANA_ID" -H "X-Client-Time: $(now)" -H "X-Timezone: $TZ_NAME"; echo
  ```
  → `401 MISSING_TOKEN`: la cabecera ya no permite actuar como Ana (RF-18, RF-32).
- **QS-H4.4** Con la sesión de Bea, las tareas de Ana no aparecen:
  ```bash
  curl -s -b $BEA $API/tasks -H "X-Client-Time: $(now)" -H "X-Timezone: $TZ_NAME"; echo
  curl -s -b $BEA $API/tasks/$ID -H "X-Client-Time: $(now)" -H "X-Timezone: $TZ_NAME"; echo
  ```
  → `200` con `items: []` y `404 TASK_NOT_FOUND` (RF-21, CE-02).
- **QS-H4.5** `GET /tasks` con sesión y sin `X-Client-Time`:
  ```bash
  curl -s -b $ANA $API/tasks -H "X-Timezone: $TZ_NAME"; echo
  ```
  → `400 INVALID_CLIENT_TIME`: la hora y la zona siguen siendo obligatorias en estas rutas (RF-30).

## QS-H5 — Ver y editar mi perfil (HU-05)

Con una sesión abierta (QS-H2.1) y `CSRF` como token de esa sesión:

- **QS-H5.1** Cambiar el nombre con espacios alrededor:
  ```bash
  apij -X PATCH $API/me -d '{"name":"  Ana  "}'
  ```
  → `200`, `message: "Perfil actualizado con éxito"` y `data` con `name: "Ana"` (RF-05, RF-26).
- **QS-H5.2** Consultar el perfil:
  ```bash
  apij $API/me
  ```
  → `200` con `name: "Ana"`: es la prueba independiente de HU-05.
- **QS-H5.3** Intentar cambiar el email:
  ```bash
  apij -X PATCH $API/me -d '{"email":"otro@example.com"}'
  ```
  → `400 VALIDATION_ERROR`: `details` indica que falta `name` y que `email` es un campo desconocido. Solo se puede cambiar el nombre (RF-26).
- Un nombre vacío o solo con espacios (`{"name":"   "}`) o `{"name":null}` lo borra: `200` con `name: null`. Sin `X-CSRF-Token` → `403 INVALID_CSRF_TOKEN`.

## QS-H6 — Cambiar mi contraseña (HU-06)

Dos sesiones de la misma cuenta, cada una con su fichero de cookies (el portátil y el móvil). Usa una cuenta nueva: QS-H2.4 dejó bloqueada la anterior.

```bash
EMAIL="ana-$RANDOM@example.com"; P=$(csrf)
curl -s -o /dev/null -X POST $API/auth/register -H "Content-Type: application/json" -H "X-CSRF-Token: $P" -d "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\"}"
# login <fichero de cookies> <contraseña>: imprime la respuesta del login
login() { curl -s -c "$1" -X POST $API/auth/login -H "Content-Type: application/json" -H "X-CSRF-Token: $P" -d "{\"email\":\"$EMAIL\",\"password\":\"$2\"}"; echo; }
LAPTOP=$(mktemp); PHONE=$(mktemp)
login $LAPTOP "correct horse battery" > /dev/null
CSRF_PHONE=$(login $PHONE "correct horse battery" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
```

- **QS-H6.1** Cambiar la contraseña desde el móvil:
  ```bash
  curl -s -b $PHONE -X PATCH $API/me/password -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF_PHONE" -d '{"currentPassword":"correct horse battery","newPassword":"otra frase bastante larga"}'; echo
  ```
  → `200`, `message: "Contraseña cambiada con éxito"` y `data: null` (RF-27).
- **QS-H6.2** La sesión del portátil se ha cerrado y la del móvil sigue:
  ```bash
  curl -s -b $LAPTOP $API/me; echo
  curl -s -b $PHONE $API/me; echo
  ```
  → `401 INVALID_TOKEN` en el portátil (su refresh token responde `INVALID_REFRESH_TOKEN`) y `200` en el móvil.
- **QS-H6.3** Iniciar sesión con la contraseña anterior y con la nueva:
  ```bash
  login /dev/null "correct horse battery"
  login /dev/null "otra frase bastante larga"
  ```
  → `401 INVALID_CREDENTIALS` con la anterior y `200` con la nueva.
- **QS-H6.4** Contraseña actual errónea:
  ```bash
  curl -s -b $PHONE -X PATCH $API/me/password -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF_PHONE" -d '{"currentPassword":"contraseña equivocada","newPassword":"una tercera frase larga"}'; echo
  ```
  → `403 WRONG_PASSWORD`. El fallo cuenta para el bloqueo de RF-09, junto con los logins fallidos: con 5 en 15 minutos, `PATCH /me/password` y el login responden `429 TOO_MANY_ATTEMPTS`, aunque las sesiones ya abiertas siguen funcionando.

## QS-H7 — Borrar mi cuenta (HU-07)

Una cuenta nueva con una tarea, para ver que el borrado se lleva todos sus datos:

```bash
EMAIL="borrar-$RANDOM@example.com"; P=$(csrf); JAR=$(mktemp)
curl -s -o /dev/null -X POST $API/auth/register -H "Content-Type: application/json" -H "X-CSRF-Token: $P" -d "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\"}"
CSRF=$(curl -s -c "$JAR" -X POST $API/auth/login -H "Content-Type: application/json" -H "X-CSRF-Token: $P" -d "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\"}" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
USER_ID=$(apij $API/me | sed -E 's/.*"id":"([^"]+)".*/\1/')
apij -X POST $API/tasks -H "X-Client-Time: $(now)" -H "X-Timezone: $TZ_NAME" -d "{\"title\":\"Tarea\",\"date\":\"$(date +%F)\"}"
# Filas del usuario en users, tasks, sessions y user_time_zones
counts() { docker compose -f docker-compose.dev.yml exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"select (select count(*) from users where id = '$USER_ID'), (select count(*) from tasks where user_id = '$USER_ID'), (select count(*) from sessions where user_id = '$USER_ID'), (select count(*) from user_time_zones where user_id = '$USER_ID')\""; }
counts   # → 1|1|1|1
```

(`now` y `TZ_NAME` son los de QS-H4. A partir de aquí `apij` usa las cookies de `$JAR` y el token CSRF de esta sesión.)

- **QS-H7.4** Borrar con una contraseña errónea (antes que QS-H7.1, mientras la cuenta existe):
  ```bash
  apij -X DELETE $API/me -d '{"password":"contraseña equivocada"}'
  counts
  ```
  → `403 WRONG_PASSWORD` y la cuenta sigue: `1|1|1|1` (RF-28). El fallo cuenta para el bloqueo de RF-09.
- **QS-H7.1** Borrar la cuenta con su contraseña:
  ```bash
  apij -i -X DELETE $API/me -d '{"password":"correct horse battery"}'
  ```
  → `200`, `message: "Cuenta eliminada con éxito"`, `data: null` y dos `Set-Cookie` que borran las cookies (RF-29).
- **QS-H7.2** En la base de datos no queda nada del usuario:
  ```bash
  counts
  ```
  → `0|0|0|0`: la cuenta, sus tareas, sus sesiones y su zona recordada se han borrado en cascada (RF-29, D-9).
- **QS-H7.3** Iniciar sesión con ese email:
  ```bash
  curl -s -X POST $API/auth/login -H "Content-Type: application/json" -H "X-CSRF-Token: $P" -d "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\"}"; echo
  ```
  → `401 INVALID_CREDENTIALS`. Volver a registrarse con el mismo email crea una cuenta nueva, sin datos.
