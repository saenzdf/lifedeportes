#!/usr/bin/env node
/**
 * cleanup_staff_lane_hermes.js — retiro del carril staff legacy de Kapso (Life Deportes).
 *
 * Contexto (2026-09-16): el carril staff vive en Hermes local. Kapso despacha el
 * mensaje del staff con la function `staff-hermes-forwarder` (webhook
 * `staff-assistant`) y el agente staff embebido (`agent_1780762885818`) quedó
 * HUÉRFANO: sin edge entrante, con todo su toolset sin uso.
 *
 * Este script parte de la definition viva y:
 *   1. Quita el agente staff huérfano y su cadena muerta:
 *      route-staff-domain-guard, compile-staff-order-draft, validate-staff-write,
 *      route-staff-write, build-quote-payload, odoo-create-lead-and-so y los
 *      send_text de ese camino.
 *   2. Quita el camino legacy "CONFIRMO SUBIR" (decide_route_staff_lane_resume),
 *      para que la subida de pedidos quede 100% en Hermes (sin doble escritura).
 *   3. Reconecta `wait_staff_lane` -> `wait_staff_burst` (label `next`) para que el
 *      carril siga esperando el siguiente mensaje del staff y lo despache al forwarder.
 *
 * Uso:
 *   node kapso/scripts/cleanup_staff_lane_hermes.js --in <definition.json> --out <definition.json>
 */
import { readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";

const args = process.argv.slice(2);
const inFile = args[args.indexOf("--in") + 1];
const outFile = args[args.indexOf("--out") + 1];
if (!inFile || !outFile) {
  console.error("Uso: node cleanup_staff_lane_hermes.js --in <def.json> --out <def.json>");
  process.exit(2);
}

/** Nodos retirados (agente staff huérfano + cadena muerta + camino legacy de subida). */
const REMOVE_NODES = [
  "agent_1780762885818",
  "decide_route_staff_domain_1745500003285",
  "fn_compile_staff_order_1745500003290",
  "fn_validate_staff_write_1745500003300",
  "decide_route_staff_write_1745500003310",
  "fn_build_quote_payload_1745500002650",
  "fn_staff_upload_odoo_1745500002700",
  "decide_route_staff_lane_resume_1745500019060",
  "send_staff_lane_already_done_1745500019070",
  "send_staff_write_blocked_1745500003320",
  "send_staff_upload_ok_1745500002800",
];

/** Reenganche del carril: tras el forwarder, el flujo sigue esperando al staff. */
const NEW_EDGES = [
  {
    id: randomUUID(),
    source: "wait_staff_lane_1745500019050",
    target: "wait_staff_burst_1745500019200",
    label: "next",
    type: "default",
    flow_condition_id: null,
  },
];

const def = JSON.parse(readFileSync(inFile, "utf8"));
const remove = new Set(REMOVE_NODES);

const nodesBefore = def.nodes.length;
const edgesBefore = def.edges.length;

def.nodes = def.nodes.filter((n) => !remove.has(n.id));
const droppedEdges = def.edges.filter((e) => remove.has(e.source) || remove.has(e.target));
def.edges = def.edges.filter((e) => !remove.has(e.source) && !remove.has(e.target));
def.edges.push(...NEW_EDGES);

// Guardas: nada puede quedar apuntando a un nodo retirado.
const ids = new Set(def.nodes.map((n) => n.id));
for (const e of def.edges) {
  if (!ids.has(e.source)) throw new Error(`edge source colgado: ${e.source}`);
  if (!ids.has(e.target)) throw new Error(`edge target colgado: ${e.target}`);
}
for (const id of REMOVE_NODES) {
  if (ids.has(id)) throw new Error(`nodo no retirado: ${id}`);
}

writeFileSync(outFile, JSON.stringify(def, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      ok: true,
      nodes: `${nodesBefore} -> ${def.nodes.length}`,
      edges: `${edgesBefore} -> ${def.edges.length}`,
      removed_nodes: REMOVE_NODES,
      dropped_edges: droppedEdges.map((e) => `${e.source} --[${e.label}]--> ${e.target}`),
      added_edges: NEW_EDGES.map((e) => `${e.source} --[${e.label}]--> ${e.target}`),
    },
    null,
    2
  )
);
