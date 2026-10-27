#!/bin/sh
# Prepara el SonarQube local (docker-compose.sonar.yml). Idempotente: se puede repetir sin efectos.
#   1. Cambia la contraseña por defecto de admin por SONAR_ADMIN_PASSWORD (.env.dev)
#   2. Crea el quality gate del principio III (CONSTITUTION.md) y lo hace el predeterminado, para que
#      el proyecto de cada rama (taskapisdd-<rama>, lo crea scripts/sonar-scan.sh) lo herede
#   3. Genera un token de análisis global en SONAR_TOKEN (.env.dev), válido para el proyecto de cualquier rama
set -eu
cd "$(dirname "$0")/.."

SONAR_URL=http://localhost:9000
GATE=TaskApiSDD

env_value() { sed -n "s/^$1=//p" .env.dev | tail -n 1; }
ADMIN_PASSWORD=$(env_value SONAR_ADMIN_PASSWORD)
if [ -z "$ADMIN_PASSWORD" ]; then
  echo "✖ Falta SONAR_ADMIN_PASSWORD en .env.dev (mínimo 12 caracteres con mayúscula, minúscula, dígito y símbolo)" >&2
  exit 1
fi
# Clave base de los proyectos: taskapisdd-<rama> (scripts/sonar-scan.sh)
BASE_KEY=taskapisdd

echo "Esperando a SonarQube en $SONAR_URL..."
until curl -fsS "$SONAR_URL/api/system/status" 2>/dev/null | grep -q '"status":"UP"'; do sleep 5; done

# 1. Contraseña de admin: solo si sigue siendo la de fábrica
if curl -fsS -u admin:admin "$SONAR_URL/api/authentication/validate" | grep -q '"valid":true'; then
  curl -fsS -u admin:admin -X POST "$SONAR_URL/api/users/change_password" \
    -d login=admin -d previousPassword=admin --data-urlencode "password=$ADMIN_PASSWORD"
  echo "✔ Contraseña de admin cambiada"
fi
api() { curl -fsS -u "admin:$ADMIN_PASSWORD" "$@"; }

# 2. Quality gate del principio III. Sobre todo el código: 0 bugs, 0 vulnerabilidades, hotspots revisados,
#    calificación A en fiabilidad, seguridad y mantenibilidad, cobertura ≥ 80 % y duplicación ≤ 3 %.
#    Sobre el código nuevo: 0 incidencias nuevas de cualquier tipo, cobertura ≥ 80 %, duplicación ≤ 3 %
#    y hotspots revisados. Solo se añaden las condiciones que falten (SonarQube crea algunas de oficio)
if ! api "$SONAR_URL/api/qualitygates/show?name=$GATE" > /dev/null 2>&1; then
  api -X POST "$SONAR_URL/api/qualitygates/create" -d "name=$GATE" > /dev/null
  echo "✔ Quality gate $GATE creado"
fi
existing=$(api "$SONAR_URL/api/qualitygates/show?name=$GATE")
condition() {
  echo "$existing" | grep -q "\"metric\":\"$1\"" && return 0
  api -X POST "$SONAR_URL/api/qualitygates/create_condition" \
    -d "gateName=$GATE" -d "metric=$1" -d "op=$2" -d "error=$3" > /dev/null
  echo "✔ Condición $1 añadida"
}
condition bugs GT 0
condition vulnerabilities GT 0
condition security_hotspots_reviewed LT 100
condition reliability_rating GT 1
condition security_rating GT 1
condition sqale_rating GT 1
condition coverage LT 80
condition duplicated_lines_density GT 3
condition new_violations GT 0
condition new_coverage LT 80
condition new_duplicated_lines_density GT 3
condition new_security_hotspots_reviewed LT 100
api -X POST "$SONAR_URL/api/qualitygates/set_as_default" -d "name=$GATE"

# Migración: el antiguo proyecto único pasa a ser el de la rama dev, con su historial
if api "$SONAR_URL/api/projects/search?projects=$BASE_KEY" | grep -q "\"key\":\"$BASE_KEY\"" &&
  ! api "$SONAR_URL/api/projects/search?projects=$BASE_KEY-dev" | grep -q "\"key\":\"$BASE_KEY-dev\""; then
  api -X POST "$SONAR_URL/api/projects/update_key" -d "from=$BASE_KEY" -d "to=$BASE_KEY-dev"
  echo "✔ Proyecto $BASE_KEY renombrado a $BASE_KEY-dev"
fi

# 3. Token de análisis global (sirve para el proyecto de cualquier rama), guardado en .env.dev
#    (no versionado, principio IV). Un token de proyecto antiguo (sqp_) se sustituye
current=$(env_value SONAR_TOKEN)
case "$current" in
  sqa_*) ;;
  *)
    token=$(api -X POST "$SONAR_URL/api/user_tokens/generate" -d "name=$BASE_KEY-global-$(date +%s)" \
      -d type=GLOBAL_ANALYSIS_TOKEN | sed -E 's/.*"token":"([^"]+)".*/\1/')
    if grep -q '^SONAR_TOKEN=' .env.dev; then
      sed -i.bak "s/^SONAR_TOKEN=.*/SONAR_TOKEN=$token/" .env.dev && rm -f .env.dev.bak
    else
      printf '\nSONAR_TOKEN=%s\n' "$token" >> .env.dev
    fi
    echo "✔ Token de análisis global guardado en .env.dev"
    ;;
esac

echo "✔ SonarQube listo: $SONAR_URL/projects (un proyecto $BASE_KEY-<rama> por rama de git)"
