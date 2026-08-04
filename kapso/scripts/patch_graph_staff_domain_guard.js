#!/usr/bin/env node
/**
 * Inserta decide route_staff_domain_guard entre Agent Staff y compile.
 * Evita que complete_task en dominio nómina/compra dispare la cadena CRM/SO.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wfPath = path.join(root, "workflow_lifedeportes_sales_inbound_v10.json");
const idsPath = path.join(root, "docs/unified_staff_function_ids.json");

const STAFF_AGENT = "agent_1780762885818";
const COMPILE = "fn_compile_staff_order_1745500003290";
const WAIT = "wait_staff_lane_1745500019050";
const DECIDE = "decide_route_staff_domain_1745500003285";
const EDGE_AGENT_NEXT = "a42d1409-7787-4b08-80e4-2b9ea35f971e";

const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
if (!ids.route_staff_domain_guard) {
  throw new Error("Missing route_staff_domain_guard in unified_staff_function_ids.json — deploy function first");
}

const wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));
const nodeIds = new Set(wf.nodes.map((n) => n.id));

function addNode(node) {
  const idx = wf.nodes.findIndex((n) => n.id === node.id);
  if (idx >= 0) wf.nodes[idx] = node;
  else {
    wf.nodes.push(node);
    nodeIds.add(node.id);
  }
}

function removeEdge(id) {
  wf.edges = wf.edges.filter((e) => e.id !== id);
}

function addEdge(id, source, target, label, flow_condition_id = null) {
  removeEdge(id);
  if (!nodeIds.has(source) || !nodeIds.has(target)) {
    throw new Error(`Missing node for ${id}: ${source} -> ${target}`);
  }
  wf.edges.push({ id, source, target, label, type: "default", flow_condition_id });
}

addNode({
  id: DECIDE,
  type: "flow-node",
  position: { x: 1280, y: 40 },
  data: {
    node_type: "decide",
    config: {
      decision_type: "function",
      conditions: [
        {
          id: "a1b2c3d4-staff-pedido-write-01",
          label: "staff_pedido_write",
          description: "Dominio pedido → compile/validate/Odoo CRM-SO",
        },
        {
          id: "a1b2c3d4-staff-skip-pedido-02",
          label: "staff_domain_skip_pedido",
          description: "Nómina/compra: no compile; volver a wait",
        },
      ],
      llm_configuration: {},
      function_id: ids.route_staff_domain_guard,
      function_name: "route-staff-domain-guard",
    },
    display_name: "Decision: staff domain guard",
  },
});

// agent → decide (was agent → compile)
removeEdge(EDGE_AGENT_NEXT);
addEdge(EDGE_AGENT_NEXT, STAFF_AGENT, DECIDE, "next", null);
addEdge(
  "e10-domain-pedido-compile",
  DECIDE,
  COMPILE,
  "staff_pedido_write",
  "a1b2c3d4-staff-pedido-write-01"
);
addEdge(
  "e10-domain-skip-wait",
  DECIDE,
  WAIT,
  "staff_domain_skip_pedido",
  "a1b2c3d4-staff-skip-pedido-02"
);

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + "\n");
console.log("Patched domain guard:", DECIDE);
