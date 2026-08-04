#!/usr/bin/env node
/**
 * Solo actualiza el prompt del agente staff upload (v4). No toca vendedor ni histórico.
 */
const fs = require("fs");
const path = require("path");

const base = path.join(__dirname, "..");
const wfPath = path.join(base, "workflow_lifedeportes_sales_inbound_v9_staff_pedido.json");
const wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));

const nodeId = "agent_1780762885818";
const promptFile = "prompts/agent_staff_upload_v4.md";
const node = wf.nodes.find((n) => n.id === nodeId);
if (!node) throw new Error(`Node not found: ${nodeId}`);

const prompt = fs.readFileSync(path.join(base, promptFile), "utf8").trim();
node.data.config.system_prompt = prompt;
node.data.config.max_tokens = 3000;
node.data.display_name = "AI Agent: Staff ingreso pedido";

const tools = node.data.config.enabled_default_tools || [];
for (const t of ["ask_about_file", "enter_waiting", "get_whatsapp_context"]) {
  if (!tools.includes(t)) tools.push(t);
}
node.data.config.enabled_default_tools = tools;

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + "\n");
console.log(`Updated ${nodeId} from ${promptFile} (${prompt.length} chars)`);
console.log("Wrote", wfPath);
