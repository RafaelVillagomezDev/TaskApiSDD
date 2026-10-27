#!/bin/sh
# Analiza el árbol de trabajo en el proyecto de SonarQube de la rama actual (taskapisdd-<rama>) y espera
# el quality gate: termina con error si no pasa. Lo usa .githooks/pre-push; también se puede lanzar a mano.
# El proyecto de una rama nueva se crea en su primer análisis y hereda el quality gate predeterminado.
set -eu
cd "$(dirname "$0")/.."

SONAR_URL=http://localhost:9000
BASE_KEY=taskapisdd
BRANCH=$(git rev-parse --abbrev-ref HEAD)
# Clave válida para SonarQube: feature/x → feature-x
SONAR_PROJECT_KEY="$BASE_KEY-$(echo "$BRANCH" | sed 's#[^A-Za-z0-9_.-]#-#g')"
SONAR_PROJECT_NAME="TaskApiSDD ($BRANCH)"

echo "▶ Proyecto de SonarQube: $SONAR_PROJECT_KEY ($SONAR_URL/dashboard?id=$SONAR_PROJECT_KEY)"
status=0
docker compose -f docker-compose.sonar.yml run --rm sonar-scanner \
  -Dsonar.projectBaseDir=/app -Dsonar.qualitygate.wait=true \
  "-Dsonar.projectKey=$SONAR_PROJECT_KEY" "-Dsonar.projectName=$SONAR_PROJECT_NAME" < /dev/null || status=$?

# Community Edition guarda cada proyecto en una sola rama: se le pone el nombre de la rama de git
admin_password=$(sed -n 's/^SONAR_ADMIN_PASSWORD=//p' .env.dev | tail -n 1)
curl -fsS -u "admin:$admin_password" -X POST "$SONAR_URL/api/project_branches/rename" \
  -d "project=$SONAR_PROJECT_KEY" -d "name=$BRANCH" > /dev/null 2>&1 ||
  echo "  (aviso: no se pudo poner el nombre $BRANCH a la rama del proyecto en SonarQube)" >&2

exit "$status"
