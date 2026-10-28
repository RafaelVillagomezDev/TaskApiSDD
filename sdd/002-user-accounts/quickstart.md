# Quickstart: Cuentas de usuario — guía de pruebas manuales

Guía para probar a mano cada historia de la spec 002. Los *checkpoints* de `tasks.md` citan estos pasos (QS-H1.1…). Todo el servidor corre en Docker (AGENTS.md); en tu máquina solo se usan `curl`, `openssl` y `sed`.

> **Alternativa con Postman:** importa `sdd/002-user-accounts/user-accounts.postman-collection.json` y ejecuta las carpetas "1. Flujo", "2. Errores" y "3. CORS" en ese orden. Cubre las historias implementadas hasta ahora. Desde la terminal, sin instalar nada:
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
