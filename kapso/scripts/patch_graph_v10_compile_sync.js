#!/usr/bin/env node
/**
 * Inserta compile-staff-order-draft entre agent pedido y validate-staff-write.
 * Añade sync-order-draft-from-odoo (+ compile opcional) como tools del agente.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wfPath = path.join(root, "workflow_lifedeportes_sales_inbound_v10.json");
const idsPath = path.join(root, "docs/order_detail_function_ids.json");
const regPath = path.join(root, "service_registry.json");

const PEDIDO_AGENT = "agent_1780762885818";
const VALIDATE = "fn_validate_staff_write_1745500003300";
const COMPILE = "fn_compile_staff_order_1745500003290";
const EDGE_AGENT_VALIDATE = "e10-upload-validate";
const EDGE_AGENT_COMPILE = "e10-upload-compile";
const EDGE_COMPILE_VALIDATE = "e10-compile-validate";

const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));

// Ensure correction IDs present for tool patch
if (!ids.buscar_pedido_odoo) {
  ids.buscar_pedido_odoo = reg.staff_write?.buscar_pedido_odoo?.kapso_function_id;
}
if (!ids.corregir_pedido_odoo) {
  ids.corregir_pedido_odoo = reg.staff_write?.corregir_pedido_odoo?.kapso_function_id;
}
if (!ids.compile_staff_order_draft) {
  ids.compile_staff_order_draft = reg.staff_write?.compile_staff_order_draft?.kapso_function_id;
}
if (!ids.sync_order_draft_from_odoo) {
  ids.sync_order_draft_from_odoo = reg.staff_write?.sync_order_draft_from_odoo?.kapso_function_id;
}
fs.writeFileSync(idsPath, JSON.stringify(ids, null, 2) + "\n");

if (!ids.compile_staff_order_draft) {
  throw new Error("Missing compile_staff_order_draft function id");
}
if (!ids.sync_order_draft_from_odoo) {
  throw new Error("Missing sync_order_draft_from_odoo function id");
}

const wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));

// --- node compile ---
const existingCompile = wf.nodes.find((n) => n.id === COMPILE);
if (!existingCompile) {
  const validateNode = wf.nodes.find((n) => n.id === VALIDATE);
  const pos = validateNode?.position || { x: 1280, y: 240 };
  wf.nodes.push({
    id: COMPILE,
    type: "flow-node",
    position: { x: pos.x - 220, y: pos.y },
    data: {
      node_type: "function",
      config: {
        function_id: ids.compile_staff_order_draft,
        function_name: "compile-staff-order-draft",
        save_response_to: null,
      },
      display_name: "Function: compile-staff-order-draft",
    },
  });
} else {
  existingCompile.data.config.function_id = ids.compile_staff_order_draft;
  existingCompile.data.config.function_name = "compile-staff-order-draft";
}

// --- edges: agent → compile → validate (quitar cualquier next del agent hacia validate) ---
wf.edges = wf.edges.filter((e) => {
  if (e.id === EDGE_AGENT_VALIDATE || e.id === EDGE_AGENT_COMPILE || e.id === EDGE_COMPILE_VALIDATE) {
    return false;
  }
  // Remote graphs may use UUID edge ids for the same hop
  if (e.source === PEDIDO_AGENT && e.target === VALIDATE) return false;
  if (e.source === PEDIDO_AGENT && e.label === "next") return false;
  if (e.source === COMPILE && e.target === VALIDATE) return false;
  return true;
});
wf.edges.push(
  {
    id: EDGE_AGENT_COMPILE,
    source: PEDIDO_AGENT,
    target: COMPILE,
    label: "next",
    type: "default",
    flow_condition_id: null,
  },
  {
    id: EDGE_COMPILE_VALIDATE,
    source: COMPILE,
    target: VALIDATE,
    label: "next",
    type: "default",
    flow_condition_id: null,
  }
);

// --- agent tools: sync (+ keep compile as optional tool for mid-conversation) ---
const agent = wf.nodes.find((n) => n.id === PEDIDO_AGENT);
if (!agent) throw new Error("Pedido agent missing");

const tools = agent.data.config.flow_agent_function_tools || [];
const byName = new Map(tools.map((t) => [t.name, t]));

byName.set("sincronizar_pedido_odoo", {
  name: "sincronizar_pedido_odoo",
  description:
    "Pull Kapso←Odoo: reconstruye order_draft desde líneas SO + Formulario Life. Usar tras editar en Odoo o al retomar un pedido.",
  function_id: ids.sync_order_draft_from_odoo,
  function_name: "sync-order-draft-from-odoo",
  input_schema: {
    type: "object",
    properties: {
      order_id: { type: "number", description: "ID sale.order (opcional si está en vars.order)" },
      order_name: { type: "string", description: "Ej. S02609 (opcional)" },
    },
  },
});

// Refresh correction tool ids if present
if (ids.buscar_pedido_odoo && byName.has("buscar_pedido_odoo")) {
  byName.get("buscar_pedido_odoo").function_id = ids.buscar_pedido_odoo;
}
if (ids.corregir_pedido_odoo && byName.has("corregir_pedido_odoo")) {
  byName.get("corregir_pedido_odoo").function_id = ids.corregir_pedido_odoo;
}

agent.data.config.flow_agent_function_tools = [...byName.values()];

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + "\n");
console.log("Wired compile node", COMPILE, "→", VALIDATE);
console.log("Agent tools now include sincronizar_pedido_odoo");
console.log(
  "Staff path: agent → compile → validate → route → build → odoo"
);
