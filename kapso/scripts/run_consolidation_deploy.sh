#!/bin/bash
set -euo pipefail
export KAPSO_API_BASE_URL=https://api.kapso.ai
KAPSO_ROOT="/Users/diego/Documents/Sync/projects/lifedeportes/kapso"
SCRIPTS="$HOME/.agents/skills/automate-whatsapp/scripts"
LOG="$KAPSO_ROOT/deploy_consolidation.log"
WF="8995b14c-d852-4fb3-bceb-8a51a6ccc2c6"

{
  echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  cd "$KAPSO_ROOT"
  echo "--- patch script ---"
  node scripts/patch_history_agent_two_tools.js

  echo "--- update function card ---"
  node "$SCRIPTS/update-function.js" \
    --function-id 2fb9ca35-31f7-4b3a-84c7-8c03dc0a1775 \
    --name get-customer-card-scoped-odoo \
    --code-file "$KAPSO_ROOT/functions/get_customer_card_scoped_odoo.js"

  echo "--- deploy function card ---"
  node "$SCRIPTS/deploy-function.js" --function-id 2fb9ca35-31f7-4b3a-84c7-8c03dc0a1775

  echo "--- update function design refs ---"
  node "$SCRIPTS/update-function.js" \
    --function-id d889689a-c8bc-4183-a4ec-a793a5268b64 \
    --name get-customer-design-references-scoped-odoo \
    --code-file "$KAPSO_ROOT/functions/get_customer_design_references_scoped_odoo.js"

  echo "--- deploy function design refs ---"
  node "$SCRIPTS/deploy-function.js" --function-id d889689a-c8bc-4183-a4ec-a793a5268b64

  echo "--- get graph lock ---"
  node "$SCRIPTS/get-graph.js" "$WF" > /tmp/kapso_graph.json
  LOCK=$(node -e "const d=require('/tmp/kapso_graph.json'); const w=d.data?.workflow||d.workflow||{}; console.log(w.lock_version||d.data?.lock_version||'MISSING')")
  echo "LOCK_VERSION=$LOCK"

  echo "--- validate graph ---"
  node "$SCRIPTS/validate-graph.js" --definition-file "$KAPSO_ROOT/workflow_lifedeportes_sales_inbound_v8_session.json"

  echo "--- update graph ---"
  node "$SCRIPTS/update-graph.js" "$WF" \
    --expected-lock-version "$LOCK" \
    --definition-file "$KAPSO_ROOT/workflow_lifedeportes_sales_inbound_v8_session.json"

  echo "--- get graph after ---"
  node "$SCRIPTS/get-graph.js" "$WF" > /tmp/kapso_graph_after.json
  node -e "const d=require('/tmp/kapso_graph_after.json'); const w=d.data?.workflow||{}; console.log('NEW_LOCK', w.lock_version)"
  echo "DONE"
} 2>&1 | tee "$LOG"
