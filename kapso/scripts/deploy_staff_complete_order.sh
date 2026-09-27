#!/usr/bin/env bash
# RETIRADO 2026-09-16 — cadena de subida del staff movida a Hermes local.
# Resucitaría validate-staff-write / compile-staff-order-draft y re-cablearía el grafo.
echo "RETIRADO: deploy_staff_complete_order.sh ya no aplica (staff = Hermes local)." >&2
exit 1
# Publica Functions del carril staff pedidos completos + spreadsheet.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KAPSO_SCRIPTS="$(cd "$ROOT/.." && pwd)/.agents/skills/automate-whatsapp/scripts"
# Fallback Sync monorepo root skills
if [[ ! -d "$KAPSO_SCRIPTS" ]]; then
  KAPSO_SCRIPTS="$(cd "$ROOT/../.." && pwd)/.agents/skills/automate-whatsapp/scripts"
fi
REG="$ROOT/service_registry.json"
IDS="$ROOT/docs/order_detail_function_ids.json"

cd "$ROOT"
if [[ -f ../.env ]]; then set -a; source ../.env; set +a; fi

id_from_reg() {
  node -e "const r=require('./service_registry.json'); console.log($1||'')"
}

upsert_deploy() {
  local name="$1"
  local file="$2"
  local known_id="${3:-}"
  local id
  echo ""
  echo "=== $name ==="
  id="$(node "$ROOT/scripts/upsert_kapso_function.js" \
    --name "$name" \
    --code-file "$file" \
    ${known_id:+--function-id "$known_id"})"
  echo "upserted id=$id"
  node "$KAPSO_SCRIPTS/deploy-function.js" --function-id "$id" >/dev/null
  node -e "
    const { kapsoConfigFromEnv, kapsoRequest } = require('$KAPSO_SCRIPTS/lib/functions/kapso-api.js');
    const cfg = kapsoConfigFromEnv();
    const id='$id';
    (async () => {
      for (let i=0;i<36;i++) {
        const d = await kapsoRequest(cfg, '/platform/v1/functions/' + id);
        const st = d?.data?.status || d?.status;
        if (i % 3 === 0) console.log('  status', st);
        if (st === 'deployed' || st === 'active') { console.log('  DEPLOYED'); return; }
        if (st === 'error' || st === 'failed') throw new Error('deploy failed: ' + st);
        await new Promise(r=>setTimeout(r,2500));
      }
      throw new Error('deploy timeout ' + id);
    })().catch(e=>{ console.error(e.message); process.exit(1); });
  "
  LAST_FN_ID="$id"
}

echo "=== 1. Tests ==="
node tests/run_staff_function_tests.js
node tests/run_staff_complete_order_tests.js

echo "=== 2. Bundles ==="
node scripts/bundle_order_correction_tools.js
node scripts/bundle_staff_complete_order.js

VALIDATE_ID="$(id_from_reg 'r.staff_write.validate_staff_write.kapso_function_id')"
ROUTE_ID="$(id_from_reg 'r.staff_write.route_staff_write.kapso_function_id')"
BUILD_ID="$(id_from_reg 'r.staff_write.build_quote_payload.kapso_function_id')"
ODOO_ID="$(id_from_reg 'r.staff_write.odoo_create_lead_and_so.kapso_function_id')"
BUSCAR_ID="$(id_from_reg 'r.staff_write.buscar_pedido_odoo.kapso_function_id')"
CORREGIR_ID="$(id_from_reg 'r.staff_write.corregir_pedido_odoo.kapso_function_id')"
COMPILE_KNOWN="$(id_from_reg 'r.staff_write.compile_staff_order_draft.kapso_function_id')"
SYNC_KNOWN="$(id_from_reg 'r.staff_write.sync_order_draft_from_odoo.kapso_function_id')"

echo "=== 3. Deploy write path ==="
upsert_deploy validate-staff-write functions/validate_staff_write.js "$VALIDATE_ID"
upsert_deploy route-staff-write functions/route_staff_write.js "$ROUTE_ID"
upsert_deploy build-quote-payload functions/build_quote_payload.js "$BUILD_ID"
upsert_deploy odoo-create-lead-and-so functions/odoo_create_lead_and_so.js "$ODOO_ID"

echo "=== 4. Deploy correction ==="
upsert_deploy buscar-pedido-odoo functions/search_staff_order_deploy.js "$BUSCAR_ID"
upsert_deploy corregir-pedido-odoo functions/apply_staff_order_correction_deploy.js "$CORREGIR_ID"

echo "=== 5. Deploy compile + sync ==="
upsert_deploy compile-staff-order-draft functions/compile_staff_order_draft_deploy.js "${COMPILE_KNOWN:-}"
COMPILE_ID="$LAST_FN_ID"
upsert_deploy sync-order-draft-from-odoo functions/sync_order_draft_from_odoo_deploy.js "${SYNC_KNOWN:-}"
SYNC_ID="$LAST_FN_ID"

node -e "
const fs=require('fs');
const reg=JSON.parse(fs.readFileSync('$REG','utf8'));
reg.staff_write.compile_staff_order_draft.kapso_function_id='$COMPILE_ID';
delete reg.staff_write.compile_staff_order_draft.deploy_pending;
reg.staff_write.sync_order_draft_from_odoo.kapso_function_id='$SYNC_ID';
delete reg.staff_write.sync_order_draft_from_odoo.deploy_pending;
reg.staff_write.compile_staff_order_draft.bundle='kapso/functions/compile_staff_order_draft_deploy.js';
reg.staff_write.sync_order_draft_from_odoo.bundle='kapso/functions/sync_order_draft_from_odoo_deploy.js';
fs.writeFileSync('$REG', JSON.stringify(reg,null,2)+'\n');
const ids=fs.existsSync('$IDS')?JSON.parse(fs.readFileSync('$IDS','utf8')):{};
ids.compile_staff_order_draft='$COMPILE_ID';
ids.sync_order_draft_from_odoo='$SYNC_ID';
fs.writeFileSync('$IDS', JSON.stringify(ids,null,2)+'\n');
console.log('registry + ids updated');
console.log('compile', '$COMPILE_ID');
console.log('sync', '$SYNC_ID');
"

echo "=== 6. Sync Odoo secrets (prod) ==="
node "$ROOT/scripts/sync_odoo_secrets_to_kapso.js" --target prod || echo "(secrets sync warning — check manually)"

echo ""
echo "DONE — functions published"
echo "  compile-staff-order-draft = $COMPILE_ID"
echo "  sync-order-draft-from-odoo = $SYNC_ID"
