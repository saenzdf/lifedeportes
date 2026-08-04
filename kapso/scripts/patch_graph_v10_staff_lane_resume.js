#!/usr/bin/env node
/**
 * Cablea wait_staff_lane → decide(route-staff-lane-resume):
 *   staff_lane_retry_write → validate
 *   staff_lane_agent → agent ingreso
 *   staff_lane_done → send ya-ingresado → wait
 *
 * Uso:
 *   node scripts/patch_graph_v10_staff_lane_resume.js [--function-id UUID]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const graphPath = path.join(root, "workflow_lifedeportes_sales_inbound_v10.json");
const regPath = path.join(root, "service_registry.json");

const WAIT = "wait_staff_lane_1745500019050";
const VALIDATE = "fn_validate_staff_write_1745500003300";
const AGENT = "agent_1780762885818";
const DECIDE = "decide_route_staff_lane_resume_1745500019060";
const SEND_DONE = "send_staff_lane_already_done_1745500019070";

const argv = process.argv.slice(2);
const fidIdx = argv.indexOf("--function-id");
let functionId =
  (fidIdx >= 0 && argv[fidIdx + 1]) ||
  process.env.ROUTE_STAFF_LANE_RESUME_ID ||
  "";

if (!functionId) {
  try {
    const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
    functionId =
      reg?.functions?.route_staff_lane_resume?.kapso_function_id ||
      reg?.route_staff_lane_resume?.kapso_function_id ||
      "";
    // also scan registry arrays
    const all = JSON.stringify(reg);
    const m = all.match(/"route-staff-lane-resume"[^}]{0,200}"kapso_function_id"\s*:\s*"([^"]+)"/);
    if (!functionId && m) functionId = m[1];
  } catch {
    /* ignore */
  }
}

if (!functionId) {
  console.error("Falta --function-id de route-staff-lane-resume (crear/upsert primero).");
  process.exit(1);
}

const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const nodes = graph.nodes;
const edges = graph.edges;

const upsertNode = (node) => {
  const i = nodes.findIndex((n) => n.id === node.id);
  if (i >= 0) nodes[i] = node;
  else nodes.push(node);
};

upsertNode({
  id: DECIDE,
  type: "flow-node",
  position: { x: 1920, y: 720 },
  data: {
    node_type: "decide",
    config: {
      decision_type: "function",
      conditions: [
        {
          id: "c-staff-lane-retry-write",
          label: "staff_lane_retry_write",
          description: "CONFIRMO SUBIR con fingerprint — revalidar write.",
        },
        {
          id: "c-staff-lane-agent",
          label: "staff_lane_agent",
          description: "Corrección o nuevo dato — volver al agente.",
        },
        {
          id: "c-staff-lane-done",
          label: "staff_lane_done",
          description: "SO ya creado en esta ejecución.",
        },
      ],
      llm_configuration: {},
      function_id: functionId,
      function_name: "route-staff-lane-resume",
    },
    display_name: "Decision: staff lane resume",
  },
});

upsertNode({
  id: SEND_DONE,
  type: "flow-node",
  position: { x: 2120, y: 880 },
  data: {
    node_type: "send_text",
    config: {
      whatsapp_config_id: null,
      phone_number_id: null,
      message:
        "{{vars.service.fallback_message}} Si necesita corregir, envíe el Excel o indique el cambio.",
      delay_seconds: 0,
      provider_model_id: null,
      provider_model_name: null,
      ai_field_config: {},
      to_phone_number: null,
    },
    display_name: "Send: pedido ya ingresado",
  },
});

const edgeDefs = [
  {
    id: "e10-wait-resume-decide",
    source: WAIT,
    target: DECIDE,
    label: "next",
    flow_condition_id: null,
  },
  {
    id: "e10-resume-retry-validate",
    source: DECIDE,
    target: VALIDATE,
    label: "staff_lane_retry_write",
    flow_condition_id: "c-staff-lane-retry-write",
  },
  {
    id: "e10-resume-agent",
    source: DECIDE,
    target: AGENT,
    label: "staff_lane_agent",
    flow_condition_id: "c-staff-lane-agent",
  },
  {
    id: "e10-resume-done-send",
    source: DECIDE,
    target: SEND_DONE,
    label: "staff_lane_done",
    flow_condition_id: "c-staff-lane-done",
  },
  {
    id: "e10-done-send-wait",
    source: SEND_DONE,
    target: WAIT,
    label: "next",
    flow_condition_id: null,
  },
];

for (const e of edgeDefs) {
  const i = edges.findIndex((x) => x.id === e.id);
  const full = { ...e, type: "default" };
  if (i >= 0) edges[i] = full;
  else edges.push(full);
}

fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2) + "\n");
console.log("Patched", graphPath);
console.log("function_id", functionId);
console.log("nodes", nodes.length, "edges", edges.length);
