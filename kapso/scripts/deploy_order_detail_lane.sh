#!/usr/bin/env bash
# Deploy tools lista pedido staff + patch grafo v10 + odoo-create-lead-and-so
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WF_ID="8995b14c-d852-4fb3-bceb-8a51a6ccc2c6"
KAPSO_SCRIPTS="$(cd "$ROOT/../.." && pwd)/.agents/skills/automate-whatsapp/scripts"
IDS="$ROOT/docs/order_detail_function_ids.json"
LOCK_FILE="/tmp/kapso_lock_version_order_detail.txt"
KNOWN_odoo_create="8a7b731d-480c-4abc-8a72-f965856d7515"

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

echo "=== 1. Tests locales ==="
node tests/run_order_detail_tools_tests.js

echo "=== 2. Bundle tools ==="
node scripts/bundle_order_detail_tools.js

echo "=== 3. Pull graph lock ==="
node "$KAPSO_SCRIPTS/get-graph.js" "$WF_ID" > /tmp/kapso_graph_pull_od.json
node -e "
const fs=require('fs');
const raw=JSON.parse(fs.readFileSync('/tmp/kapso_graph_pull_od.json','utf8'));
const data=raw.data||raw;
fs.writeFileSync('$ROOT/workflow_lifedeportes_sales_inbound_v10.json', JSON.stringify(data.definition,null,2)+'\n');
fs.writeFileSync('$LOCK_FILE', String(data.workflow.lock_version));
console.log('lock', data.workflow.lock_version);
"

echo "=== 4. Deploy functions ==="
echo '{}' > "$IDS"
deploy_fn clasificar_adjuntos_pedido clasificar-adjuntos-pedido functions/classify_order_attachments_deploy.js
deploy_fn parsear_lista_excel_pedido parsear-lista-excel-pedido functions/parse_order_detail_excel_deploy.js
deploy_fn parsear_lista_texto_pedido parsear-lista-texto-pedido functions/parse_order_detail_text_deploy.js
deploy_fn parsear_lista_imagen_pedido parsear-lista-imagen-pedido functions/parse_order_detail_image_deploy.js
deploy_fn parsear_lista_pdf_pedido parsear-lista-pdf-pedido functions/parse_order_detail_pdf_deploy.js
deploy_fn registrar_adjuntos_pedido registrar-adjuntos-pedido functions/register_order_attachments_deploy.js
deploy_fn fusionar_borrador_lista fusionar-borrador-lista functions/merge_order_detail_draft_deploy.js
deploy_fn odoo_create_lead_and_so odoo-create-lead-and-so functions/odoo_create_lead_and_so.js "$KNOWN_odoo_create"

echo "=== 5. Patch graph ==="
node scripts/build_graph_v10_order_detail.js

echo "=== 6. Validate ==="
node scripts/validate-graph-lifedeportes.js "$ROOT/workflow_lifedeportes_sales_inbound_v10.json"

LOCK=$(cat "$LOCK_FILE")
echo "=== 7. Push lock=$LOCK ==="
node "$KAPSO_SCRIPTS/update-graph.js" "$WF_ID" \
  --expected-lock-version "$LOCK" \
  --definition-file "$ROOT/workflow_lifedeportes_sales_inbound_v10.json"

echo "DONE order detail tools — IDs en $IDS"
