#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const graphPath = join(root, "workflow_lifedeportes_sales_inbound_v8_session.json");
const promptPath = join(root, "prompts/agent_customer_history_v2.md");

const graph = JSON.parse(readFileSync(graphPath, "utf8"));
const prompt = readFileSync(promptPath, "utf8").trim();

const node = graph.nodes.find((n) => n.id === "agent_customer_history_1745500003100");
if (!node) throw new Error("agent_customer_history node not found");

node.data.config.system_prompt = prompt;
node.data.config.flow_agent_function_tools = [
  {
    name: "consultar_tarjeta_pedido",
    description:
      "Consulta la tarjeta de producción/diseño (estado, etapa y avance). Sin order_name lista tarjetas activas. Con order_name (S01234) detalle; sin tarjeta = no existe.",
    function_id: "2fb9ca35-31f7-4b3a-84c7-8c03dc0a1775",
    function_name: "get-customer-card-scoped-odoo",
    input_schema: {
      type: "object",
      properties: {
        order_name: { type: "string", description: "Número de pedido ej. S01234" },
        order_id: { type: "number", description: "ID del pedido" },
        task_id: { type: "number", description: "ID tarjeta project.task" },
      },
    },
  },
  {
    name: "consultar_referencias_diseno",
    description:
      "Pedidos anteriores hechos: referencias de diseño o archivo de impresión en tarjetas finalizadas.",
    function_id: "d889689a-c8bc-4183-a4ec-a793a5268b64",
    function_name: "get-customer-design-references-scoped-odoo",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Máximo referencias 1-15" },
      },
    },
  },
];

writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`);
console.log("Patched agent_customer_history: 2 tools + prompt v2");
