#!/usr/bin/env node
/**
 * Ensambla prompt trial v1 e inyecta en workflow_lifedeportes_sales_inbound.json
 * Uso: node kapso/scripts/sync-trial-agent-prompt.js
 */
const fs = require("fs");
const path = require("path");

const AGENT_MAX_ITERATIONS = 5;
const AGENT_MAX_TOKENS = 1536;

const root = path.join(__dirname, "..");
const promptTemplatePath = path.join(root, "prompts", "agent_orchestrator_trial_v1.md");
const indexerPath = path.join(root, "business_indexer_v1.md");
const catalogPath = path.join(root, "catalog_for_agent.md");
const faqPath = path.join(root, "..", "playbook_ventas_paola.md");
const wfPath = path.join(root, "workflow_lifedeportes_sales_inbound.json");

function extractIndexerClientSection(markdown) {
  const start = markdown.indexOf("## Lenguaje cliente");
  const end = markdown.indexOf("## Mapeo interno");
  if (start === -1) return markdown;
  return markdown.slice(start, end === -1 ? undefined : end).trim();
}

function extractFaqSection(markdown) {
  const start = markdown.indexOf("## 3. Preguntas Frecuentes");
  const end = markdown.indexOf("## 4. El Proceso de Cierre");
  if (start === -1) {
    return (
      "- Abono 50% para iniciar, 50% al terminar.\n" +
      "- Entrega ~15 dias habiles tras aprobacion de diseno.\n" +
      "- Logos por aqui en PDF o imagen clara.\n"
    );
  }
  return markdown.slice(start, end === -1 ? undefined : end).trim();
}

const template = fs.readFileSync(promptTemplatePath, "utf8");
const indexer = fs.existsSync(indexerPath)
  ? extractIndexerClientSection(fs.readFileSync(indexerPath, "utf8"))
  : "";
const catalog = fs.existsSync(catalogPath)
  ? fs.readFileSync(catalogPath, "utf8")
  : "(catalogo no generado — correr export_sellable_catalog.py)";
const faq = fs.existsSync(faqPath)
  ? extractFaqSection(fs.readFileSync(faqPath, "utf8"))
  : "";

const prompt = template
  .replace("{{BUSINESS_INDEXER}}", indexer)
  .replace("{{CATALOG}}", catalog)
  .replace("{{FAQ}}", faq);

const json = JSON.parse(fs.readFileSync(wfPath, "utf8"));
const nodes = json.nodes || [];
let node = nodes.find((n) => n.id === "agent_orquestador_1745500003000");
if (!node) node = nodes.find((n) => n.data?.node_type === "agent");
if (!node) {
  console.error("Agent node not found");
  process.exit(1);
}

node.data.config.system_prompt = prompt;
node.data.config.max_iterations = AGENT_MAX_ITERATIONS;
node.data.config.max_tokens = AGENT_MAX_TOKENS;

// Trial: solo construir_payload + handoff tools
node.data.config.flow_agent_function_tools = (node.data.config.flow_agent_function_tools || []).filter(
  (t) => t.name === "construir_payload_pedido"
);

fs.writeFileSync(wfPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
console.log("OK:", wfPath, `prompt_chars=${prompt.length} max_iterations=${AGENT_MAX_ITERATIONS}`);
