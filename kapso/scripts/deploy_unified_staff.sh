#!/usr/bin/env bash
# Deploy Agent Staff unificado: nómina + compra tools, sin agente inbox.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIFE_ROOT="$(cd "$ROOT/.." && pwd)"
WF_ID="8995b14c-d852-4fb3-bceb-8a51a6ccc2c6"
KAPSO_SCRIPTS="$LIFE_ROOT/.agents/skills/automate-whatsapp/scripts"
IDS="$ROOT/docs/unified_staff_function_ids.json"
LOCK_FILE="/tmp/kapso_lock_version.txt"

KNOWN_parse_nomina_attlog="7c490919-ceb7-48a4-b267-abbf57ff33ab"
KNOWN_prepare_inbox="d750cbd5-b8a5-4eb8-b6d4-62e0e7fd8058"
KNOWN_fidelity="37be9c66-e600-4d40-af99-81003ef7fb39"

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

echo "=== 0. Sync employee codes + bundle attlog ==="
node scripts/sync_nomina_employee_codes.js
node scripts/bundle_parse_nomina_attlog.js
node tests/run_parse_nomina_attlog_tests.js

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

echo "=== 2. Deploy functions ==="
echo '{}' > "$IDS"
# Seed known IDs for prepare/fidelity so patch can run even if upsert uses them
node -e "
const fs=require('fs');
fs.writeFileSync('$IDS', JSON.stringify({
  prepare_inbox_upload: '$KNOWN_prepare_inbox',
  compute_fidelity_retention: '$KNOWN_fidelity'
},null,2)+'\n');
"

deploy_fn parse_nomina_attlog parse-nomina-attlog functions/parse_nomina_attlog_deploy.js "$KNOWN_parse_nomina_attlog"
deploy_fn confirmar_nomina confirmar-nomina functions/confirmar_nomina.js
deploy_fn crear_compra_odoo crear-compra-odoo functions/crear_compra_odoo.js
deploy_fn prepare_inbox_upload prepare-inbox-upload functions/prepare_inbox_upload.js "$KNOWN_prepare_inbox"
deploy_fn compute_fidelity_retention compute-fidelity-retention functions/compute_fidelity_retention.js "$KNOWN_fidelity"
deploy_fn detect_staff_lane detect-staff-lane functions/detect_staff_lane.js "b6e4935f-cbf7-48f7-9483-729a2294ec14"

echo "=== 3. Remove inbox agent + embed staff (tools unificadas) ==="
node scripts/patch_graph_v10_unified_staff.js
node scripts/embed_agent_knowledge.js --agent staff

echo "=== 4. Validate ==="
node scripts/validate-graph-lifedeportes.js "$ROOT/workflow_lifedeportes_sales_inbound_v10.json"

LOCK=$(cat "$LOCK_FILE")
echo "=== 5. Push lock=$LOCK ==="
node "$KAPSO_SCRIPTS/update-graph.js" "$WF_ID" \
  --expected-lock-version "$LOCK" \
  --definition-file "$ROOT/workflow_lifedeportes_sales_inbound_v10.json"

echo "=== Done ==="
node "$KAPSO_SCRIPTS/get-graph.js" "$WF_ID" | node -e "
const fs=require('fs'); let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{
  const j=JSON.parse(s); const d=j.data||j;
  console.log('new lock', d.workflow.lock_version);
  const def=d.definition; const agent=def.nodes.find(n=>n.id==='agent_1780762885818');
  console.log('staff tools', (agent?.data?.config?.flow_agent_function_tools||[]).map(t=>t.name).join(', '));
  console.log('inbox agent present', def.nodes.some(n=>n.id==='agent_inbox_ingreso_1752240100000'));
});
"
