#!/usr/bin/env node
/**
 * v10 + carril nómina staff (progresivo).
 * Inserta detect/route lane + agente nómina sin tocar carril cliente.
 *
 * Requiere kapso/docs/nomina_function_ids.json (generado por deploy_nomina_lane.sh)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wfPath = path.join(root, "workflow_lifedeportes_sales_inbound_v10.json");
const idsPath = path.join(root, "docs/nomina_function_ids.json");

const ROUTE_USER = "decide_route_user_entry_1745500002450";
const PEDIDO_AGENT = "agent_1780762885818";
const STAFF_HANDOFF = "handoff_staff_1745500018100";

const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
const wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));

const nodeIds = new Set(wf.nodes.map((n) => n.id));

function addNode(node) {
  if (nodeIds.has(node.id)) {
    const idx = wf.nodes.findIndex((n) => n.id === node.id);
    wf.nodes[idx] = node;
  } else {
    wf.nodes.push(node);
    nodeIds.add(node.id);
  }
}

function removeEdge(predicate) {
  wf.edges = wf.edges.filter((e) => !predicate(e));
}

function addEdge(id, source, target, label = "next", flow_condition_id = null) {
  removeEdge((e) => e.id === id);
  if (!nodeIds.has(source) || !nodeIds.has(target)) {
    throw new Error(`Missing node for edge ${id}: ${source} -> ${target}`);
  }
  wf.edges.push({ id, source, target, label, type: "default", flow_condition_id });
}

const pedidoAgent = wf.nodes.find((n) => n.id === PEDIDO_AGENT);
if (!pedidoAgent) throw new Error("Pedido agent missing");

addNode({
  id: "fn_detect_staff_lane_1745500002510",
  type: "flow-node",
  position: { x: 780, y: -60 },
  data: {
    node_type: "function",
    config: {
      function_id: ids.detect_staff_lane,
      function_name: "detect-staff-lane",
      save_response_to: null,
    },
    display_name: "Function: detect-staff-lane",
  },
});

addNode({
  id: "decide_route_staff_lane_1745500002515",
  type: "flow-node",
  position: { x: 960, y: -60 },
  data: {
    node_type: "decide",
    config: {
      decision_type: "function",
      conditions: [
        {
          id: "a1b2c3d4-staff-pedido-0001",
          label: "staff_pedido",
          description: "Ingreso pedido Odoo (default).",
        },
        {
          id: "a1b2c3d4-staff-nomina-0002",
          label: "staff_nomina",
          description: "SUBIR NOMINA / attlog reloj.",
        },
      ],
      llm_configuration: {},
      function_id: ids.route_staff_lane,
      function_name: "route-staff-lane",
    },
    display_name: "Decision: staff lane",
  },
});

addNode({
  id: "agent_staff_nomina_1745500002520",
  type: "flow-node",
  position: { x: 840, y: 200 },
  data: {
    node_type: "agent",
    config: {
      system_prompt: fs
        .readFileSync(path.join(root, "prompts/agent_staff_nomina_v1.md"), "utf8")
        .trim(),
      provider_model_id: pedidoAgent.data.config.provider_model_id,
      provider_model_name: pedidoAgent.data.config.provider_model_name,
      temperature: "0.0",
      max_iterations: 40,
      max_tokens: 3500,
      reasoning_effort: null,
      observer_prompt_mode: "interactive_chat",
      message_delivery_mode: "auto_send_assistant_text",
      enabled_default_tools: [
        "send_notification_to_user",
        "get_execution_metadata",
        "get_whatsapp_context",
        "get_current_datetime",
        "save_variable",
        "get_variable",
        "enter_waiting",
        "complete_task",
        "handoff_to_human",
      ],
      default_tool_configs: {},
      sandbox_enabled: false,
      sandbox_network_mode: "allow_all",
      sandbox_allowed_outbound_hosts: [],
      flow_agent_function_tools: [
        {
          name: "parse_nomina_attlog",
          description:
            "Descarga y parsea attlog.dat del reloj ZKTeco. Devuelve nomina.draft y summary_text.",
          function_id: ids.parse_nomina_attlog,
          function_name: "parse-nomina-attlog",
          input_schema: {
            type: "object",
            properties: {
              file_url: { type: "string", description: "URL del .dat (opcional si está en WhatsApp)" },
              filename: { type: "string" },
            },
          },
        },
      ],
      flow_agent_knowledge_bases: [
        {
          name: "life_nomina_attlog",
          description: "Flujo attlog, variables nomina, PIN empleadas.",
          knowledge_base_text: fs
            .readFileSync(path.join(root, "knowledge/life_nomina_attlog_v1.md"), "utf8")
            .trim(),
        },
        {
          name: "kapso_whatsapp_patterns",
          description: "Archivos WhatsApp, enter_waiting.",
          knowledge_base_text: fs
            .readFileSync(path.join(root, "knowledge/kapso_whatsapp_patterns_v1.md"), "utf8")
            .trim(),
        },
      ],
      flow_agent_app_integration_tools: [],
      flow_agent_webhooks: [],
      flow_agent_mcp_servers: [],
      flow_agent_resources: [],
    },
    display_name: "Agent: Staff nomina",
  },
});

addNode({
  id: "fn_validate_nomina_confirm_1745500002525",
  type: "flow-node",
  position: { x: 1100, y: 200 },
  data: {
    node_type: "function",
    config: {
      function_id: ids.validate_nomina_confirm,
      function_name: "validate-nomina-confirm",
      save_response_to: null,
    },
    display_name: "Function: validate-nomina-confirm",
  },
});

addNode({
  id: "decide_route_nomina_confirm_1745500002530",
  type: "flow-node",
  position: { x: 1280, y: 200 },
  data: {
    node_type: "decide",
    config: {
      decision_type: "function",
      conditions: [
        {
          id: "n1nomina-confirm-ok01",
          label: "nomina_confirm_ok",
          description: "Nomina confirmada, registrar cola.",
        },
        {
          id: "n2nomina-blocked-0002",
          label: "nomina_confirm_blocked",
          description: "Falta confirmacion o borrador.",
        },
      ],
      llm_configuration: {},
      function_id: ids.route_nomina_confirm,
      function_name: "route-nomina-confirm",
    },
    display_name: "Decision: nomina confirm",
  },
});

addNode({
  id: "fn_register_nomina_stub_1745500002765",
  type: "flow-node",
  position: { x: 1460, y: 160 },
  data: {
    node_type: "function",
    config: {
      function_id: ids.register_nomina_stub,
      function_name: "register-nomina-stub",
      save_response_to: null,
    },
    display_name: "Function: register-nomina-stub",
  },
});

addNode({
  id: "send_staff_nomina_ok_1745500002775",
  type: "flow-node",
  position: { x: 1640, y: 160 },
  data: {
    node_type: "send_text",
    config: {
      whatsapp_config_id: null,
      phone_number_id: null,
      message:
        "Nomina registrada en cola. Referencia: {{vars.nomina.reference}}. Periodo: {{vars.nomina.period.from}} a {{vars.nomina.period.to}}. Empleadas: {{vars.nomina.employee_count}}. Estado: por procesar (Odoo HR fase 2).",
      delay_seconds: 0,
      provider_model_id: null,
      provider_model_name: null,
      ai_field_config: {},
      to_phone_number: null,
    },
    display_name: "Confirmar nomina staff",
  },
});

addNode({
  id: "send_staff_nomina_blocked_1745500002535",
  type: "flow-node",
  position: { x: 1460, y: 280 },
  data: {
    node_type: "send_text",
    config: {
      whatsapp_config_id: null,
      phone_number_id: null,
      message:
        "Nómina no registrada: {{vars.staff.write_blocked_reason}}. Adjunte el attlog.dat, revise el resumen y escriba CONFIRMO NOMINA.",
      delay_seconds: 0,
      provider_model_id: null,
      provider_model_name: null,
      ai_field_config: {},
      to_phone_number: null,
    },
    display_name: "Nomina blocked",
  },
});

// Rewire staff entry
removeEdge((e) => e.id === "e10-user-staff-upload");
removeEdge((e) => e.source === ROUTE_USER && e.label === "staff");

addEdge("e10-user-staff-detect", ROUTE_USER, "fn_detect_staff_lane_1745500002510", "staff", "34506386-3cf9-45ad-af58-956dda675d2b");
addEdge("e10-detect-decide-lane", "fn_detect_staff_lane_1745500002510", "decide_route_staff_lane_1745500002515");
addEdge("e10-lane-pedido", "decide_route_staff_lane_1745500002515", PEDIDO_AGENT, "staff_pedido", "a1b2c3d4-staff-pedido-0001");
addEdge("e10-lane-nomina", "decide_route_staff_lane_1745500002515", "agent_staff_nomina_1745500002520", "staff_nomina", "a1b2c3d4-staff-nomina-0002");

// Nomina write chain
addEdge("e10-nomina-validate", "agent_staff_nomina_1745500002520", "fn_validate_nomina_confirm_1745500002525");
addEdge("e10-nomina-decide", "fn_validate_nomina_confirm_1745500002525", "decide_route_nomina_confirm_1745500002530");
addEdge("e10-nomina-ok-register", "decide_route_nomina_confirm_1745500002530", "fn_register_nomina_stub_1745500002765", "nomina_confirm_ok", "n1nomina-confirm-ok01");
addEdge("e10-nomina-blocked-send", "decide_route_nomina_confirm_1745500002530", "send_staff_nomina_blocked_1745500002535", "nomina_confirm_blocked", "n2nomina-blocked-0002");
addEdge("e10-nomina-register-send", "fn_register_nomina_stub_1745500002765", "send_staff_nomina_ok_1745500002775");
addEdge("e10-nomina-ok-handoff", "send_staff_nomina_ok_1745500002775", STAFF_HANDOFF);
addEdge("e10-nomina-blocked-handoff", "send_staff_nomina_blocked_1745500002535", STAFF_HANDOFF);

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + "\n");
console.log("Patched", wfPath);
console.log("nodes", wf.nodes.length, "edges", wf.edges.length);
