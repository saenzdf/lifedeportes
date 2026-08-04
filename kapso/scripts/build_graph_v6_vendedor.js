#!/usr/bin/env node
/**
 * Build workflow v6: history → vendedor on start_new_sale
 * Usage: node kapso/scripts/build_graph_v6_vendedor.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const v5Path = path.join(root, "workflow_lifedeportes_sales_inbound_v5_agents.json");
const v6Path = path.join(root, "workflow_lifedeportes_sales_inbound_v6_vendedor.json");
const vendedorPrompt = fs.readFileSync(
  path.join(root, "prompts/agent_vendedor_v1.md"),
  "utf8"
);
const historyPrompt = fs.readFileSync(
  path.join(root, "prompts/agent_customer_history_v2.md"),
  "utf8"
);

const graph = JSON.parse(fs.readFileSync(v5Path, "utf8"));

const orq = graph.nodes.find((n) => n.id === "agent_orquestador_1745500003000");
if (orq) {
  orq.data.display_name = "Agent: vendedor";
  orq.data.config.system_prompt = vendedorPrompt;
}

const hist = graph.nodes.find((n) => n.id === "agent_customer_history_1745500003100");
if (hist) {
  hist.data.config.system_prompt = historyPrompt;
}

const decideNode = {
  id: "decide_route_customer_history_post_1745500003200",
  type: "flow-node",
  position: { x: 820, y: 520 },
  data: {
    node_type: "decide",
    display_name: "Decision: route-customer-history-post",
    config: {
      decision_type: "function",
      function_id: "0ba79a76-3fed-4f7e-bf6c-fd6de0cf05c0",
      function_name: "route-intent-next",
      conditions: [
        {
          id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          label: "continue_chat",
          description: "Seguir consultas de historial.",
        },
        {
          id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
          label: "start_new_sale",
          description: "Transferir a agente vendedor (nuevo pedido).",
        },
        {
          id: "c3d4e5f6-a7b8-9012-cdef-123456789012",
          label: "handoff_human",
          description: "Escalar a humano.",
        },
      ],
    },
  },
};

if (!graph.nodes.find((n) => n.id === decideNode.id)) {
  graph.nodes.push(decideNode);
}

graph.edges = graph.edges.filter(
  (e) => e.id !== "e-customer-history-handoff-v5"
);

const newEdges = [
  {
    id: "e-history-to-decide-v6",
    source: "agent_customer_history_1745500003100",
    target: "decide_route_customer_history_post_1745500003200",
    label: "next",
    type: "default",
    flow_condition_id: null,
  },
  {
    id: "e-history-continue-v6",
    source: "decide_route_customer_history_post_1745500003200",
    target: "agent_customer_history_1745500003100",
    label: "continue_chat",
    type: "default",
    flow_condition_id: null,
  },
  {
    id: "e-history-to-vendedor-v6",
    source: "decide_route_customer_history_post_1745500003200",
    target: "agent_orquestador_1745500003000",
    label: "start_new_sale",
    type: "default",
    flow_condition_id: null,
  },
  {
    id: "e-history-handoff-v6",
    source: "decide_route_customer_history_post_1745500003200",
    target: "handoff_general_1745500018000",
    label: "handoff_human",
    type: "default",
    flow_condition_id: null,
  },
];

for (const edge of newEdges) {
  if (!graph.edges.find((e) => e.id === edge.id)) {
    graph.edges.push(edge);
  }
}

fs.writeFileSync(v6Path, JSON.stringify(graph, null, 2));
console.log("Wrote", v6Path);
console.log("Nodes:", graph.nodes.length, "Edges:", graph.edges.length);
