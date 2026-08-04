#!/usr/bin/env node
/**
 * v8: sesión WhatsApp 24h + handoff al terminar (sin loop staff→general).
 * Preserva posiciones manuales del grafo v7.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const graphPath = path.join(root, "workflow_lifedeportes_sales_inbound_v7_staff.json");

const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));

const handoffClient = graph.nodes.find((n) => n.id === "handoff_general_1745500018000");
if (handoffClient) {
  handoffClient.data.display_name = "Handoff: cliente (inbox abierto)";
  handoffClient.data.config = {
    reason: "client_lane_complete",
    context_data: {
      lane: "customer",
      open_for_human: true,
    },
  };
}

const staffHandoffId = "handoff_staff_1745500018100";
if (!graph.nodes.find((n) => n.id === staffHandoffId)) {
  graph.nodes.push({
    id: staffHandoffId,
    type: "flow-node",
    position: { x: 120, y: 1000 },
    data: {
      node_type: "handoff",
      display_name: "Handoff: staff (inbox abierto)",
      config: {
        reason: "staff_lane_complete",
        context_data: {
          lane: "staff",
          open_for_human: true,
        },
      },
    },
  });
}

const vendedorDecideId = "decide_route_vendedor_post_1745500003250";
if (!graph.nodes.find((n) => n.id === vendedorDecideId)) {
  graph.nodes.push({
    id: vendedorDecideId,
    type: "flow-node",
    position: { x: 540, y: 500 },
    data: {
      node_type: "decide",
      display_name: "Decision: route-vendedor-post",
      config: {
        decision_type: "function",
        function_id: "0ba79a76-3fed-4f7e-bf6c-fd6de0cf05c0",
        function_name: "route-intent-next",
        conditions: [
          {
            id: "v1-continue",
            label: "continue_chat",
            description: "Seguir venta en el mismo agente.",
          },
          {
            id: "v2-capture",
            label: "capture_partial_details",
            description: "Cliente listo; handoff con quote vars.",
          },
          {
            id: "v3-handoff",
            label: "handoff_human",
            description: "Escalar a humano.",
          },
          {
            id: "v4-fallback",
            label: "fallback_text",
            description: "Fuera de alcance.",
          },
        ],
      },
    },
  });
}

const blocked = graph.nodes.find((n) => n.id === "send_staff_write_blocked_1745500003320");
if (blocked) {
  blocked.data.config.message =
    "Subida cancelada: {{vars.staff.write_blocked_reason}}. La conversación queda en inbox para revisión humana. Para una nueva subida, escriba SUBIR PEDIDO o SUBIR NOMINA.";
}

const retarget = (edgeId, source, target) => {
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (edge) edge.target = target;
};

retarget("e-blocked-to-handoff-v8", "send_staff_write_blocked_1745500003320", staffHandoffId);
retarget("e-upload-ok-to-handoff-v8", "send_staff_upload_ok_1745500002800", staffHandoffId);
retarget("e-nomina-ok-to-handoff-v8", "send_staff_nomina_ok_1745500002775", staffHandoffId);

graph.edges = graph.edges.filter(
  (e) => !(e.source === "agent_orquestador_1745500003000" && e.target === "handoff_general_1745500018000")
);

const addEdge = (id, source, target, label) => {
  if (!graph.edges.find((e) => e.id === id)) {
    graph.edges.push({ id, source, target, label, type: "default", flow_condition_id: null });
  }
};

addEdge(
  "e-vendedor-to-decide-v8",
  "agent_orquestador_1745500003000",
  vendedorDecideId,
  "next"
);
addEdge(
  "e-vendedor-continue-v8",
  vendedorDecideId,
  "agent_orquestador_1745500003000",
  "continue_chat"
);
addEdge(
  "e-vendedor-capture-v8",
  vendedorDecideId,
  "handoff_general_1745500018000",
  "capture_partial_details"
);
addEdge(
  "e-vendedor-handoff-v8",
  vendedorDecideId,
  "handoff_general_1745500018000",
  "handoff_human"
);
addEdge(
  "e-vendedor-fallback-v8",
  vendedorDecideId,
  "handoff_general_1745500018000",
  "fallback_text"
);

const out = path.join(root, "workflow_lifedeportes_sales_inbound_v8_session.json");
fs.writeFileSync(out, JSON.stringify(graph, null, 2));
console.log("Wrote", out, "nodes:", graph.nodes.length, "edges:", graph.edges.length);
