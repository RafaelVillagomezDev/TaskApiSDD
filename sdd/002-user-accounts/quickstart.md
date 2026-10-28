# Quickstart: Cuentas de usuario — guía de pruebas manuales

Guía para probar a mano cada historia de la spec 002. Los *checkpoints* de `tasks.md` citan estos pasos (QS-H1.1…). Todo el servidor corre en Docker (AGENTS.md); en tu máquina solo se usan `curl`, `openssl` y `sed`.

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
