#!/usr/bin/env node
/**
 * v10: grafo podado — staff lineal, sin nodos huérfanos de v7/v8/v9.
 * Cliente: sin cambios de topología (vendedor + histórico + pausa staff-only).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const inPath = path.join(root, "workflow_lifedeportes_sales_inbound_v9_staff_pedido.json");
const outPath = path.join(root, "workflow_lifedeportes_sales_inbound_v10.json");

const src = JSON.parse(fs.readFileSync(inPath, "utf8"));
const byId = Object.fromEntries(src.nodes.map((n) => [n.id, n]));

/** Nodos staff legacy a eliminar del JSON (siguen en git history / v9). */
const DROP_NODE_IDS = new Set([
  "detect_staff_upload_1745500002500",
  "agent_staff_general_1745500002850",
  "route_staff_entry_1745500002600",
  "decide_route_staff_registration_1745500002755",
  "fn_register_nomina_stub_1745500002765",
  "send_staff_nomina_ok_1745500002775",
  "handoff_staff_1745500018100",
]);

const KEEP_NODE_IDS = src.nodes.map((n) => n.id).filter((id) => !DROP_NODE_IDS.has(id));

const UPLOAD_AGENT = "agent_1780762885818";
const ROUTE_USER = "decide_route_user_entry_1745500002450";
const WAIT_STAFF = "wait_staff_lane_1745500019050";

const nodes = KEEP_NODE_IDS.map((id) => {
  const n = structuredClone(byId[id]);
  if (id === UPLOAD_AGENT) {
    n.data.display_name = "Agent: Staff ingreso pedido";
  }
  return n;
});
if (!nodes.some((n) => n.id === WAIT_STAFF)) {
  nodes.push({
    id: WAIT_STAFF,
    type: "flow-node",
    position: { x: 1720, y: 720 },
    data: {
      node_type: "wait_for_response",
      config: {
        has_timeout: false,
        timeout_seconds: null,
        save_response_to: "staff_lane_reply",
      },
      display_name: "Wait: staff pedido",
    },
  });
}

const hasNode = (id) => nodes.some((n) => n.id === id);

const edges = [];

const addEdge = (id, source, target, label = "next", flow_condition_id = null) => {
  if (!hasNode(source) || !hasNode(target)) return;
  edges.push({ id, source, target, label, type: "default", flow_condition_id });
};

// --- Entrada común ---
addEdge("e10-start-policy", "start", "guard_policy_1745500001000");
addEdge("e10-policy-staff", "guard_policy_1745500001000", "guard_staff_1745500002000");
addEdge("e10-staff-route-user", "guard_staff_1745500002000", ROUTE_USER);

// --- Cliente (intacto) ---
addEdge(
  "e10-user-customer-paused",
  ROUTE_USER,
  "send_customer_lane_paused_1745500019000",
  "customer",
  "b69e8142-e9b9-4943-87e8-22dedee60922"
);
addEdge("e10-classify-customer-entry", "fn_classify_contact_odoo_1745500002550", "route_customer_entry_1745500002575");
addEdge(
  "e10-customer-new",
  "route_customer_entry_1745500002575",
  "agent_orquestador_1745500003000",
  "new_customer",
  "e388d011-2ab2-4dcb-b469-20e7bc57de54"
);
addEdge(
  "e10-customer-existing",
  "route_customer_entry_1745500002575",
  "agent_customer_history_1745500003100",
  "existing_customer",
  "642994a3-83c1-4d28-a1f9-6c2abd8eec24"
);
addEdge("e10-history-handoff", "agent_customer_history_1745500003100", "handoff_general_1745500018000");
// Vendedor: NO cablear a handoff_general. complete_task debe terminar la ejecución
// (ended) para que el siguiente mensaje dispare Start→debounce→vendedor.
// Handoff real solo vía tool handoff_to_human (aceptación / pide humano).
// addEdge("e10-vendedor-handoff", "agent_orquestador_1745500003000", "handoff_general_1745500018000");

// Nota: edge customer → classify solo cuando staff_only_mode está off (script staff_only_mode.js lo restaura).

// --- Staff: una línea ---
addEdge(
  "e10-user-staff-upload",
  ROUTE_USER,
  UPLOAD_AGENT,
  "staff",
  "34506386-3cf9-45ad-af58-956dda675d2b"
);
addEdge("e10-upload-validate", UPLOAD_AGENT, "fn_validate_staff_write_1745500003300");
addEdge("e10-validate-decide-write", "fn_validate_staff_write_1745500003300", "decide_route_staff_write_1745500003310");
addEdge(
  "e10-write-ok-build",
  "decide_route_staff_write_1745500003310",
  "fn_build_quote_payload_1745500002650",
  "staff_write_ok",
  "c2202dc0-e044-4d8e-9619-18cf28f54597"
);
addEdge(
  "e10-write-blocked-send",
  "decide_route_staff_write_1745500003310",
  "send_staff_write_blocked_1745500003320",
  "staff_write_blocked",
  "e188afd8-3717-4d51-a305-5cfc7cdc5891"
);
addEdge("e10-build-odoo", "fn_build_quote_payload_1745500002650", "fn_staff_upload_odoo_1745500002700");
addEdge("e10-odoo-send-ok", "fn_staff_upload_odoo_1745500002700", "send_staff_upload_ok_1745500002800");
addEdge("e10-send-ok-wait", "send_staff_upload_ok_1745500002800", WAIT_STAFF);
addEdge("e10-blocked-wait", "send_staff_write_blocked_1745500003320", WAIT_STAFF);

// Mensajes staff (en español limpio sin variables crudas {{vars.*}} ni tecnicismos)
const sendOk = nodes.find((n) => n.id === "send_staff_upload_ok_1745500002800");
if (sendOk) {
  sendOk.data.config.message =
    "Listo, el borrador del pedido ha sido registrado correctamente. Si la lista de nombres o tallas quedó pendiente, puede completarla antes de confirmar la producción.";
}
const sendBlocked = nodes.find((n) => n.id === "send_staff_write_blocked_1745500003320");
if (sendBlocked) {
  sendBlocked.data.config.message =
    "Para subir el borrador: escriba CONFIRMO SUBIR o «confirmo y sube» (o complete los datos pendientes del pedido).";
}
const sendDone = nodes.find((n) => n.id === "send_staff_lane_already_done_1745500019070");
if (sendDone) {
  sendDone.data.config.message =
    "El borrador ya fue procesado. Si necesita realizar alguna corrección, envíe el Excel o indique el cambio por aquí.";
}
const graph = { nodes, edges };
fs.writeFileSync(outPath, JSON.stringify(graph, null, 2) + "\n");

console.log("Wrote", outPath);
console.log("nodes:", nodes.length, "(dropped", DROP_NODE_IDS.size, ")");
console.log("edges:", edges.length);
