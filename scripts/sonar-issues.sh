#!/bin/sh
# Muestra por qué no pasa el quality gate del proyecto de SonarQube de la rama actual (taskapisdd-<rama>):
# sus condiciones, las incidencias abiertas y los hotspots por revisar, con fichero y línea. Lo usa
# .githooks/pre-push cuando el gate falla; también se puede lanzar a mano tras ./scripts/sonar-scan.sh.
# Usa la cuenta de administrador de .env.dev: el token de análisis (SONAR_TOKEN) no puede leer hotspots ni
# métricas. Nunca imprime las credenciales. El JSON se formatea con node en el contenedor api, para no
# instalar nada en el host (principio I)
set -eu
cd "$(dirname "$0")/.."

SONAR_URL=http://localhost:9000
BASE_KEY=taskapisdd
BRANCH=$(git rev-parse --abbrev-ref HEAD)
# Misma clave que sonar-scan.sh: feature/x → feature-x
SONAR_PROJECT_KEY="$BASE_KEY-$(echo "$BRANCH" | sed 's#[^A-Za-z0-9_.-]#-#g')"
# Tope de resultados por consulta; de sobra para un análisis que debería tener cero
PAGE_SIZE=500

admin_password=$(sed -n 's/^SONAR_ADMIN_PASSWORD=//p' .env.dev | tail -n 1)
if [ -z "$admin_password" ]; then
  echo "✖ Falta SONAR_ADMIN_PASSWORD en .env.dev (ver ./scripts/sonar-setup.sh)" >&2
  exit 1
fi

api() {
  curl -fsS -u "admin:$admin_password" "$SONAR_URL$1"
}

# Convierte la respuesta JSON de la API en líneas legibles; el primer argumento elige el formato
format() {
  docker compose -f docker-compose.dev.yml exec -T api node -e '
    const kind = process.argv[1];
    let raw = "";
    process.stdin.on("data", (chunk) => (raw += chunk));
    process.stdin.on("end", () => {
      const data = JSON.parse(raw);
      const where = (item) => `${item.component.split(":").slice(1).join(":")}:${item.line ?? "-"}`;
      if (kind === "gate") {
        console.log(`Quality gate: ${data.projectStatus.status}`);
        for (const c of data.projectStatus.conditions) {
          const mark = c.status === "OK" ? " " : "✖";
          const failsIf = c.comparator === "GT" ? ">" : "<";
          console.log(`  ${mark} ${c.metricKey}: ${c.actualValue ?? "-"} (falla si ${failsIf} ${c.errorThreshold})`);
        }
      } else if (kind === "issues") {
        console.log(`Incidencias abiertas: ${data.paging.total}`);
        for (const i of data.issues) console.log(`  ${where(i)}  ${i.rule}  [${i.severity}]  ${i.message}`);
      } else {
        console.log(`Hotspots por revisar: ${data.paging.total}`);
        for (const h of data.hotspots) console.log(`  ${where(h)}  ${h.ruleKey}  [${h.vulnerabilityProbability}]  ${h.message}`);
      }
    });
  ' "$1"
}

echo "▶ Proyecto de SonarQube: $SONAR_PROJECT_KEY ($SONAR_URL/dashboard?id=$SONAR_PROJECT_KEY)"
api "/api/qualitygates/project_status?projectKey=$SONAR_PROJECT_KEY" | format gate
api "/api/issues/search?componentKeys=$SONAR_PROJECT_KEY&resolved=false&ps=$PAGE_SIZE" | format issues
api "/api/hotspots/search?projectKey=$SONAR_PROJECT_KEY&status=TO_REVIEW&ps=$PAGE_SIZE" | format hotspots
