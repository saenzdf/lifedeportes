#!/usr/bin/env node
/** Patch workflow for trial v1 staff upload path */
const fs = require("fs");
const path = require("path");

const wfPath = path.join(__dirname, "..", "workflow_lifedeportes_sales_inbound.json");
const json = JSON.parse(fs.readFileSync(wfPath, "utf8"));

json.description =
  "Trial v1: catalog cache, no Odoo per message, staff SUBIR PEDIDO uploads to Odoo.";

const newNodes = [
  {
    id: "detect_staff_upload_1745500002500",
    type: "flow-node",
    position: { x: 400, y: 480 },
    data: {
      node_type: "function",
      display_name: "Detect staff SUBIR PEDIDO",
      config: {
        function_name: "detect-staff-upload-command",
      },
    },
  },
  {
    id: "decide_staff_entry_1745500002600",
    type: "flow-node",
    position: { x: 400, y: 520 },
    data: {
      node_type: "decide",
      display_name: "Route staff vs agent",
      config: {
        decision_type: "function",
        function_name: "route-staff-entry",
        conditions: [
          { label: "continue_agent", description: "Cliente o staff sin comando upload." },
          { label: "staff_upload_odoo", description: "Staff escribio SUBIR PEDIDO." },
        ],
      },
    },
  },
  {
    id: "fn_staff_upload_odoo_1745500002700",
    type: "flow-node",
    position: { x: 80, y: 560 },
    data: {
      node_type: "function",
      display_name: "Staff: subir pedido Odoo",
      config: {
        function_name: "odoo-create-lead-and-so",
        function_id: "8a7b731d-480c-4abc-8a72-f965856d7515",
      },
    },
  },
  {
    id: "send_staff_upload_ok_1745500002800",
    type: "flow-node",
    position: { x: 80, y: 680 },
    data: {
      node_type: "send_text",
      display_name: "Confirmar upload staff",
      config: {
        message:
          "Listo. Pedido subido a Odoo desde el borrador de la conversacion. Revisa la cotizacion y confirma con el cliente.",
        delay_seconds: 0,
      },
    },
  },
];

for (const node of newNodes) {
  if (!json.nodes.find((n) => n.id === node.id)) {
    json.nodes.push(node);
  }
}

const agent = json.nodes.find((n) => n.id === "agent_orquestador_1745500003000");
if (agent) agent.position.y = 640;

json.edges = json.edges.filter(
  (e) => !(e.source === "guard_staff_1745500002000" && e.target === "agent_orquestador_1745500003000")
);

const edgeKeys = new Set(json.edges.map((e) => `${e.source}|${e.label}|${e.target}`));
function addEdge(source, target, label) {
  const key = `${source}|${label}|${target}`;
  if (!edgeKeys.has(key)) {
    json.edges.push({ source, target, label });
    edgeKeys.add(key);
  }
}

addEdge("guard_staff_1745500002000", "detect_staff_upload_1745500002500", "next");
addEdge("detect_staff_upload_1745500002500", "decide_staff_entry_1745500002600", "next");
addEdge("decide_staff_entry_1745500002600", "agent_orquestador_1745500003000", "continue_agent");
addEdge("decide_staff_entry_1745500002600", "fn_staff_upload_odoo_1745500002700", "staff_upload_odoo");
addEdge("fn_staff_upload_odoo_1745500002700", "send_staff_upload_ok_1745500002800", "next");

const formalEdge = json.edges.find(
  (e) => e.source === "decide_intent_next_1745500004000" && e.label === "formal_quote"
);
if (formalEdge) {
  formalEdge.target = "handoff_general_1745500018000";
}

if (agent?.data?.config?.flow_agent_function_tools?.[0]) {
  agent.data.config.flow_agent_function_tools[0].description =
    "Arma el borrador del pedido en vars.quote.draft_payload usando precios del catalogo en cache. Usar al cerrar interes comercial.";
}

fs.writeFileSync(wfPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
console.log("OK patched", wfPath);
