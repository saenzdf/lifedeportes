#!/usr/bin/env node
/**
 * Reemplaza system_prompt del nodo Agent en workflow_lifedeportes_sales_inbound.json
 * con el contenido de prompts/agent_orchestrator_v3.md (UTF-8).
 * Uso: node scripts/sync-workflow-agent-prompt.js
 */
const fs = require("fs");
const path = require("path");

/** Limites del nodo Agent (ajuste conservador vs defaults 12 / 2048). */
const AGENT_MAX_ITERATIONS = 10;
const AGENT_MAX_TOKENS = 1536;

const root = path.join(__dirname, "..");
const mdPath = path.join(root, "prompts", "agent_orchestrator_v3.md");
const wfPath = path.join(root, "workflow_lifedeportes_sales_inbound.json");

const prompt = fs.readFileSync(mdPath, "utf8");
const json = JSON.parse(fs.readFileSync(wfPath, "utf8"));
const nodes = json.nodes || [];
let node = nodes.find((n) => n.id === "agent_orquestador_1745500003000");
if (!node) node = nodes.find((n) => n.data?.node_type === "agent");
if (!node) {
  console.error("Agent node not found");
  process.exit(1);
}
node.data = node.data || {};
node.data.config = node.data.config || {};
node.data.config.system_prompt = prompt;
node.data.config.max_iterations = AGENT_MAX_ITERATIONS;
node.data.config.max_tokens = AGENT_MAX_TOKENS;
fs.writeFileSync(wfPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
console.log(
  "OK:",
  wfPath,
  `max_iterations=${AGENT_MAX_ITERATIONS} max_tokens=${AGENT_MAX_TOKENS}`
);
