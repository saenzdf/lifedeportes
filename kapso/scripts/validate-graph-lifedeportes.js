#!/usr/bin/env node
/**
 * Validación Kapso Life Deportes — ejecutar ANTES de update-graph.
 * Combina reglas Kapso base + anti-basura (huérfanos, edges duplicados, functions archivadas).
 */
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kapsoRoot = path.resolve(__dirname, "..");

const ARCHIVED_FUNCTION_NAMES = new Set([
  // Carril staff legacy (retirado 2026-09-16: el staff vive en Hermes local).
  "route-staff-registration",
  "route-staff-entry",
  "route-staff-post",
  "detect-staff-upload-command",
  "detect-staff-lane",
  "route-staff-lane",
  "route-staff-lane-resume",
  "route-staff-domain-guard",
  "compile-staff-order-draft",
  "validate-staff-write",
  "route-staff-write",
  "build-quote-payload",
  "odoo-create-lead-and-so",
  "get-service-status",
  "sync-order-draft-from-odoo",
  "prepare-inbox-upload",
  "staff-sales-notify-reply",
  "buscar-pedido-odoo",
  "corregir-pedido-odoo",
  "buscar-oportunidad-odoo",
  "buscar-conversacion-kapso",
  "clasificar-adjuntos-pedido",
  "parsear-lista-excel-pedido",
  "parsear-lista-texto-pedido",
  "parsear-lista-imagen-pedido",
  "parsear-lista-pdf-pedido",
  "registrar-adjuntos-pedido",
  "fusionar-borrador-lista",
  "enviar-retomar-pedido",
  "parse-nomina-attlog",
  "confirmar-nomina",
  "crear-compra-odoo",
  "route-nomina-confirm",
  "validate-nomina-confirm",
  "register-nomina-stub",
  "mark-maintenance-sent",
  "route-customer-entry",
  "route-customer-paused",
  "compute-fidelity-retention",
  "snapshot-upload-fidelity",
  "seed-crm-awaiting",
]);

const CUSTOMER_LANE_ORPHAN_OK = new Set([
  "fn_classify_contact_odoo_1745500002550",
  "wait_customer_burst_1745500002580",
  "decide_route_customer_burst_resume_1745500002585",
  "fn_ensure_crm_from_quote_1745500002590",
  "decide_route_customer_sales_whitelist_1745500019100",
  "decide_route_customer_paused_1745500019020",
  "send_customer_lane_paused_1745500019000",
  "fn_mark_maintenance_sent_1745500019030",
  "wait_customer_paused_1745500019040",
  "agent_orquestador_1745500003000",
]);

/**
 * Cadena silent/fidelity Jump-opcional (prepare→…→snapshot).
 * El Agent Inbox se retiró: Jump → Agent Staff unificado.
 */
const INBOX_JUMP_ORPHAN_OK = new Set([
  "fn_prepare_inbox_upload_1752240101000",
  "fn_compile_inbox_1752240102000",
  "fn_validate_inbox_1752240103000",
  "decide_route_inbox_write_1752240104000",
  "fn_build_inbox_1752240105000",
  "fn_odoo_inbox_1752240106000",
  "fn_snapshot_fidelity_1752240107000",
]);

const ORPHAN_OK = new Set([...CUSTOMER_LANE_ORPHAN_OK, ...INBOX_JUMP_ORPHAN_OK]);

function loadDefinition(definitionFile) {
  const raw = readFileSync(definitionFile, "utf8");
  return JSON.parse(raw);
}

function reachableFromStart(nodes, edges) {
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source).push(e.target);
  }
  const seen = new Set();
  const stack = ["start"];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const t of adj.get(id) || []) stack.push(t);
  }
  return seen;
}

function getFunctionName(node) {
  const nt = node?.data?.node_type;
  if (nt === "function") return node?.data?.config?.function_name || null;
  if (nt === "decide" && node?.data?.config?.decision_type === "function") {
    return node?.data?.config?.function_name || null;
  }
  return null;
}

function validateLife(definition) {
  const errors = [];
  const warnings = [];
  const nodes = definition.nodes || [];
  const edges = definition.edges || [];
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Duplicados source+label
  const edgeKeys = new Map();
  for (const e of edges) {
    const key = `${e.source}::${e.label}`;
    if (edgeKeys.has(key)) {
      errors.push(
        `duplicate edge: ${e.source} --[${e.label}]--> ${e.target} (also ${edgeKeys.get(key)})`
      );
    } else {
      edgeKeys.set(key, e.target);
    }
  }

  // Huérfanos (sin entrada, no start)
  const hasIncoming = new Set(edges.map((e) => e.target));
  for (const n of nodes) {
    if (n.id === "start") continue;
    if (!hasIncoming.has(n.id) && !ORPHAN_OK.has(n.id)) {
      errors.push(`orphan node (no incoming edges): ${n.id} (${n.data?.display_name || ""})`);
    }
  }

  // Inalcanzables desde start
  const reach = reachableFromStart(nodes, edges);
  for (const n of nodes) {
    if (n.id === "start") continue;
    if (!reach.has(n.id) && !ORPHAN_OK.has(n.id)) {
      warnings.push(`unreachable from start: ${n.id}`);
    }
    if (!reach.has(n.id) && CUSTOMER_LANE_ORPHAN_OK.has(n.id)) {
      warnings.push(`customer lane idle (staff_only ok): ${n.id}`);
    }
    if (!reach.has(n.id) && INBOX_JUMP_ORPHAN_OK.has(n.id)) {
      warnings.push(`inbox jump lane (Jump-to-node ok): ${n.id}`);
    }
  }

  // Functions archivadas en grafo
  for (const n of nodes) {
    const fn = getFunctionName(n);
    if (fn && ARCHIVED_FUNCTION_NAMES.has(fn)) {
      errors.push(`archived function still in graph: ${fn} on node ${n.id}`);
    }
  }

  // Staff activo: el carril staff lo atiende Hermes local vía staff-hermes-forwarder.
  // El agente staff embebido (agent_1780762885818) quedó huérfano y se retiró 2026-09-16.
  const requiredStaff = [
    "fn_staff_hermes_forwarder",
    "wait_staff_lane_1745500019050",
    "wait_staff_burst_1745500019200",
  ];
  for (const id of requiredStaff) {
    if (!nodeIds.has(id)) errors.push(`missing required staff node: ${id}`);
  }

  // Edges muertos (target/source inexistente) — redundante con base pero explícito
  for (const e of edges) {
    if (!nodeIds.has(e.source)) errors.push(`edge source missing node: ${e.source}`);
    if (!nodeIds.has(e.target)) errors.push(`edge target missing node: ${e.target}`);
  }

  return { errors, warnings };
}

function runBaseValidate(definitionFile) {
  const baseScript = path.resolve(
    kapsoRoot,
    "../../.agents/skills/automate-whatsapp/scripts/validate-graph.js"
  );
  if (!existsSync(baseScript)) {
    return { ok: false, skip: true, reason: "base validate-graph.js not found" };
  }
  const r = spawnSync("node", [baseScript, "--definition-file", definitionFile], {
    encoding: "utf8",
  });
  try {
    const json = JSON.parse(r.stdout);
    return { ok: json.ok && json.data?.valid, data: json.data, stderr: r.stderr };
  } catch {
    return { ok: false, raw: r.stdout, stderr: r.stderr };
  }
}

function main() {
  const definitionFile =
    process.argv[2] || path.join(kapsoRoot, "workflow_lifedeportes_sales_inbound_v10.json");

  if (!existsSync(definitionFile)) {
    console.error("File not found:", definitionFile);
    process.exit(2);
  }

  const definition = loadDefinition(definitionFile);
  const life = validateLife(definition);
  const base = runBaseValidate(definitionFile);

  const baseErrors = base.data?.errors || [];
  const baseWarnings = base.data?.warnings || [];
  const allErrors = [...baseErrors, ...life.errors];
  const allWarnings = [...baseWarnings, ...life.warnings];
  const valid = allErrors.length === 0 && (base.ok !== false || base.skip);

  const report = {
    file: definitionFile,
    valid,
    stats: {
      nodes: definition.nodes?.length,
      edges: definition.edges?.length,
      ...(base.data?.stats || {}),
    },
    errors: allErrors,
    warnings: allWarnings,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(valid ? 0 : 1);
}

main();
