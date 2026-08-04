#!/usr/bin/env node
/**
 * Ventas solo whitelist (Diego 3000000047) — resto a mantenimiento.
 *
 * Kapso CF function deploys están rotos (jul 2026), así que el gate de teléfono
 * usa Decide AI; el mensaje de mantenimiento sigue con route-customer-paused
 * (worker viejo: send_message / already_notified).
 *
 *   node kapso/scripts/sales_tester_mode.js status|enable|disable|handoff-active
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const registryPath = path.join(root, "service_registry.json");
const statePath = path.join(root, "sales_tester_mode.state.json");
const projectRoot = path.join(root, "..");

const WORKFLOW_ID =
  JSON.parse(fs.readFileSync(registryPath, "utf8"))?.kapso?.workflow_id ||
  "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6";

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const FN_ROUTE_CUSTOMER_PAUSED =
  registry?.customer_paused?.route_customer_paused?.kapso_function_id || null;
const FN_MARK_MAINTENANCE_SENT =
  registry?.customer_paused?.mark_maintenance_sent?.kapso_function_id || null;

const DECIDE_ROUTE_USER = "decide_route_user_entry_1745500002450";
const CLASSIFY_NODE = "fn_classify_contact_odoo_1745500002550";
const DECIDE_SALES_WHITELIST_AI = "decide_sales_whitelist_ai_1745500019010";
const PAUSED_SEND_NODE = "send_customer_lane_paused_1745500019000";
const DECIDE_ROUTE_CUSTOMER_PAUSED = "decide_route_customer_paused_1745500019020";
const FN_MARK_MAINTENANCE_NODE = "fn_mark_maintenance_sent_1745500019030";
const WAIT_CUSTOMER_PAUSED = "wait_customer_paused_1745500019040";

const EDGE_SEND_MESSAGE = "d8e9f0a1-2345-6789-abcd-ef0123456701";
const EDGE_ALREADY_NOTIFIED = "d8e9f0a1-2345-6789-abcd-ef0123456702";
const EDGE_SALES_ALLOWED = "d8e9f0a1-2345-6789-abcd-ef0123456703";
const EDGE_MAINTENANCE = "d8e9f0a1-2345-6789-abcd-ef0123456704";

const MODEL_GEMINI_FLASH = {
  provider_model_id: "4991a45f-a334-48a7-9d50-ec590dc2e241",
  provider_model_name: "google/gemini-3-flash-preview",
};

const PAUSED_SUBGRAPH_NODE_IDS = [
  DECIDE_SALES_WHITELIST_AI,
  DECIDE_ROUTE_CUSTOMER_PAUSED,
  PAUSED_SEND_NODE,
  FN_MARK_MAINTENANCE_NODE,
  WAIT_CUSTOMER_PAUSED,
];

const PAUSED_MESSAGE =
  "Hola, mucho gusto. Este WhatsApp de Life Deportes (asistente) está en mantenimiento temporalmente. Para cotizar y recibir atención comercial, escríbenos a nuestros vendedores: 310 336 2484 o 321 398 8464. Con gusto te atendemos.";

const CUSTOMER_WAIT_STEPS =
  /orquestador|customer_history|wait_customer|customer_burst|customer_paused|agent_orquestador|agent_customer_history/i;

async function kapsoFetch(apiPath, init = {}) {
  const base = process.env.KAPSO_API_BASE_URL?.replace(/\/$/, "");
  const key = process.env.KAPSO_API_KEY;
  if (!base || !key) throw new Error("Missing KAPSO_API_BASE_URL or KAPSO_API_KEY");
  const resp = await fetch(`${base}${apiPath}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": key,
      ...(init.headers || {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await resp.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, json };
}

function requireIds() {
  if (!FN_ROUTE_CUSTOMER_PAUSED || !FN_MARK_MAINTENANCE_SENT) {
    throw new Error("Missing customer_paused function IDs in service_registry.json");
  }
}

function upsertNode(definition, node) {
  const idx = definition.nodes.findIndex((n) => n.id === node.id);
  if (idx >= 0) definition.nodes[idx] = node;
  else definition.nodes.push(node);
}

function upsertEdge(definition, edge) {
  // Dedupar por id O por source+label (ids viejos de staff_only_mode chocan).
  const idx = definition.edges.findIndex(
    (e) =>
      e.id === edge.id ||
      (e.source === edge.source &&
        String(e.label || "") === String(edge.label || "") &&
        edge.label != null)
  );
  if (idx >= 0) definition.edges[idx] = edge;
  else definition.edges.push(edge);
}

function pruneDuplicatePausedEdges(definition) {
  const seen = new Set();
  definition.edges = definition.edges.filter((e) => {
    if (!PAUSED_SUBGRAPH_NODE_IDS.includes(e.source) && !PAUSED_SUBGRAPH_NODE_IDS.includes(e.target)) {
      return true;
    }
    const key = `${e.source}::${e.label || "next"}::${e.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pausedSubgraphNodes() {
  return [
    {
      id: DECIDE_SALES_WHITELIST_AI,
      type: "flow-node",
      position: { x: 620, y: -120 },
      data: {
        node_type: "decide",
        config: {
          decision_type: "ai",
          ...MODEL_GEMINI_FLASH,
          llm_temperature: 0,
          llm_max_tokens: 256,
          conditions: [
            {
              id: EDGE_MAINTENANCE,
              label: "maintenance",
              description:
                "DEFAULT. Choose when the WhatsApp conversation phone_number is NOT Diego's tester. Match last 10 digits; allow only 3000000047. Do NOT use message text or intent. Everyone else → maintenance.",
            },
            {
              id: EDGE_SALES_ALLOWED,
              label: "sales_allowed",
              description:
                "Choose ONLY if conversation phone_number ends with 3000000047 (or is 3000000047). This is a phone whitelist for Diego Saenz tester → sales agent. Ignore message content completely.",
            },
          ],
          llm_configuration: {},
        },
        display_name: "Decision: sales whitelist AI (Diego only)",
      },
    },
    {
      id: DECIDE_ROUTE_CUSTOMER_PAUSED,
      type: "flow-node",
      position: { x: 820, y: -120 },
      data: {
        node_type: "decide",
        config: {
          decision_type: "function",
          conditions: [
            {
              id: EDGE_SEND_MESSAGE,
              label: "send_message",
              description: "Primera vez: enviar mensaje de mantenimiento.",
            },
            {
              id: EDGE_ALREADY_NOTIFIED,
              label: "already_notified",
              description: "Ya se envió mantenimiento; solo esperar.",
            },
          ],
          llm_configuration: {},
          function_id: FN_ROUTE_CUSTOMER_PAUSED,
          function_name: "route-customer-paused",
        },
        display_name: "Decision: route-customer-paused (mantenimiento)",
      },
    },
    {
      id: PAUSED_SEND_NODE,
      type: "flow-node",
      position: { x: 1080, y: -120 },
      data: {
        node_type: "send_text",
        config: {
          whatsapp_config_id: null,
          phone_number_id: null,
          message: PAUSED_MESSAGE,
          delay_seconds: 0,
          provider_model_id: null,
          provider_model_name: null,
          ai_field_config: {},
          to_phone_number: null,
        },
        display_name: "Send: cliente en pausa (mantenimiento)",
      },
    },
    {
      id: FN_MARK_MAINTENANCE_NODE,
      type: "flow-node",
      position: { x: 1320, y: -120 },
      data: {
        node_type: "function",
        config: {
          function_id: FN_MARK_MAINTENANCE_SENT,
          function_name: "mark-maintenance-sent",
          save_response_to: null,
        },
        display_name: "Function: mark-maintenance-sent",
      },
    },
    {
      id: WAIT_CUSTOMER_PAUSED,
      type: "flow-node",
      position: { x: 1560, y: -40 },
      data: {
        node_type: "wait_for_response",
        config: { save_response_to: "customer_paused_reply" },
        display_name: "Wait: cliente en pausa",
      },
    },
  ];
}

function pausedSubgraphEdges() {
  return [
    {
      id: "e10-ai-sales-allowed",
      source: DECIDE_SALES_WHITELIST_AI,
      target: CLASSIFY_NODE,
      label: "sales_allowed",
      type: "default",
      flow_condition_id: EDGE_SALES_ALLOWED,
    },
    {
      id: "e10-ai-maintenance",
      source: DECIDE_SALES_WHITELIST_AI,
      target: DECIDE_ROUTE_CUSTOMER_PAUSED,
      label: "maintenance",
      type: "default",
      flow_condition_id: EDGE_MAINTENANCE,
    },
    {
      id: "e10-paused-send-message",
      source: DECIDE_ROUTE_CUSTOMER_PAUSED,
      target: PAUSED_SEND_NODE,
      label: "send_message",
      type: "default",
      flow_condition_id: EDGE_SEND_MESSAGE,
    },
    {
      id: "e10-paused-already-wait",
      source: DECIDE_ROUTE_CUSTOMER_PAUSED,
      target: WAIT_CUSTOMER_PAUSED,
      label: "already_notified",
      type: "default",
      flow_condition_id: EDGE_ALREADY_NOTIFIED,
    },
    {
      id: "e10-paused-send-mark",
      source: PAUSED_SEND_NODE,
      target: FN_MARK_MAINTENANCE_NODE,
      label: "next",
      type: "default",
      flow_condition_id: null,
    },
    {
      id: "e10-paused-mark-wait",
      source: FN_MARK_MAINTENANCE_NODE,
      target: WAIT_CUSTOMER_PAUSED,
      label: "next",
      type: "default",
      flow_condition_id: null,
    },
  ];
}

function findCustomerEdge(definition) {
  return definition.edges.find(
    (e) => e.source === DECIDE_ROUTE_USER && e.label === "customer"
  );
}

function isSalesTesterActive(definition) {
  const edge = findCustomerEdge(definition);
  const hasAiGate = definition.nodes.some((n) => n.id === DECIDE_SALES_WHITELIST_AI);
  const hasSalesEdge = definition.edges.some(
    (e) => e.source === DECIDE_SALES_WHITELIST_AI && e.label === "sales_allowed"
  );
  return (
    (edge?.target === DECIDE_SALES_WHITELIST_AI ||
      edge?.target === DECIDE_ROUTE_CUSTOMER_PAUSED) &&
    hasAiGate &&
    hasSalesEdge
  );
}

function removePausedSubgraph(definition) {
  definition.nodes = definition.nodes.filter((n) => !PAUSED_SUBGRAPH_NODE_IDS.includes(n.id));
  definition.edges = definition.edges.filter(
    (e) =>
      !PAUSED_SUBGRAPH_NODE_IDS.includes(e.source) &&
      !PAUSED_SUBGRAPH_NODE_IDS.includes(e.target)
  );
}

function patchEnable(definition) {
  requireIds();
  const edge = findCustomerEdge(definition);
  if (!edge) throw new Error("Customer edge not found");
  const originalTarget =
    edge.target === DECIDE_SALES_WHITELIST_AI ||
    edge.target === DECIDE_ROUTE_CUSTOMER_PAUSED ||
    edge.target === PAUSED_SEND_NODE
      ? CLASSIFY_NODE
      : edge.target;

  // Quitar edge viejo sales_allowed desde paused (si quedó de un enable anterior).
  definition.edges = definition.edges.filter(
    (e) => !(e.source === DECIDE_ROUTE_CUSTOMER_PAUSED && e.label === "sales_allowed")
  );

  for (const node of pausedSubgraphNodes()) upsertNode(definition, node);
  for (const e of pausedSubgraphEdges()) upsertEdge(definition, e);
  pruneDuplicatePausedEdges(definition);
  edge.target = DECIDE_SALES_WHITELIST_AI;

  return {
    enabled: true,
    original_customer_target: originalTarget,
    sales_whitelist: ["3000000047"],
    customer_edge_target: DECIDE_SALES_WHITELIST_AI,
    gate: "ai_phone_whitelist",
  };
}

function patchDisable(definition, state) {
  const edge = findCustomerEdge(definition);
  if (!edge) throw new Error("Customer edge not found");
  const restoreTarget = state?.original_customer_target || CLASSIFY_NODE;
  edge.target = restoreTarget;
  removePausedSubgraph(definition);
  return { enabled: false, restored_target: restoreTarget };
}

async function fetchWorkflowBundle() {
  const defRes = await kapsoFetch(`/platform/v1/workflows/${WORKFLOW_ID}/definition`);
  if (!defRes.ok) throw new Error(`workflow definition failed: ${defRes.status}`);
  const workflow = defRes.json?.data || defRes.json;
  return { lockVersion: workflow.lock_version, definition: workflow.definition };
}

async function publishDefinition(definition, expectedLockVersion) {
  const current = await kapsoFetch(`/platform/v1/workflows/${WORKFLOW_ID}`);
  if (!current.ok) throw new Error(`lock check failed: ${current.status}`);
  const currentLock = current.json?.data?.lock_version ?? current.json?.lock_version;
  if (currentLock !== expectedLockVersion) {
    throw new Error(`Lock conflict: expected ${expectedLockVersion}, current ${currentLock}`);
  }
  const update = await kapsoFetch(`/platform/v1/workflows/${WORKFLOW_ID}`, {
    method: "PATCH",
    body: { workflow: { definition } },
  });
  if (!update.ok) {
    throw new Error(`update graph failed (${update.status}): ${JSON.stringify(update.json)}`);
  }
  return update.json?.data || update.json;
}

function listExecutions(status, limit = 50) {
  const script = path.join(
    projectRoot,
    ".agents/skills/automate-whatsapp/scripts/list-executions.js"
  );
  const r = spawnSync(
    "node",
    [script, "--workflow-id", WORKFLOW_ID, "--status", status, "--limit", String(limit)],
    { encoding: "utf8", timeout: 90000 }
  );
  try {
    return JSON.parse(r.stdout || "{}");
  } catch {
    return { data: { executions: [] } };
  }
}

function handoffActiveCustomerExecs() {
  const updateScript = path.join(
    projectRoot,
    ".agents/skills/automate-whatsapp/scripts/update-execution-status.js"
  );
  const results = [];
  for (const status of ["waiting", "running"]) {
    const listed = listExecutions(status, 100);
    for (const e of listed?.data?.executions || []) {
      const step = e?.current_step?.identifier || "";
      if (/wait_staff|staff_|agent_178076|inbox_ingreso|nomina/i.test(step)) continue;
      // Customer lane, paused waits, orquestrator, or empty step (new executions).
      if (
        status === "waiting" &&
        step &&
        !CUSTOMER_WAIT_STEPS.test(step) &&
        !/agent_|wait_customer|burst|classify|vendedor/i.test(step)
      ) {
        continue;
      }
      const r = spawnSync("node", [updateScript, e.id, "--status", "handoff"], {
        encoding: "utf8",
        timeout: 30000,
      });
      let ok = false;
      try {
        ok = JSON.parse(r.stdout || "{}").ok === true;
      } catch {
        ok = r.status === 0;
      }
      results.push({
        id: e.id,
        from: status,
        step: step || null,
        conv: e.whatsapp_conversation_id || null,
        ok,
      });
    }
  }
  return results;
}

async function deployPausedFunction() {
  // Kapso CF deploys están rotos (draft forever / last_deployed_at no avanza).
  // El gate usa Decide AI; route-customer-paused worker viejo basta para mantenimiento.
  return { skipped: true, reason: "kapso_cf_deploy_broken_use_ai_gate" };
}

async function main() {
  const action = (process.argv[2] || "status").toLowerCase();

  if (action === "handoff-active") {
    const results = handoffActiveCustomerExecs();
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "handoff-active",
          handed_off: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
          results,
        },
        null,
        2
      )
    );
    return;
  }

  const { lockVersion, definition } = await fetchWorkflowBundle();
  const active = isSalesTesterActive(definition);

  if (action === "status") {
    console.log(
      JSON.stringify(
        {
          workflow_id: WORKFLOW_ID,
          lock_version: lockVersion,
          sales_tester_active: active,
          customer_edge_target: findCustomerEdge(definition)?.target,
          whitelist: ["3000000047"],
          sales_gate: "ai_phone_whitelist",
          ai_gate_node: DECIDE_SALES_WHITELIST_AI,
          paused_router: DECIDE_ROUTE_CUSTOMER_PAUSED,
          classify_node: CLASSIFY_NODE,
          state_file: fs.existsSync(statePath) ? statePath : null,
        },
        null,
        2
      )
    );
    return;
  }

  let patchMeta;
  const nextDefinition = JSON.parse(JSON.stringify(definition));

  if (action === "enable") {
    if (!process.argv.includes("--i-know-this-blocks-production")) {
      throw new Error(
        "Refused: enable blocks all sales except whitelist. Re-run with --i-know-this-blocks-production"
      );
    }
    await deployPausedFunction();
    patchMeta = patchEnable(nextDefinition);
    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          enabled_at: new Date().toISOString(),
          workflow_id: WORKFLOW_ID,
          lock_version_before: lockVersion,
          ...patchMeta,
        },
        null,
        2
      )
    );
  } else if (action === "disable") {
    if (!active && findCustomerEdge(definition)?.target === CLASSIFY_NODE) {
      console.log(
        JSON.stringify({ ok: true, message: "Sales tester mode not active", lock_version: lockVersion }, null, 2)
      );
      return;
    }
    const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : null;
    patchMeta = patchDisable(nextDefinition, state);
    if (fs.existsSync(statePath)) {
      const archived = JSON.parse(fs.readFileSync(statePath, "utf8"));
      archived.disabled_at = new Date().toISOString();
      fs.writeFileSync(statePath.replace(".json", ".last.json"), JSON.stringify(archived, null, 2));
      fs.unlinkSync(statePath);
    }
  } else {
    throw new Error(`Unknown action: ${action}. Use status | enable | disable | handoff-active`);
  }

  // refresh lock after function deploy
  const fresh = await fetchWorkflowBundle();
  const updated = await publishDefinition(nextDefinition, fresh.lockVersion);
  const localGraph = path.join(root, "workflow_lifedeportes_sales_inbound_v10.json");
  fs.writeFileSync(localGraph, JSON.stringify(nextDefinition, null, 2) + "\n");

  registry.kapso = registry.kapso || {};
  registry.kapso.sales_tester_mode = action === "enable";
  registry.kapso.workflow_lock_version = updated.lock_version;
  registry.kapso.staff_only_mode = false;
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");

  console.log(
    JSON.stringify(
      {
        ok: true,
        action,
        sales_tester_active: action === "enable",
        lock_version_before: lockVersion,
        lock_version_after: updated.lock_version,
        patch: patchMeta,
        local_graph: localGraph,
        note:
          action === "enable"
            ? "Diego 3000000047 → ventas; resto → mantenimiento"
            : "Carril cliente restaurado para todos",
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
