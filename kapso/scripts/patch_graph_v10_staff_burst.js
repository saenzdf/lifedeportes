#!/usr/bin/env node
/**
 * Patch v10: debounce staff 15s antes del Agent Staff.
 *
 * route_user_entry [staff] → wait_staff_burst (15s)
 * staff_lane_resume [staff_lane_agent] → wait_staff_burst
 *   → decide_route_staff_burst_resume
 *        user_input → wait (reinicia)
 *        timeout    → agent_1780762885818
 *
 *   node kapso/scripts/patch_graph_v10_staff_burst.js
 *   node kapso/scripts/patch_graph_v10_staff_burst.js --function-id <uuid>
 */
const fs = require("fs");
const path = require("path");

const base = path.join(__dirname, "..");
const wfPath = path.join(base, "workflow_lifedeportes_sales_inbound_v10.json");
const regPath = path.join(base, "service_registry.json");

const WAIT = "wait_staff_burst_1745500019200";
const DECIDE = "decide_route_staff_burst_resume_1745500019210";
const ROUTE_ENTRY = "decide_route_user_entry_1745500002450";
const LANE_RESUME = "decide_route_staff_lane_resume_1745500019060";
const AGENT = "agent_1780762885818";

const EDGE_ENTRY_TO_WAIT = "e_staff_burst_from_entry";
const EDGE_RESUME_TO_WAIT = "e_staff_burst_from_lane_agent";
const EDGE_WAIT_TO_DECIDE = "e_staff_burst_wait_next";
const EDGE_DECIDE_REWAIT = "e_staff_burst_user_input";
const EDGE_DECIDE_AGENT = "e_staff_burst_timeout";

const COND_USER = "c_staff_burst_user_input";
const COND_TIMEOUT = "c_staff_burst_timeout";

const BURST_SECONDS = 15;

function resolveFunctionId(argv) {
  const idx = argv.indexOf("--function-id");
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  try {
    const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
    return reg?.functions?.route_staff_burst_resume?.kapso_function_id || null;
  } catch {
    return null;
  }
}

const functionId = resolveFunctionId(process.argv.slice(2));
if (!functionId) {
  console.error("Missing function id. Upsert route-staff-burst-resume first, or pass --function-id");
  process.exit(1);
}

const wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));

const prevStaffEdge = (wf.edges || []).find((e) => e.source === ROUTE_ENTRY && e.label === "staff");
const prevLaneAgentEdge = (wf.edges || []).find(
  (e) => e.source === LANE_RESUME && e.label === "staff_lane_agent"
);

wf.nodes = (wf.nodes || []).filter((n) => n.id !== WAIT && n.id !== DECIDE);
wf.edges = (wf.edges || []).filter(
  (e) =>
    ![
      EDGE_ENTRY_TO_WAIT,
      EDGE_RESUME_TO_WAIT,
      EDGE_WAIT_TO_DECIDE,
      EDGE_DECIDE_REWAIT,
      EDGE_DECIDE_AGENT,
    ].includes(e.id) &&
    !(e.source === ROUTE_ENTRY && e.label === "staff") &&
    !(e.source === LANE_RESUME && e.label === "staff_lane_agent")
);

wf.nodes.push(
  {
    id: WAIT,
    type: "flow-node",
    position: { x: 980, y: 520 },
    data: {
      node_type: "wait_for_response",
      config: {
        has_timeout: true,
        timeout_seconds: BURST_SECONDS,
        save_response_to: "staff_burst_reply",
      },
      display_name: `Wait: staff burst ${BURST_SECONDS}s`,
    },
  },
  {
    id: DECIDE,
    type: "flow-node",
    position: { x: 980, y: 660 },
    data: {
      node_type: "decide",
      config: {
        decision_type: "function",
        conditions: [
          {
            id: COND_USER,
            label: "user_input",
            description: "Otro mensaje staff — reiniciar debounce 15s",
          },
          {
            id: COND_TIMEOUT,
            label: "timeout",
            description: "15s de silencio — pasar a Agent Staff",
          },
        ],
        llm_configuration: {},
        function_id: functionId,
        function_name: "route-staff-burst-resume",
      },
      display_name: "Decision: staff burst resume",
    },
  }
);

wf.edges.push(
  {
    id: EDGE_ENTRY_TO_WAIT,
    source: ROUTE_ENTRY,
    target: WAIT,
    label: "staff",
    type: "default",
    flow_condition_id: prevStaffEdge?.flow_condition_id || null,
  },
  {
    id: EDGE_RESUME_TO_WAIT,
    source: LANE_RESUME,
    target: WAIT,
    label: "staff_lane_agent",
    type: "default",
    flow_condition_id: prevLaneAgentEdge?.flow_condition_id || "staff_lane_agent",
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
    id: EDGE_DECIDE_AGENT,
    source: DECIDE,
    target: AGENT,
    label: "timeout",
    type: "default",
    flow_condition_id: COND_TIMEOUT,
  }
);

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + "\n");

let reg = {};
try {
  reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
} catch {
  reg = {};
}
reg.functions = reg.functions || {};
reg.functions.route_staff_burst_resume = {
  kapso_function_name: "route-staff-burst-resume",
  kapso_function_id: functionId,
  local_path: "kapso/functions/route_staff_burst_resume.js",
  note: "Tras wait_staff_burst 15s: user_input→rewait; timeout→Agent Staff",
};
reg.staff_lane = reg.staff_lane || {};
const gn = new Set(reg.staff_lane.graph_functions || []);
gn.add("route-staff-burst-resume");
reg.staff_lane.graph_functions = [...gn];
reg.staff_lane.burst_debounce_seconds = BURST_SECONDS;

fs.writeFileSync(regPath, JSON.stringify(reg, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      ok: true,
      wait: WAIT,
      decide: DECIDE,
      timeout_seconds: BURST_SECONDS,
      function_id: functionId,
      edges: [
        EDGE_ENTRY_TO_WAIT,
        EDGE_RESUME_TO_WAIT,
        EDGE_WAIT_TO_DECIDE,
        EDGE_DECIDE_REWAIT,
        EDGE_DECIDE_AGENT,
      ],
    },
    null,
    2
  )
);
