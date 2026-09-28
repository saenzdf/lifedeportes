#!/usr/bin/env node
/**
 * Añade edge `end` (prefill/spam timeout) → nodo hoja fn_end_quiet_customer.
 *
 *   node kapso/scripts/patch_graph_end_quiet_ads.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DEF = path.join(ROOT, "workflow_lifedeportes_sales_inbound_v10.json");
const REGISTRY = path.join(ROOT, "service_registry.json");
const DECIDE = "decide_route_customer_burst_resume_1745500002585";
const END_NODE = "fn_end_quiet_customer_1745500002588";
const END_LABEL = "end";

const def = JSON.parse(fs.readFileSync(DEF, "utf8"));
const nodes = def.nodes || def.definition?.nodes;
const edges = def.edges || def.definition?.edges;
if (!nodes || !edges) {
  console.error("no nodes/edges");
  process.exit(1);
}

const reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
const fnId =
  reg?.functions?.end_quiet_customer?.kapso_function_id ||
  process.env.LIFE_END_QUIET_FUNCTION_ID;
if (!fnId) {
  console.error("missing end_quiet_customer function id — create+register first");
  process.exit(1);
}

const decide = nodes.find((n) => n.id === DECIDE);
if (!decide) {
  console.error("decide node missing");
  process.exit(1);
}
const conditions = decide.data?.config?.conditions || [];
if (!conditions.some((c) => c.label === END_LABEL)) {
  conditions.push({
    label: END_LABEL,
    description: "Prefill Ads / spam en timeout — terminar en silencio (sin loop wait)",
  });
}

if (!nodes.some((n) => n.id === END_NODE)) {
  nodes.push({
    id: END_NODE,
    type: "flow-node",
    position: { x: -120, y: 320 },
    data: {
      node_type: "function",
      config: {
        function_id: fnId,
        function_name: "end-quiet-customer",
        save_response_to: null,
      },
      display_name: "Function: end-quiet-customer",
    },
  });
} else {
  const n = nodes.find((x) => x.id === END_NODE);
  if (n?.data?.config) n.data.config.function_id = fnId;
}

if (!edges.some((e) => e.source === DECIDE && e.label === END_LABEL)) {
  edges.push({
    source: DECIDE,
    target: END_NODE,
    label: END_LABEL,
    type: "default",
    flow_condition_id: null,
  });
}

const out = def.nodes ? def : { ...def, definition: { ...(def.definition || {}), nodes, edges } };
fs.writeFileSync(DEF, JSON.stringify(out, null, 2) + "\n");
console.log("patched", END_NODE, "fn", fnId, "nodes", nodes.length, "edges", edges.length);
