#!/usr/bin/env node
/**
 * v9 staff: solo ingreso de pedidos. Cliente sin cambios.
 * Input: workflow_lifedeportes_sales_inbound_v8_session.json
 * Output: workflow_lifedeportes_sales_inbound_v9_staff_pedido.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const inPath = path.join(root, "workflow_lifedeportes_sales_inbound_v8_session.json");
const outPath = path.join(root, "workflow_lifedeportes_sales_inbound_v9_staff_pedido.json");

const graph = JSON.parse(fs.readFileSync(inPath, "utf8"));

const UPLOAD_AGENT = "agent_1780762885818";
const DETECT = "detect_staff_upload_1745500002500";
const VALIDATE = "fn_validate_staff_write_1745500003300";
const DECIDE_WRITE = "decide_route_staff_write_1745500003310";
const BUILD = "fn_build_quote_payload_1745500002650";
const ODOO = "fn_staff_upload_odoo_1745500002700";
const SEND_OK = "send_staff_upload_ok_1745500002800";
const SEND_BLOCKED = "send_staff_write_blocked_1745500003320";
const STAFF_HANDOFF_ID = "handoff_staff_1745500018100";

if (!graph.nodes.find((n) => n.id === STAFF_HANDOFF_ID)) {
  graph.nodes.push({
    id: STAFF_HANDOFF_ID,
    type: "flow-node",
    position: { x: 120, y: 1000 },
    data: {
      node_type: "handoff",
      display_name: "Handoff: staff pedido (inbox)",
      config: {
        reason: "staff_order_draft_complete",
        context_data: { lane: "staff", open_for_human: true },
      },
    },
  });
}

const sendOk = graph.nodes.find((n) => n.id === SEND_OK);
if (sendOk) {
  sendOk.data.config.message =
    "Borrador {{vars.order.name}} creado en Odoo (estado borrador). Total: ${{vars.order.amount_total}}. Revise variantes y confirme manualmente en Odoo. La conversación queda en inbox.";
}

const sendBlocked = graph.nodes.find((n) => n.id === SEND_BLOCKED);
if (sendBlocked) {
  sendBlocked.data.config.message =
    "Subida cancelada: {{vars.staff.write_blocked_reason}}. La conversación queda en inbox. Escriba de nuevo cuando tenga los datos completos.";
}

const removeEdge = (pred) => {
  graph.edges = graph.edges.filter((e) => !pred(e));
};

removeEdge((e) => e.source === DETECT && e.target === "route_staff_entry_1745500002600");
removeEdge((e) => e.source === "route_staff_entry_1745500002600");
removeEdge((e) => e.source === "decide_route_staff_registration_1745500002755");
removeEdge((e) => e.source === "fn_register_nomina_stub_1745500002765");
removeEdge((e) => e.target === "fn_register_nomina_stub_1745500002765");
removeEdge((e) => e.target === "send_staff_nomina_ok_1745500002775");
removeEdge((e) => e.source === "agent_staff_general_1745500002850");

const addEdge = (id, source, target, label = "next", flow_condition_id = null) => {
  if (!graph.edges.find((e) => e.id === id)) {
    graph.edges.push({ id, source, target, label, type: "default", flow_condition_id });
  }
};

addEdge("e-v9-detect-to-upload", DETECT, UPLOAD_AGENT);
addEdge(
  "e-v9-write-ok-to-build",
  DECIDE_WRITE,
  BUILD,
  "staff_write_ok",
  "c2202dc0-e044-4d8e-9619-18cf28f54597"
);
addEdge("e-v9-upload-ok-handoff", SEND_OK, STAFF_HANDOFF_ID);
addEdge("e-v9-blocked-handoff", SEND_BLOCKED, STAFF_HANDOFF_ID);

fs.writeFileSync(outPath, JSON.stringify(graph, null, 2) + "\n");
console.log("Wrote", outPath);
console.log("nodes:", graph.nodes.length, "edges:", graph.edges.length);
