#!/usr/bin/env node
/**
 * Activa o desactiva modo solo-staff en el grafo vivo de Kapso.
 *
 * Enable/sync: edge customer → router pausa (mensaje 1 vez + wait_for_response).
 * Disable: restaura el edge hacia classify-contact-odoo.
 *
 * Usage (desde lifedeportes/, con .env cargado):
 *   node kapso/scripts/staff_only_mode.js status
 *   node kapso/scripts/staff_only_mode.js enable
 *   node kapso/scripts/staff_only_mode.js sync
 *   node kapso/scripts/staff_only_mode.js disable
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const registryPath = path.join(root, "service_registry.json");
const statePath = path.join(root, "staff_only_mode.state.json");

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
const PAUSED_SEND_NODE = "send_customer_lane_paused_1745500019000";
const DECIDE_ROUTE_CUSTOMER_PAUSED = "decide_route_customer_paused_1745500019020";
const FN_MARK_MAINTENANCE_NODE = "fn_mark_maintenance_sent_1745500019030";
const WAIT_CUSTOMER_PAUSED = "wait_customer_paused_1745500019040";

const PAUSED_SUBGRAPH_NODE_IDS = [
  DECIDE_ROUTE_CUSTOMER_PAUSED,
  PAUSED_SEND_NODE,
  FN_MARK_MAINTENANCE_NODE,
  WAIT_CUSTOMER_PAUSED,
];

const EDGE_SEND_MESSAGE = "d8e9f0a1-2345-6789-abcd-ef0123456701";
const EDGE_ALREADY_NOTIFIED = "d8e9f0a1-2345-6789-abcd-ef0123456702";

const PAUSED_MESSAGE =
  "Hola, mucho gusto. Este WhatsApp de Life Deportes (asistente) está en mantenimiento temporalmente. Para cotizar y recibir atención comercial, escríbenos a nuestros vendedores: 310 336 2484 o 321 398 8464. Con gusto te atendemos.";

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

function requireFunctionIds() {
  if (!FN_ROUTE_CUSTOMER_PAUSED || !FN_MARK_MAINTENANCE_SENT) {
    throw new Error(
      "Missing customer_paused function IDs in service_registry.json — run deploy of route-customer-paused and mark-maintenance-sent first"
    );
  }
}

function pausedSubgraphNodes() {
  requireFunctionIds();
  return [
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
        display_name: "Decision: route-customer-paused",
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
        display_name: "Send: cliente en pausa (staff-only)",
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

function upsertNode(definition, node) {
  const idx = definition.nodes.findIndex((n) => n.id === node.id);
  if (idx >= 0) definition.nodes[idx] = node;
  else definition.nodes.push(node);
}

function upsertEdge(definition, edge) {
  const idx = definition.edges.findIndex((e) => e.id === edge.id);
  if (idx >= 0) definition.edges[idx] = edge;
  else definition.edges.push(edge);
}

function removePausedSubgraph(definition) {
  definition.nodes = definition.nodes.filter((n) => !PAUSED_SUBGRAPH_NODE_IDS.includes(n.id));
  definition.edges = definition.edges.filter(
    (e) =>
      !PAUSED_SUBGRAPH_NODE_IDS.includes(e.source) &&
      !PAUSED_SUBGRAPH_NODE_IDS.includes(e.target)
  );
}

function findCustomerEdge(definition) {
  return definition.edges.find(
    (e) => e.source === DECIDE_ROUTE_USER && e.label === "customer"
  );
}

function isStaffOnlyActive(definition) {
  const edge = findCustomerEdge(definition);
  return (
    edge?.target === DECIDE_ROUTE_CUSTOMER_PAUSED || edge?.target === PAUSED_SEND_NODE
  );
}

function usesLegacyPausedTarget(definition) {
  return findCustomerEdge(definition)?.target === PAUSED_SEND_NODE;
}

function patchEnable(definition) {
  const edge = findCustomerEdge(definition);
  if (!edge) throw new Error("Customer edge not found on decide_route_user_entry");
  const originalTarget =
    edge.target === DECIDE_ROUTE_CUSTOMER_PAUSED || edge.target === PAUSED_SEND_NODE
      ? CLASSIFY_NODE
      : edge.target;

  for (const node of pausedSubgraphNodes()) upsertNode(definition, node);
  for (const subgraphEdge of pausedSubgraphEdges()) upsertEdge(definition, subgraphEdge);
  edge.target = DECIDE_ROUTE_CUSTOMER_PAUSED;

  return {
    enabled: true,
    original_customer_target: originalTarget,
    customer_edge_id: edge.id,
    paused_router: DECIDE_ROUTE_CUSTOMER_PAUSED,
  };
}

function patchDisable(definition, state) {
  const edge = findCustomerEdge(definition);
  if (!edge) throw new Error("Customer edge not found on decide_route_user_entry");
  const restoreTarget = state?.original_customer_target || CLASSIFY_NODE;
  edge.target = restoreTarget;
  removePausedSubgraph(definition);
  return { enabled: false, restored_target: restoreTarget };
}

async function fetchWorkflowBundle() {
  const meta = await kapsoFetch(`/platform/v1/workflows/${WORKFLOW_ID}`);
  if (!meta.ok) throw new Error(`workflow meta failed: ${meta.status}`);
  const defRes = await kapsoFetch(`/platform/v1/workflows/${WORKFLOW_ID}/definition`);
  if (!defRes.ok) throw new Error(`workflow definition failed: ${defRes.status}`);
  const workflow = defRes.json?.data || defRes.json;
  return {
    lockVersion: workflow.lock_version,
    definition: workflow.definition,
    workflowMeta: meta.json?.data || meta.json,
  };
}

async function publishDefinition(definition, expectedLockVersion) {
  const current = await kapsoFetch(`/platform/v1/workflows/${WORKFLOW_ID}`);
  if (!current.ok) throw new Error(`lock check failed: ${current.status}`);
  const currentLock = current.json?.data?.lock_version ?? current.json?.lock_version;
  if (currentLock !== expectedLockVersion) {
    throw new Error(
      `Lock conflict: expected ${expectedLockVersion}, current ${currentLock}. Re-run status and retry.`
    );
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

async function main() {
  const action = (process.argv[2] || "status").toLowerCase();
  const { lockVersion, definition } = await fetchWorkflowBundle();
  const active = isStaffOnlyActive(definition);
  const legacy = usesLegacyPausedTarget(definition);

  if (action === "status") {
    console.log(
      JSON.stringify(
        {
          workflow_id: WORKFLOW_ID,
          lock_version: lockVersion,
          staff_only_active: active,
          legacy_direct_send: legacy,
          customer_edge_target: findCustomerEdge(definition)?.target,
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

  if (action === "enable" || action === "sync") {
    if (active && !legacy && action === "enable") {
      console.log(
        JSON.stringify(
          { ok: true, message: "Staff-only already active (router v2)", lock_version: lockVersion },
          null,
          2
        )
      );
      return;
    }
    patchMeta = patchEnable(nextDefinition);
    if (!fs.existsSync(statePath)) {
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
    }
  } else if (action === "disable") {
    if (!active) {
      console.log(JSON.stringify({ ok: true, message: "Staff-only not active", lock_version: lockVersion }, null, 2));
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
    throw new Error(`Unknown action: ${action}. Use status | enable | sync | disable`);
  }

  const updated = await publishDefinition(nextDefinition, lockVersion);
  const localGraph = path.join(root, "workflow_lifedeportes_sales_inbound_v10.json");
  fs.writeFileSync(localGraph, JSON.stringify(nextDefinition, null, 2) + "\n");

  console.log(
    JSON.stringify(
      {
        ok: true,
        action,
        staff_only_active: action !== "disable",
        lock_version_before: lockVersion,
        lock_version_after: updated.lock_version,
        patch: patchMeta,
        local_graph: localGraph,
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
