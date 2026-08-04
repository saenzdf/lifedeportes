#!/usr/bin/env node
/**
 * Añade carril Jump-only: asistente ingreso inbox → prepare → write silent → snapshot → handoff.
 * No toca edges del carril staff WA.
 *
 * Uso: node kapso/scripts/patch_graph_v10_inbox_ingreso.js
 */
const fs = require("fs");
const path = require("path");

const base = path.join(__dirname, "..");
const wfPath = path.join(base, "workflow_lifedeportes_sales_inbound_v10.json");
const regPath = path.join(base, "service_registry.json");

const IDS = {
  agent: "agent_inbox_ingreso_1752240100000",
  prepare: "fn_prepare_inbox_upload_1752240101000",
  compile: "fn_compile_inbox_1752240102000",
  validate: "fn_validate_inbox_1752240103000",
  decide: "decide_route_inbox_write_1752240104000",
  build: "fn_build_inbox_1752240105000",
  odoo: "fn_odoo_inbox_1752240106000",
  snapshot: "fn_snapshot_fidelity_1752240107000",
};

const EDGE_IDS = {
  agent_prepare: "e-inbox-agent-prepare",
  prepare_compile: "e-inbox-prepare-compile",
  compile_validate: "e-inbox-compile-validate",
  validate_decide: "e-inbox-validate-decide",
  decide_ok: "e-inbox-decide-ok",
  decide_blocked: "e-inbox-decide-blocked",
  build_odoo: "e-inbox-build-odoo",
  odoo_snapshot: "e-inbox-odoo-snapshot",
  snapshot_handoff: "e-inbox-snapshot-handoff",
  blocked_handoff: "e-inbox-blocked-handoff",
};

function loadReg() {
  return JSON.parse(fs.readFileSync(regPath, "utf8"));
}

function requireFn(reg, pathKeys, label) {
  let cur = reg;
  for (const k of pathKeys) cur = cur?.[k];
  const id = cur?.kapso_function_id;
  if (!id) throw new Error(`Missing function id for ${label}`);
  return { id, name: cur.kapso_function_name };
}

function main() {
  const reg = loadReg();
  const prepare = requireFn(reg, ["inbox_lane", "prepare_inbox_upload"], "prepare_inbox_upload");
  const snapshot = requireFn(reg, ["inbox_lane", "snapshot_upload_fidelity"], "snapshot_upload_fidelity");
  const compute = reg.inbox_lane?.compute_fidelity_retention;
  const compile = requireFn(reg, ["staff_write", "compile_staff_order_draft"], "compile");
  const validate = requireFn(reg, ["staff_write", "validate_staff_write"], "validate");
  const route = requireFn(reg, ["staff_write", "route_staff_write"], "route");
  const build = requireFn(reg, ["staff_write", "build_quote_payload"], "build");
  const odoo = requireFn(reg, ["staff_write", "odoo_create_lead_and_so"], "odoo");
  const search = requireFn(reg, ["odoo_catalog", "odoo_search_product_price"], "search");

  const prompt = fs
    .readFileSync(path.join(base, "prompts/agent_inbox_ingreso.md"), "utf8")
    .trim();

  const wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));
  const existing = new Set(wf.nodes.map((n) => n.id));
  const edgeExisting = new Set(wf.edges.map((e) => e.id));

  // Remove previous inbox patch if re-run
  const inboxIds = new Set(Object.values(IDS));
  wf.nodes = wf.nodes.filter((n) => !inboxIds.has(n.id));
  wf.edges = wf.edges.filter((e) => !String(e.id).startsWith("e-inbox-"));

  const condOk = "cond-inbox-write-ok";
  const condBlocked = "cond-inbox-write-blocked";

  const functionTools = [
    {
      name: "buscar_producto_odoo",
      description:
        "Resuelve producto Odoo y precio antes de confirmar subida. Usar si falta match o el staff cambia variante.",
      function_id: search.id,
      function_name: search.name,
      input_schema: {
        type: "object",
        required: ["product_text"],
        properties: {
          product_text: { type: "string" },
          quantity: { type: "number" },
          garment_type: { type: "string" },
          sport: { type: "string" },
          collar: { type: "string" },
          sleeves: { type: "string" },
          material: { type: "string" },
        },
      },
    },
    {
      name: "previsualizar_borrador_cotizacion",
      description: "Construye quote.draft_payload para revisar antes de CONFIRMO SUBIR.",
      function_id: build.id,
      function_name: build.name,
      input_schema: { type: "object", properties: {} },
    },
  ];

  if (compute?.kapso_function_id) {
    functionTools.push({
      name: "medir_fidelidad_pedido",
      description:
        "Compara fidelity.kapso_snapshot vs order_draft actual (tras sync Odoo). KPI pass_clean / retention_pct.",
      function_id: compute.kapso_function_id,
      function_name: compute.kapso_function_name,
      input_schema: { type: "object", properties: {} },
    });
  }

  const nodes = [
    {
      id: IDS.agent,
      type: "flow-node",
      position: { x: -200, y: 700 },
      data: {
        node_type: "agent",
        config: {
          system_prompt: prompt,
          provider_model_id: "b3314121-6d0b-49a7-a64d-bf0640a81476",
          provider_model_name: "moonshotai/kimi-k2.5",
          temperature: "0.0",
          max_iterations: 40,
          max_tokens: 3500,
          reasoning_effort: null,
          observer_prompt_mode: "interactive_chat",
          message_delivery_mode: "tool_only",
          enabled_default_tools: [
            "get_execution_metadata",
            "get_whatsapp_context",
            "get_current_datetime",
            "save_variable",
            "get_variable",
            "ask_about_file",
            "enter_waiting",
            "complete_task",
          ],
          default_tool_configs: {},
          sandbox_enabled: false,
          sandbox_network_mode: "allow_all",
          sandbox_allowed_outbound_hosts: [],
          flow_agent_function_tools: functionTools,
          flow_agent_app_integration_tools: [],
          flow_agent_webhooks: [],
          flow_agent_knowledge_bases: [
            {
              name: "life_reglas_comerciales",
              description: "Mínimo 6 u., hard rule borrador Odoo.",
              knowledge_base_text: fs
                .readFileSync(path.join(base, "knowledge/life_reglas_comerciales_v1.md"), "utf8")
                .slice(0, 12000),
            },
          ],
          flow_agent_mcp_servers: [],
          flow_agent_resources: [],
        },
        display_name: "Agent: Inbox ingreso pedido",
      },
    },
    {
      id: IDS.prepare,
      type: "flow-node",
      position: { x: 40, y: 700 },
      data: {
        node_type: "function",
        config: {
          function_id: prepare.id,
          function_name: prepare.name,
          save_response_to: null,
        },
        display_name: "Function: prepare-inbox-upload",
      },
    },
    {
      id: IDS.compile,
      type: "flow-node",
      position: { x: 280, y: 700 },
      data: {
        node_type: "function",
        config: {
          function_id: compile.id,
          function_name: compile.name,
          save_response_to: null,
        },
        display_name: "Function: compile (inbox)",
      },
    },
    {
      id: IDS.validate,
      type: "flow-node",
      position: { x: 520, y: 700 },
      data: {
        node_type: "function",
        config: {
          function_id: validate.id,
          function_name: validate.name,
          save_response_to: null,
        },
        display_name: "Function: validate (inbox)",
      },
    },
    {
      id: IDS.decide,
      type: "flow-node",
      position: { x: 760, y: 700 },
      data: {
        node_type: "decide",
        config: {
          decision_type: "function",
          conditions: [
            {
              id: condOk,
              label: "staff_write_ok",
              description: "Validacion OK — subir silent.",
            },
            {
              id: condBlocked,
              label: "staff_write_blocked",
              description: "Needs confirmation o blocked — volver handoff.",
            },
          ],
          llm_configuration: {},
          function_id: route.id,
          function_name: route.name,
        },
        display_name: "Decision: inbox write",
      },
    },
    {
      id: IDS.build,
      type: "flow-node",
      position: { x: 1000, y: 620 },
      data: {
        node_type: "function",
        config: {
          function_id: build.id,
          function_name: build.name,
          save_response_to: null,
        },
        display_name: "Function: build-quote (inbox)",
      },
    },
    {
      id: IDS.odoo,
      type: "flow-node",
      position: { x: 1240, y: 620 },
      data: {
        node_type: "function",
        config: {
          function_id: odoo.id,
          function_name: odoo.name,
          save_response_to: null,
        },
        display_name: "Function: odoo-create (inbox)",
      },
    },
    {
      id: IDS.snapshot,
      type: "flow-node",
      position: { x: 1480, y: 620 },
      data: {
        node_type: "function",
        config: {
          function_id: snapshot.id,
          function_name: snapshot.name,
          save_response_to: null,
        },
        display_name: "Function: snapshot-fidelity",
      },
    },
  ];

  const edges = [
    {
      id: EDGE_IDS.agent_prepare,
      source: IDS.agent,
      target: IDS.prepare,
      label: "next",
      type: "default",
      flow_condition_id: null,
    },
    {
      id: EDGE_IDS.prepare_compile,
      source: IDS.prepare,
      target: IDS.compile,
      label: "next",
      type: "default",
      flow_condition_id: null,
    },
    {
      id: EDGE_IDS.compile_validate,
      source: IDS.compile,
      target: IDS.validate,
      label: "next",
      type: "default",
      flow_condition_id: null,
    },
    {
      id: EDGE_IDS.validate_decide,
      source: IDS.validate,
      target: IDS.decide,
      label: "next",
      type: "default",
      flow_condition_id: null,
    },
    {
      id: EDGE_IDS.decide_ok,
      source: IDS.decide,
      target: IDS.build,
      label: "staff_write_ok",
      type: "default",
      flow_condition_id: condOk,
    },
    {
      id: EDGE_IDS.decide_blocked,
      source: IDS.decide,
      target: "handoff_general_1745500018000",
      label: "staff_write_blocked",
      type: "default",
      flow_condition_id: condBlocked,
    },
    {
      id: EDGE_IDS.build_odoo,
      source: IDS.build,
      target: IDS.odoo,
      label: "next",
      type: "default",
      flow_condition_id: null,
    },
    {
      id: EDGE_IDS.odoo_snapshot,
      source: IDS.odoo,
      target: IDS.snapshot,
      label: "next",
      type: "default",
      flow_condition_id: null,
    },
    {
      id: EDGE_IDS.snapshot_handoff,
      source: IDS.snapshot,
      target: "handoff_general_1745500018000",
      label: "next",
      type: "default",
      flow_condition_id: null,
    },
  ];

  wf.nodes.push(...nodes);
  wf.edges.push(...edges);

  fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        ok: true,
        added_nodes: nodes.map((n) => n.id),
        added_edges: edges.map((e) => e.id),
        jump_target: IDS.agent,
        display_name: "Agent: Inbox ingreso pedido",
      },
      null,
      2
    )
  );
}

main();
