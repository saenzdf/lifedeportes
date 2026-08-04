#!/usr/bin/env node
/** Ajustes v10 staff pedido: mensajes sin handoff humano, wait en lugar de handoff. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wfPath = path.join(__dirname, "..", "workflow_lifedeportes_sales_inbound_v10.json");
const wf = JSON.parse(fs.readFileSync(wfPath, "utf8"));

const WAIT_STAFF = "wait_staff_lane_1745500019050";
const HANDOFF_STAFF = "handoff_staff_1745500018100";
const SEND_OK = "send_staff_upload_ok_1745500002800";
const SEND_BLOCKED = "send_staff_write_blocked_1745500003320";

const messagePatches = {
  [SEND_OK]: {
    message:
      "Listo, el borrador del pedido ha sido registrado correctamente. Si la lista de nombres o tallas quedó pendiente, puede completarla antes de confirmar la producción.",
  },
  [SEND_BLOCKED]: {
    message:
      "Para subir el borrador: escriba CONFIRMO SUBIR o «confirmo y sube» (o complete los datos pendientes del pedido).",
  },
};

for (const node of wf.nodes) {
  const p = messagePatches[node.id];
  if (!p) continue;
  if (p.message) node.data.config.message = p.message;
}

if (!wf.nodes.some((n) => n.id === WAIT_STAFF)) {
  wf.nodes.push({
    id: WAIT_STAFF,
    type: "flow-node",
    position: { x: 1720, y: 720 },
    data: {
      node_type: "wait_for_response",
      config: {
        has_timeout: false,
        timeout_seconds: null,
        save_response_to: "staff_lane_reply",
      },
      display_name: "Wait: staff pedido",
    },
  });
}

const retarget = new Map([
  [SEND_OK, WAIT_STAFF],
  [SEND_BLOCKED, WAIT_STAFF],
]);

for (const edge of wf.edges) {
  const next = retarget.get(edge.source);
  if (next) edge.target = next;
}

const handoff = wf.nodes.find((n) => n.id === HANDOFF_STAFF);
if (handoff) {
  handoff.data.display_name = "Handoff: fin nómina staff";
  handoff.data.config = {
    reason: "staff_nomina_complete",
    context_data: { lane: "staff", open_for_human: false },
  };
}

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + "\n");
console.log("Patched staff channel:", wfPath);
console.log("  wait node:", WAIT_STAFF);
console.log("  pedido ok/blocked -> wait (no handoff)");
