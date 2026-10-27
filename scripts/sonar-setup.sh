#!/bin/sh
# Prepara el SonarQube local (docker-compose.sonar.yml). Idempotente: se puede repetir sin efectos.
#   1. Cambia la contraseña por defecto de admin por SONAR_ADMIN_PASSWORD (.env.dev)
#   2. Crea el proyecto de sonar-project.properties
#   3. Crea el quality gate del principio III (CONSTITUTION.md) y lo asigna al proyecto
#   4. Si SONAR_TOKEN está vacío en .env.dev, genera un token de análisis y lo guarda allí
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
PROJECT_KEY=$(sed -n 's/^sonar.projectKey=//p' sonar-project.properties)

echo "Esperando a SonarQube en $SONAR_URL..."
until curl -fsS "$SONAR_URL/api/system/status" 2>/dev/null | grep -q '"status":"UP"'; do sleep 5; done

# 1. Contraseña de admin: solo si sigue siendo la de fábrica
if curl -fsS -u admin:admin "$SONAR_URL/api/authentication/validate" | grep -q '"valid":true'; then
  curl -fsS -u admin:admin -X POST "$SONAR_URL/api/users/change_password" \
    -d login=admin -d previousPassword=admin --data-urlencode "password=$ADMIN_PASSWORD"
  echo "✔ Contraseña de admin cambiada"
fi
api() { curl -fsS -u "admin:$ADMIN_PASSWORD" "$@"; }

# 2. Proyecto
if ! api "$SONAR_URL/api/projects/search?projects=$PROJECT_KEY" | grep -q "\"key\":\"$PROJECT_KEY\""; then
  api -X POST "$SONAR_URL/api/projects/create" -d "project=$PROJECT_KEY" -d name=TaskApiSDD > /dev/null
  echo "✔ Proyecto $PROJECT_KEY creado"
fi

# 3. Quality gate del principio III. Sobre todo el código: 0 bugs, 0 vulnerabilidades, hotspots revisados,
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
api -X POST "$SONAR_URL/api/qualitygates/select" -d "gateName=$GATE" -d "projectKey=$PROJECT_KEY"

# 4. Token de análisis del proyecto, guardado en .env.dev (no versionado, principio IV)
if [ -z "$(env_value SONAR_TOKEN)" ]; then
  token=$(api -X POST "$SONAR_URL/api/user_tokens/generate" -d "name=$PROJECT_KEY-$(date +%s)" \
    -d type=PROJECT_ANALYSIS_TOKEN -d "projectKey=$PROJECT_KEY" | sed -E 's/.*"token":"([^"]+)".*/\1/')
  if grep -q '^SONAR_TOKEN=' .env.dev; then
    sed -i.bak "s/^SONAR_TOKEN=.*/SONAR_TOKEN=$token/" .env.dev && rm -f .env.dev.bak
  else
    printf '\nSONAR_TOKEN=%s\n' "$token" >> .env.dev
  fi
  echo "✔ Token de análisis guardado en .env.dev"
fi

echo "✔ SonarQube listo: $SONAR_URL/dashboard?id=$PROJECT_KEY"
