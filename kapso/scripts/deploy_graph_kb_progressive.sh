#!/usr/bin/env bash
# Deploy progresivo: pull lock → embed KB/prompts → validate → push
# Uso: kapso/scripts/deploy_graph_kb_progressive.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WF_ID="8995b14c-d852-4fb3-bceb-8a51a6ccc2c6"
KAPSO_SCRIPTS="$(cd "$ROOT/.." && pwd)/.agents/skills/automate-whatsapp/scripts"
DEF="$ROOT/workflow_lifedeportes_sales_inbound_v10.json"
LOCK_FILE="/tmp/kapso_lock_version.txt"

cd "$ROOT"
if [[ -f ../.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source ../.env
  set +a
fi

echo "=== 1. Pull graph (lock + topología remota) ==="
node "$KAPSO_SCRIPTS/get-graph.js" "$WF_ID" > /tmp/kapso_graph_pull.json
node -e "
const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('/tmp/kapso_graph_pull.json', 'utf8'));
const data = raw.data || raw;
const def = data.definition;
const lock = data.workflow?.lock_version;
if (!def?.nodes) throw new Error('definition missing');
fs.writeFileSync('$DEF', JSON.stringify(def, null, 2) + '\n');
fs.writeFileSync('$LOCK_FILE', String(lock));
console.log('lock_version', lock, 'nodes', def.nodes.length, 'edges', def.edges.length);
"

echo "=== 2. Embed prompts + KB (vendedor v5, histórico KB, staff reglas) ==="
node scripts/embed_agent_knowledge.js --agent vendedor
node scripts/embed_agent_knowledge.js --agent staff

echo "=== 3. Tests KB ==="
node tests/run_agent_knowledge_tests.js
node tests/run_business_hours_tests.js

echo "=== 4. Validate (graph-guard) ==="
node scripts/validate-graph-lifedeportes.js "$DEF"

LOCK=$(cat "$LOCK_FILE")
echo "=== 5. Push graph lock_version=$LOCK ==="
node "$KAPSO_SCRIPTS/update-graph.js" "$WF_ID" \
  --expected-lock-version "$LOCK" \
  --definition-file "$DEF"

echo "=== 6. Confirm ==="
node "$KAPSO_SCRIPTS/get-graph.js" "$WF_ID" | node -e "
const chunks=[]; process.stdin.on('data',d=>chunks.push(d));
process.stdin.on('end',()=>{
  const j=JSON.parse(Buffer.concat(chunks).toString());
  const w=(j.data||j).workflow;
  console.log('deployed lock_version', w?.lock_version, 'updated_at', w?.updated_at);
});
"
echo "DONE"
