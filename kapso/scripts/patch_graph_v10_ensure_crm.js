#!/usr/bin/env node
/**
 * Patch v10: tras debounce cliente, seed CRM determinista antes del vendedor.
 *
 * decide_route_customer_burst_resume
 *   timeout → fn_ensure_crm_from_quote → agent_orquestador
 *
 *   node kapso/scripts/patch_graph_v10_ensure_crm.js
 *   node kapso/scripts/patch_graph_v10_ensure_crm.js --function-id <uuid>
 */
const fs = require("fs");
const path = require("path");

const base = path.join(__dirname, "..");
const wfPath = path.join(base, "workflow_lifedeportes_sales_inbound_v10.json");
const regPath = path.join(base, "service_registry.json");

const DECIDE = "decide_route_customer_burst_resume_1745500002585";
const ENSURE = "fn_ensure_crm_from_quote_1745500002590";
const VENDOR = "agent_orquestador_1745500003000";

const EDGE_DECIDE_VENDOR = "e_customer_burst_timeout";
const EDGE_DECIDE_ENSURE = "e_customer_burst_timeout_ensure";
const EDGE_ENSURE_VENDOR = "e_ensure_crm_to_vendor";

function resolveFunctionId(argv) {
  const idx = argv.indexOf("--function-id");
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  try {
    const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
    return (
      reg?.functions?.ensure_crm_from_quote?.kapso_function_id ||
      reg?.customer_lane?.ensure_crm_function_id ||
      null
    );
  } catch {
    return null;
  }
}

const functionId = resolveFunctionId(process.argv.slice(2));
if (!functionId) {
  console.error("Missing ensure-crm function id. Deploy first or pass --function-id");
  process.exit(1);
}

const wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));

wf.nodes = (wf.nodes || []).filter((n) => n.id !== ENSURE);
wf.edges = (wf.edges || []).filter(
  (e) =>
    ![EDGE_DECIDE_ENSURE, EDGE_ENSURE_VENDOR].includes(e.id) &&
    !(e.id === EDGE_DECIDE_VENDOR && e.target === VENDOR) &&
    !(e.source === DECIDE && e.label === "timeout" && e.target === VENDOR)
);

wf.nodes.push({
  id: ENSURE,
  type: "flow-node",
  position: { x: 280, y: 520 },
  data: {
    node_type: "function",
    config: {
      function_id: functionId,
      function_name: "ensure-crm-from-quote",
      save_response_to: null,
    },
    display_name: "Function: ensure-crm-from-quote",
  },
});

wf.edges.push(
  {
    id: EDGE_DECIDE_ENSURE,
    source: DECIDE,
    target: ENSURE,
    label: "timeout",
  },
  {
    id: EDGE_ENSURE_VENDOR,
    source: ENSURE,
    target: VENDOR,
    label: "next",
  }
);

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      ok: true,
      ensure_node: ENSURE,
      function_id: functionId,
      path: `${DECIDE} -[timeout]-> ${ENSURE} -[next]-> ${VENDOR}`,
    },
    null,
    2
  )
);
