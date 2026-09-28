#!/usr/bin/env bash
# RETIRADO 2026-09-16 — nómina/compra staff fuera del carril Kapso (Hermes local).
# Resucitaría detect-staff-lane / route-staff-lane / parse-nomina-attlog / confirmar-nomina.
echo "RETIRADO: deploy_nomina_lane.sh ya no aplica (staff = Hermes local)." >&2
exit 1
# Deploy carril nómina staff: functions → patch grafo v10 → validate → push
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WF_ID="8995b14c-d852-4fb3-bceb-8a51a6ccc2c6"
KAPSO_SCRIPTS="$(cd "$ROOT/../.." && pwd)/.agents/skills/automate-whatsapp/scripts"
IDS="$ROOT/docs/nomina_function_ids.json"
LOCK_FILE="/tmp/kapso_lock_version.txt"

# IDs conocidos (Kapso prod) — upsert actualiza si ya existen
KNOWN_detect_staff_lane="b6e4935f-cbf7-48f7-9483-729a2294ec14"
KNOWN_register_nomina_stub="481fa039-0368-4983-bf44-6839cc29da42"

cd "$ROOT"
if [[ -f ../.env ]]; then set -a; source ../.env; set +a; fi

upsert_fn() {
  local name="$1"
  local file="$2"
  local known_id="${3:-}"
  node "$ROOT/scripts/upsert_kapso_function.js" \
    --name "$name" \
    --code-file "$file" \
    ${known_id:+--function-id "$known_id"}
}

deploy_fn() {
  local key="$1" name="$2" file="$3" known_id="${4:-}"
  local id
  id="$(upsert_fn "$name" "$file" "$known_id")"
  node -e "
    const fs=require('fs');
    const p='$IDS';
    const raw=fs.existsSync(p)?fs.readFileSync(p,'utf8').trim():'';
    const o=raw?JSON.parse(raw):{};
    o['$key']='$id';
    fs.writeFileSync(p, JSON.stringify(o,null,2)+'\n');
  "
  node "$KAPSO_SCRIPTS/deploy-function.js" --function-id "$id"
  echo "$name -> $id"
}

echo "=== 1. Pull graph lock ==="
node "$KAPSO_SCRIPTS/get-graph.js" "$WF_ID" > /tmp/kapso_graph_pull.json
node -e "
const fs=require('fs');
const raw=JSON.parse(fs.readFileSync('/tmp/kapso_graph_pull.json','utf8'));
const data=raw.data||raw;
fs.writeFileSync('$ROOT/workflow_lifedeportes_sales_inbound_v10.json', JSON.stringify(data.definition,null,2)+'\n');
fs.writeFileSync('$LOCK_FILE', String(data.workflow.lock_version));
console.log('lock', data.workflow.lock_version);
"

echo "=== 2. Bundle parse nomina ==="
node scripts/bundle_parse_nomina_attlog.js

echo "=== 3. Deploy functions ==="
echo '{}' > "$IDS"
deploy_fn detect_staff_lane detect-staff-lane functions/detect_staff_lane.js "$KNOWN_detect_staff_lane"
deploy_fn route_staff_lane route-staff-lane functions/route_staff_lane.js
deploy_fn validate_nomina_confirm validate-nomina-confirm functions/validate_nomina_confirm.js
deploy_fn route_nomina_confirm route-nomina-confirm functions/route_nomina_confirm.js
deploy_fn parse_nomina_attlog parse-nomina-attlog functions/parse_nomina_attlog_deploy.js
deploy_fn register_nomina_stub register-nomina-stub functions/register_nomina_stub.js "$KNOWN_register_nomina_stub"

echo "=== 4. Patch graph ==="
node scripts/build_graph_v10_nomina.js
node scripts/embed_agent_knowledge.js --agent staff

echo "=== 5. Validate ==="
node tests/run_parse_nomina_attlog_tests.js
node scripts/validate-graph-lifedeportes.js "$ROOT/workflow_lifedeportes_sales_inbound_v10.json"

LOCK=$(cat "$LOCK_FILE")
echo "=== 6. Push lock=$LOCK ==="
node "$KAPSO_SCRIPTS/update-graph.js" "$WF_ID" \
  --expected-lock-version "$LOCK" \
  --definition-file "$ROOT/workflow_lifedeportes_sales_inbound_v10.json"

echo "DONE nomina lane"
