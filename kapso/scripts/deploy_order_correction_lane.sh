#!/usr/bin/env bash
# Deploy tools corrección pedido staff + patch grafo v10
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WF_ID="8995b14c-d852-4fb3-bceb-8a51a6ccc2c6"
KAPSO_SCRIPTS="$(cd "$ROOT/../.." && pwd)/.agents/skills/automate-whatsapp/scripts"
IDS="$ROOT/docs/order_detail_function_ids.json"
LOCK_FILE="/tmp/kapso_lock_version_order_correction.txt"

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
    const raw=fs.existsSync(p)?fs.readFileSync(p,'utf8').trim():'{}';
    const o=JSON.parse(raw);
    o['$key']='$id';
    fs.writeFileSync(p, JSON.stringify(o,null,2)+'\n');
  "
  node "$KAPSO_SCRIPTS/deploy-function.js" --function-id "$id"
  echo "Waiting deploy $name ($id)..."
  node -e "
    const { kapsoConfigFromEnv, kapsoRequest } = require('$KAPSO_SCRIPTS/lib/functions/kapso-api.js');
    const cfg = kapsoConfigFromEnv();
    const id='$id';
    (async () => {
      for (let i=0;i<25;i++) {
        const d = await kapsoRequest(cfg, '/platform/v1/functions/' + id);
        const st = d?.data?.status;
        if (st === 'deployed' || st === 'active') { console.log('deployed', st); return; }
        if (st === 'error') throw new Error('deploy error on ' + id);
        await new Promise(r=>setTimeout(r,3000));
      }
      throw new Error('deploy timeout ' + id);
    })().catch(e=>{ console.error(e.message); process.exit(1); });
  "
  echo "$name -> $id"
}

echo "=== 1. Tests ==="
node tests/run_order_correction_tests.js

echo "=== 2. Bundle ==="
node scripts/bundle_order_correction_tools.js

echo "=== 3. Pull graph lock ==="
node "$KAPSO_SCRIPTS/get-graph.js" "$WF_ID" > /tmp/kapso_graph_pull_corr.json
node -e "
const fs=require('fs');
const raw=JSON.parse(fs.readFileSync('/tmp/kapso_graph_pull_corr.json','utf8'));
const data=raw.data||raw;
fs.writeFileSync('$ROOT/workflow_lifedeportes_sales_inbound_v10.json', JSON.stringify(data.definition,null,2)+'\n');
fs.writeFileSync('$LOCK_FILE', String(data.workflow.lock_version));
console.log('lock', data.workflow.lock_version);
"

KNOWN_buscar="$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$IDS','utf8')).buscar_pedido_odoo||'')}catch(e){console.log('')}")"
KNOWN_corregir="$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$IDS','utf8')).corregir_pedido_odoo||'')}catch(e){console.log('')}")"

echo "=== 4. Deploy functions ==="
deploy_fn buscar_pedido_odoo buscar-pedido-odoo functions/search_staff_order_deploy.js "$KNOWN_buscar"
deploy_fn corregir_pedido_odoo corregir-pedido-odoo functions/apply_staff_order_correction_deploy.js "$KNOWN_corregir"

echo "=== 4b. Sync Odoo secrets (prod) ==="
node "$ROOT/scripts/sync_odoo_secrets_to_kapso.js" --target prod

echo "=== 5. Patch graph (lista + corrección + prompt v8) ==="
node scripts/build_graph_v10_order_detail.js
node scripts/embed_agent_knowledge.js --agent staff

echo "=== 6. Validate ==="
node scripts/validate-graph-lifedeportes.js "$ROOT/workflow_lifedeportes_sales_inbound_v10.json"

LOCK=$(cat "$LOCK_FILE")
echo "=== 7. Push lock=$LOCK ==="
node "$KAPSO_SCRIPTS/update-graph.js" "$WF_ID" \
  --expected-lock-version "$LOCK" \
  --definition-file "$ROOT/workflow_lifedeportes_sales_inbound_v10.json"

echo "DONE order correction — IDs en $IDS"
