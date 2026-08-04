#!/usr/bin/env node
/**
 * Patch v10: debounce cliente 30s antes del vendedor.
 *
 * route_customer_entry (new_customer)
 *   → wait_customer_burst (timeout 30s)
 *   → decide_route_customer_burst_resume
 *        user_input → wait (reinicia)
 *        timeout    → agent_orquestador
 *
 *   node kapso/scripts/patch_graph_v10_customer_burst.js
 *   node kapso/scripts/patch_graph_v10_customer_burst.js --function-id <uuid>
 */
const fs = require("fs");
const path = require("path");

const base = path.join(__dirname, "..");
const wfPath = path.join(base, "workflow_lifedeportes_sales_inbound_v10.json");
const regPath = path.join(base, "service_registry.json");

const WAIT = "wait_customer_burst_1745500002580";
const DECIDE = "decide_route_customer_burst_resume_1745500002585";
const ROUTE = "route_customer_entry_1745500002575";
const VENDOR = "agent_orquestador_1745500003000";

const EDGE_ROUTE_TO_WAIT = "e_customer_burst_from_route_new";
const EDGE_WAIT_TO_DECIDE = "e_customer_burst_wait_next";
const EDGE_DECIDE_REWAIT = "e_customer_burst_user_input";
const EDGE_DECIDE_VENDOR = "e_customer_burst_timeout";

const COND_USER = "c_customer_burst_user_input";
const COND_TIMEOUT = "c_customer_burst_timeout";

function resolveFunctionId(argv) {
  const idx = argv.indexOf("--function-id");
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  try {
    const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
    return (
      reg?.functions?.route_customer_burst_resume?.kapso_function_id ||
      reg?.customer_lane?.burst_function_id ||
      null
    );
  } catch {
    return null;
  }
}

const functionId = resolveFunctionId(process.argv.slice(2)) || "972d60bb-ff84-40fc-ba3d-cdd6104aa143";
const wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));

wf.nodes = (wf.nodes || []).filter((n) => n.id !== WAIT && n.id !== DECIDE);
wf.edges = (wf.edges || []).filter(
  (e) =>
    ![EDGE_ROUTE_TO_WAIT, EDGE_WAIT_TO_DECIDE, EDGE_DECIDE_REWAIT, EDGE_DECIDE_VENDOR].includes(e.id) &&
    !(e.source === ROUTE && e.label === "new_customer" && e.target === VENDOR)
);

wf.nodes.push(
  {
    id: WAIT,
    type: "flow-node",
    position: { x: 280, y: 280 },
    data: {
      node_type: "wait_for_response",
      config: {
        has_timeout: true,
        timeout_seconds: 30,
        save_response_to: "customer_burst_reply",
      },
      display_name: "Wait: customer burst 30s",
    },
  },
  {
    id: DECIDE,
    type: "flow-node",
    position: { x: 280, y: 400 },
    data: {
      node_type: "decide",
      config: {
        decision_type: "function",
        conditions: [
          {
            id: COND_USER,
            label: "user_input",
            description: "Llegó otro mensaje — reiniciar debounce",
          },
          {
            id: COND_TIMEOUT,
            label: "timeout",
            description: "30s de silencio — pasar a vendedor",
          },
        ],
        llm_configuration: {},
        function_id: functionId,
        function_name: "route-customer-burst-resume",
      },
      display_name: "Decision: customer burst resume",
    },
  }
);

wf.edges.push(
  {
    id: EDGE_ROUTE_TO_WAIT,
    source: ROUTE,
    target: WAIT,
    label: "new_customer",
    type: "default",
    flow_condition_id: "e388d011-2ab2-4dcb-b469-20e7bc57de54",
  },
  {
    id: EDGE_WAIT_TO_DECIDE,
    source: WAIT,
    target: DECIDE,
    label: "next",
    type: "default",
    flow_condition_id: null,
  },
  {
    id: EDGE_DECIDE_REWAIT,
    source: DECIDE,
    target: WAIT,
    label: "user_input",
    type: "default",
    flow_condition_id: COND_USER,
  },
  {
    id: EDGE_DECIDE_VENDOR,
    source: DECIDE,
    target: VENDOR,
    label: "timeout",
    type: "default",
    flow_condition_id: COND_TIMEOUT,
  }
);

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + "\n");

// registry
let reg = {};
try {
  reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
} catch {
  reg = {};
}
reg.functions = reg.functions || {};
reg.functions.route_customer_burst_resume = {
  kapso_function_name: "route-customer-burst-resume",
  kapso_function_id: functionId,
  local_path: "kapso/functions/route_customer_burst_resume.js",
};
if (reg.customer_lane) {
  const gn = new Set(reg.customer_lane.graph_functions || []);
  gn.add("route-customer-entry");
  gn.add("route-customer-burst-resume");
  reg.customer_lane.graph_functions = [...gn];
  reg.customer_lane.unchanged = false;
  reg.customer_lane.burst_debounce_seconds = 30;
}
fs.writeFileSync(regPath, JSON.stringify(reg, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      ok: true,
      wait: WAIT,
      decide: DECIDE,
      function_id: functionId,
      edges: [EDGE_ROUTE_TO_WAIT, EDGE_WAIT_TO_DECIDE, EDGE_DECIDE_REWAIT, EDGE_DECIDE_VENDOR],
    },
    null,
    2
  )
);
