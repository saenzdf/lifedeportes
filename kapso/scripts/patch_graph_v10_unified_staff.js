#!/usr/bin/env node
/**
 * Unifica Agent Staff: tools nómina + compra; retira Agent Inbox.
 * No crea agentes aparte. Jump → agent_1780762885818.
 *
 * Uso: node kapso/scripts/patch_graph_v10_unified_staff.js
 * Requiere kapso/docs/unified_staff_function_ids.json (lo escribe deploy_unified_staff.sh)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wfPath = path.join(root, "workflow_lifedeportes_sales_inbound_v10.json");
const idsPath = path.join(root, "docs/unified_staff_function_ids.json");
const promptPath = path.join(root, "prompts/agent_staff_upload_v9_slim.md");

const STAFF_AGENT = "agent_1780762885818";
const INBOX_AGENT = "agent_inbox_ingreso_1752240100000";

const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
const wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));
const prompt = fs.readFileSync(promptPath, "utf8").trim();

const required = [
  "parse_nomina_attlog",
  "confirmar_nomina",
  "prepare_inbox_upload",
  "compute_fidelity_retention",
];
for (const k of required) {
  if (!ids[k]) throw new Error(`Missing function id: ${k} in ${idsPath}`);
}

// Remove inbox agent node
wf.nodes = wf.nodes.filter((n) => n.id !== INBOX_AGENT);
wf.edges = wf.edges.filter((e) => e.source !== INBOX_AGENT && e.target !== INBOX_AGENT);

const agent = wf.nodes.find((n) => n.id === STAFF_AGENT);
if (!agent) throw new Error("Staff agent missing");

agent.data.display_name = "Jump → Staff: subir pedido CRM / nómina";
agent.data.config.system_prompt = prompt;

const tools = agent.data.config.flow_agent_function_tools || [];
// Quitar crear_compra_odoo de la lista de herramientas registradas
agent.data.config.flow_agent_function_tools = tools.filter((t) => t.name !== "crear_compra_odoo");
const byName = new Map(agent.data.config.flow_agent_function_tools.map((t) => [t.name, t]));

function upsertTool(tool) {
  byName.set(tool.name, tool);
}

upsertTool({
  name: "parse_nomina_attlog",
  description:
    "Parsea attlog.dat del reloj ZKTeco → vars.nomina.draft + summary_text. PIN = barcode Odoo.",
  function_id: ids.parse_nomina_attlog,
  function_name: "parse-nomina-attlog",
  input_schema: {
    type: "object",
    properties: {
      file_url: { type: "string" },
      filename: { type: "string" },
    },
  },
});

upsertTool({
  name: "confirmar_nomina",
  description:
    "Tras CONFIRMO NOMINA: encola nómina (NOM-…) sin escribir HR. Requiere vars.nomina.draft.",
  function_id: ids.confirmar_nomina,
  function_name: "confirmar-nomina",
  input_schema: {
    type: "object",
    properties: {
      confirmed: { type: "boolean" },
      confirm_text: { type: "string" },
    },
  },
});

upsertTool({
  name: "prepare_inbox_upload",
  description:
    "Semilla silent desde vars.quote (Jump/paquete vendedor) antes de complete_task de pedido.",
  function_id: ids.prepare_inbox_upload,
  function_name: "prepare-inbox-upload",
  input_schema: { type: "object", properties: {} },
});

upsertTool({
  name: "medir_fidelidad_pedido",
  description: "KPI fidelidad Kapso vs Odoo tras subir/sincronizar pedido.",
  function_id: ids.compute_fidelity_retention,
  function_name: "compute-fidelity-retention",
  input_schema: { type: "object", properties: {} },
});

// Ensure nomina KB link if missing
const kbs = agent.data.config.knowledge_base_links || agent.data.config.flow_agent_knowledge_bases || [];
const kbArr = Array.isArray(agent.data.config.flow_agent_knowledge_bases)
  ? agent.data.config.flow_agent_knowledge_bases
  : Array.isArray(agent.data.config.knowledge_bases)
    ? agent.data.config.knowledge_bases
    : null;

agent.data.config.flow_agent_function_tools = [...byName.values()];

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + "\n");
console.log("Patched", wfPath);
console.log("Staff tools:", agent.data.config.flow_agent_function_tools.map((t) => t.name).join(", "));
console.log("Removed inbox agent:", INBOX_AGENT);
