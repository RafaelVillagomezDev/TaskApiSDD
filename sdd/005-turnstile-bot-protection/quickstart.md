# Quickstart: Protección frente a bots con Cloudflare Turnstile — guía de pruebas manuales

Guía para probar a mano la funcionalidad 005. Los *checkpoints* de `tasks.md` citan estos pasos (QS-01…). Todo el servidor corre en Docker (AGENTS.md); en tu máquina solo se usan `curl`, `sed` y `bash`.

Las pruebas usan Cloudflare de verdad con sus **claves secretas de prueba** (S-02 de la spec), que no necesitan widget: el frontend con la site key de prueba genera siempre el token ficticio `XXXX.DUMMY.TOKEN.XXXX`, y aquí se envía ese mismo texto.

| Clave secreta de prueba | Respuesta de Cloudflare | Respuesta de la API |
| :--- | :--- | :--- |
| `1x0000000000000000000000000000000AA` | Siempre pasa, con `hostname: example.com` y sin `action` | Sigue con el login o el registro |
| `2x0000000000000000000000000000000AA` | Siempre falla | `403 TURNSTILE_FAILED` |
| `3x0000000000000000000000000000000AA` | `timeout-or-duplicate` (token ya usado) | `403 TURNSTILE_FAILED` |

> **Con Postman:** `sdd/005-turnstile-bot-protection/turnstile-bot-protection.postman-collection.json` recorre el flujo y los errores de validación con la clave `1x…AA`. Las colecciones de la 001, la 002 y la 004 también envían el token ficticio. Las claves `2x…AA` y `3x…AA`, el modo opcional y Cloudflare inaccesible necesitan otra configuración de la API y se prueban aquí.

## Preparación

- `.env.dev` con las tres variables (AGENTS.md §3), sin guiones ni espacios antes de la clave:
  ```
  TURNSTILE_SECRET=1x0000000000000000000000000000000AA
  TURNSTILE_ALLOWED_HOSTNAMES=example.com,localhost
  TURNSTILE_ENFORCE=true
  ```
  Tras cambiar `.env.dev`, recrea el contenedor para que lo lea: `docker compose -f docker-compose.dev.yml up -d --force-recreate api`. Si Docker Compose responde `failed to read .env.dev: line N: key cannot contain a space`, esa línea no tiene la forma `CLAVE=valor`.
- Migración de la 005 aplicada (`docker compose -f docker-compose.dev.yml exec api pnpm prisma migrate deploy`) y la API reiniciada después (`docker compose -f docker-compose.dev.yml restart api`): el proceso conserva el cliente de Prisma con el que arrancó.

Pega esto en tu terminal (zsh o bash). Deja una cuenta registrada y las funciones `login` y `register`:

```bash
export API=http://localhost:3000
DUMMY=XXXX.DUMMY.TOKEN.XXXX
csrf_of() { sed -E 's/.*"csrfToken":"([^"]+)".*/\1/'; }
# post <puerto> <ruta> <cuerpo JSON>: pide un token CSRF previo y envía la petición
post() { local p; p=$(curl -s "localhost:$1/auth/csrf" | csrf_of); curl -s -w ' → %{http_code}\n' -X POST "localhost:$1$2" -H "Content-Type: application/json" -H "X-CSRF-Token: $p" -d "$3"; }
EMAIL="qs005-$RANDOM@example.com"
login() { post "${2:-3000}" /auth/login "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\"$1}"; }
register() { post "${2:-3000}" /auth/register "{\"email\":\"$EMAIL\",\"password\":\"correct horse battery\"$1}"; }
register ",\"turnstileToken\":\"$DUMMY\""
```
→ `201` «Cuenta creada con éxito».

### APIs temporales con otra configuración

QS-02, QS-03, QS-06, QS-07 y QS-08 necesitan otra clave, otro modo o Cloudflare inaccesible. Para no tocar `.env.dev`, se arranca una segunda API en el puerto 3002 que sobrescribe las variables solo en su contenedor, con la misma base de datos:

```bash
# temp_api <nombre> [-e VARIABLE=valor …] [-- <orden previa dentro del contenedor>]
temp_api() {
  local name=$1; shift; local envs=(); local pre="true"
  while [ $# -gt 0 ]; do [ "$1" = "--" ] && { shift; pre="$*"; break; }; envs+=("$1"); shift; done
  docker compose -f docker-compose.dev.yml run -d --rm --name "$name" -p 3002:3000 "${envs[@]}" api \
    sh -c "$pre && pnpm prisma generate >/dev/null 2>&1 && pnpm exec vite-node src/server.main.ts" >/dev/null 2>&1
  for _ in $(seq 1 40); do curl -s -o /dev/null localhost:3002/auth/csrf && return; sleep 1; done; echo "no arrancó"
}
```

> `pnpm prisma generate` es imprescindible: `docker compose run` crea un volumen de `node_modules` nuevo con el cliente de Prisma de la imagen, anterior a la 002, y sin regenerarlo todo responde `500 INTERNAL_ERROR`. Cada API temporal se para con `docker stop <nombre>`.

## QS-01 — Login con el token ficticio, dos veces (HU-01, RF-33)

```bash
login ",\"turnstileToken\":\"$DUMMY\""
login ",\"turnstileToken\":\"$DUMMY\""
```
→ `200` «Sesión iniciada con éxito» las dos veces, con `data: { user, csrfToken }`. Con la clave de prueba el token no se reserva, así que se puede repetir (RF-33); con una clave real, el segundo respondería `403 TURNSTILE_FAILED` (RF-21).

## QS-02 — Cloudflare rechaza el token; el rechazo no bloquea el email (RF-05, RF-12)

```bash
temp_api qs02 -e TURNSTILE_SECRET=2x0000000000000000000000000000000AA
for i in 1 2 3 4 5 6; do login ",\"turnstileToken\":\"$DUMMY\"" 3002; done
docker stop qs02
login ",\"turnstileToken\":\"$DUMMY\""
```
→ `403 TURNSTILE_FAILED` «No se ha podido verificar que eres una persona.» seis veces, y después, en la API de desarrollo, `200`: los rechazos no contaron para el bloqueo de 5 fallos de la 002.

## QS-03 — Token ya usado (RF-08)

```bash
temp_api qs03 -e TURNSTILE_SECRET=3x0000000000000000000000000000000AA
login ",\"turnstileToken\":\"$DUMMY\"" 3002
docker stop qs03
```
→ `403 TURNSTILE_FAILED`, con el mismo cuerpo que en QS-02 (RF-11).

## QS-04 — Sin token o con uno mal formado (RF-02, RF-17)

```bash
login ""
login ",\"turnstileToken\":\"\""
login ",\"turnstileToken\":12345"
```
→ `400 VALIDATION_ERROR` las tres veces, con `details: [{ "field": "turnstileToken", … }]`. No se consulta a Cloudflare.

## QS-05 — Registro (HU-02, RF-13)

```bash
EMAIL="qs005-$RANDOM@example.com"
register ",\"turnstileToken\":\"$DUMMY\""
register ",\"turnstileToken\":\"$DUMMY\""
temp_api qs05 -e TURNSTILE_SECRET=2x0000000000000000000000000000000AA
register ",\"turnstileToken\":\"$DUMMY\"" 3002
docker stop qs05
```
→ `201`; después `409 EMAIL_ALREADY_REGISTERED` (la verificación pasa y el email ya existe); con la clave que siempre falla, `403 TURNSTILE_FAILED` y no `409`: un rechazo no revela si el email existe.

## QS-06 — Modo opcional (HU-03, RF-15, RF-16)

```bash
temp_api qs06 -e TURNSTILE_ENFORCE=false -e TURNSTILE_SECRET=2x0000000000000000000000000000000AA
login "" 3002
login ",\"turnstileToken\":\"$DUMMY\"" 3002
docker stop qs06
```
→ sin token, `200` como en la 002; con token, se verifica y la clave que siempre falla lo rechaza: `403 TURNSTILE_FAILED`.

## QS-07 — La API no arranca con la configuración incompleta (RF-18, D-7)

```bash
docker compose -f docker-compose.dev.yml run --rm --no-deps -T -e TURNSTILE_ENFORCE= api \
  sh -c 'pnpm prisma generate >/dev/null 2>&1 && pnpm exec vite-node src/server.main.ts' 2>&1 | grep -oE "Configuración no válida en .env: [A-Z_]+: [^\"]+" | head -1
```
→ `Configuración no válida en .env: TURNSTILE_ENFORCE: Debe ser true o false`. El mensaje nombra la variable y nunca muestra su valor. Igual con `TURNSTILE_SECRET=` o `TURNSTILE_ALLOWED_HOSTNAMES=`.

## QS-08 — Cloudflare inaccesible (RF-09, RF-25, RNF-03)

```bash
temp_api qs08 -- 'echo "10.255.255.1 challenges.cloudflare.com" >> /etc/hosts'
time login ",\"turnstileToken\":\"$DUMMY\"" 3002
docker stop qs08
```
→ unos 5 s después, `503 TURNSTILE_UNAVAILABLE` «No se ha podido verificar que eres una persona; inténtalo de nuevo en unos minutos.». `challenges.cloudflare.com` apunta a una IP que no responde: el primer intento agota sus 3 s y el reintento, los 2 s que quedan (D-8). No se crea nada ni cuenta para el bloqueo.

## QS-R — Producción

Con la clave real **solo en `.env.prod`** (nunca en el chat, el repositorio ni los registros) y el orden de despliegue de S-06:

1. `.env.prod` con `TURNSTILE_SECRET=<clave secreta del widget>`, `TURNSTILE_ALLOWED_HOSTNAMES=kompitu.yandrydev.cloud` y **`TURNSTILE_ENFORCE=false`**.
2. Comprobar que producción rechaza una configuración insegura: con una clave de prueba o con `localhost` en la lista, `docker compose -f docker-compose.prod.yml up` no arranca la API y el log nombra la variable (RF-19). Volver a los valores del paso 1.
3. `docker compose -f docker-compose.prod.yml run --rm migrate` (crea `turnstile_tokens`) y `docker compose -f docker-compose.prod.yml up --build -d`.
4. Con el frontend **antiguo**: el login sin token sigue funcionando (`200`, modo opcional).
5. Desplegar el frontend con el widget (site key `0x4AAAAAAGCKQh7WSaKl9bC0`, acciones `login` y `register`). Desde `https://kompitu.yandrydev.cloud`: registro y login → `201` y `200`. Reenviar a mano la misma petición (mismo token) → `403 TURNSTILE_FAILED` (RF-21). Si todos los logins dan `403`, revisar que la acción del widget sea `login`/`register` (RF-06, R-4) y que el host esté en la lista (RF-07, R-5).
6. Pasar a **`TURNSTILE_ENFORCE=true`** en `.env.prod` y recrear la API (`docker compose -f docker-compose.prod.yml up -d --force-recreate api`). Un login sin token → `400 VALIDATION_ERROR`; desde el frontend, sigue funcionando.

Si algo falla tras el paso 6, volver a `TURNSTILE_ENFORCE=false` y recrear la API lo arregla sin migraciones (R-2).
