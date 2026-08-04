#!/usr/bin/env node
/**
 * PoC fill Odoo: lee Payload Formulario del SO y llena el Formulario Life nativo.
 * Simula la automation Odoo (camino B del C+B).
 *
 *   node kapso/scripts/fill_formulario_from_payload.js --order S02641
 *   node kapso/scripts/fill_formulario_from_payload.js --order S02641 --dry-run
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  PAYLOAD_ATTACHMENT_NAME,
  validateFormularioPayload,
  confrontPayloadVsSheet,
  payloadToFillInput,
} from "../functions/lib/payload_formulario.js";
import {
  applyLifeFormularioFill,
  parsePeopleFromSpreadsheet,
  parsePedidoAttributes,
} from "../functions/lib/sale_order_spreadsheet.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, "../../.env");
  try {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Nota SO: interpretación payload (Excel/lista) para corroborar vs Formulario C–F. */
function buildNoteFromPayload(payload, existingNote = "") {
  const units = payload?.units || [];
  const lines = payload?.lines || [];
  const hasLista =
    /Lista de jugador|Lista de detalle|espejo Excel/i.test(existingNote || "");
  if (hasLista && (existingNote || "").length > 200) {
    return String(existingNote)
      .replace(/\n*<p>\[Confrontación Formulario\][\s\S]*$/i, "")
      .replace(/\n*\[Confrontación Formulario\][\s\S]*$/i, "");
  }

  const parts = [
    `<h1>${escapeHtml(payload?.meta?.title || payload?.order_name || "Pedido")}</h1>`,
  ];
  if (lines.length) {
    parts.push(
      `<h2>Resumen de uniformes</h2>
<ul>
  ${lines
    .map(
      (l) =>
        `<li><strong>${escapeHtml(l.product_base || "Producto")} (${Number(l.quantity || 0)} u.)</strong></li>`
    )
    .join("\n  ")}
</ul>`
    );
  }
  if (units.length) {
    const body = units
      .map((u, idx) => {
        const bg = idx % 2 ? ' style="background-color:#f9f9f9;"' : "";
        return `<tr${bg}><td style="text-align:center; padding: 8px;">${escapeHtml(u.numero || "—")}</td><td style="padding: 8px;">${escapeHtml(u.nombre || "")}</td><td style="text-align:center; padding: 8px;">${escapeHtml(u.talla || "—")}</td><td style="padding: 8px;">${escapeHtml(u.comentario || u.color_medias || "")}</td></tr>`;
      })
      .join("\n    ");
    parts.push(`<h2>Lista de detalle (interpretación Excel)</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      <th style="text-align:left; padding: 8px;">Rol / variante</th>
    </tr>
  </thead>
  <tbody>
    ${body}
  </tbody>
</table>`);
  }
  return parts.join("\n\n<hr>\n\n");
}

async function odooRpc(url, service, method, args) {
  const resp = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
    }),
  });
  const json = await resp.json();
  if (json?.error) {
    throw new Error(json.error?.data?.message || json.error?.message || "Odoo RPC error");
  }
  return json.result;
}

function encodeSnapshot(snapshot) {
  return Buffer.from(JSON.stringify(snapshot), "utf8").toString("base64");
}

function decodeSnapshot(b64) {
  if (!b64) return null;
  return JSON.parse(Buffer.from(String(b64), "base64").toString("utf8"));
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const orderIdx = args.indexOf("--order");
  const orderName = orderIdx >= 0 ? args[orderIdx + 1] : null;
  if (!orderName) {
    console.error("Usage: --order S0xxxx [--dry-run]");
    process.exit(1);
  }

  const url = process.env.ODOO_URL || process.env.ODOO_LIFEDEPORTES_TEST_URL;
  const db = process.env.ODOO_DB || process.env.ODOO_LIFEDEPORTES_TEST_DB;
  const user = process.env.ODOO_USERNAME || process.env.ODOO_LIFEDEPORTES_TEST_USERNAME;
  const pwd = process.env.ODOO_PASSWORD || process.env.ODOO_LIFEDEPORTES_TEST_PASSWORD;
  if (!url || !db || !user || !pwd) throw new Error("Missing Odoo env (ODOO_URL/DB/USERNAME/PASSWORD)");

  const uid = await odooRpc(url, "common", "authenticate", [db, user, pwd, {}]);
  if (!uid) throw new Error("Odoo auth failed");
  const kw = (model, method, a = [], kwargs = {}) =>
    odooRpc(url, "object", "execute_kw", [db, uid, pwd, model, method, a, kwargs]);

  const sos = await kw("sale.order", "search_read", [[["name", "=", orderName]]], {
    fields: ["id", "name", "order_line", "note"],
    limit: 1,
  });
  if (!sos.length) throw new Error(`Order ${orderName} not found`);
  const so = sos[0];

  const atts = await kw(
    "ir.attachment",
    "search_read",
    [
      [
        ["res_model", "=", "sale.order"],
        ["res_id", "=", so.id],
        ["name", "=", PAYLOAD_ATTACHMENT_NAME],
      ],
    ],
    { fields: ["id", "raw", "name", "file_size"], limit: 1, order: "id desc" }
  );
  if (!atts.length || !atts[0].raw) {
    throw new Error(`Missing attachment ${PAYLOAD_ATTACHMENT_NAME} on ${orderName}`);
  }
  const raw = atts[0].raw;
  const payloadJson =
    typeof raw === "string"
      ? Buffer.from(raw, "base64").toString("utf8")
      : Buffer.from(raw).toString("utf8");
  const payload = JSON.parse(payloadJson);
  const validation = validateFormularioPayload(payload);
  console.log("payload validation", validation);
  if (validation.grave) {
    console.error("Grave payload errors — abort fill");
    process.exit(2);
  }

  const sheets = await kw(
    "sale.order.spreadsheet",
    "search_read",
    [[["order_id", "=", so.id]]],
    { fields: ["id", "name", "spreadsheet_snapshot"], limit: 1, order: "id desc" }
  );
  if (!sheets.length) throw new Error("No sale.order.spreadsheet — create SO with Plantilla venta first");
  const sheet = sheets[0];
  const snap = decodeSnapshot(sheet.spreadsheet_snapshot);
  if (!snap) throw new Error("Empty spreadsheet_snapshot");

  const lines = await kw("sale.order.line", "read", [so.order_line || []], {
    fields: ["id", "name", "product_id", "product_uom_qty"],
  });
  const orderLinesNoDesign = (lines || []).filter(
    (l) => !/dise[nñ]o/i.test(String(l.name || l.product_id?.[1] || ""))
  );

  const fillInput = payloadToFillInput(payload);
  const { snapshot: filledSnap, filled, mode } = applyLifeFormularioFill(snap, {
    ...fillInput,
    orderLines: orderLinesNoDesign,
  });

  const parsedPeople = parsePeopleFromSpreadsheet(filledSnap).map((p) => ({
    nombre: p.identity?.print_name || p.identity?.display_name || "",
  }));
  const confront = confrontPayloadVsSheet(
    payload,
    parsedPeople,
    parsePedidoAttributes(filledSnap)
  );
  const noteBase = buildNoteFromPayload(payload, so.note || "");
  const note = `${noteBase}\n\n<p>[Confrontación Formulario] ${escapeHtml(confront.summary)}</p>`;

  const form =
    (filledSnap.sheets || []).find((s) =>
      /formulario|aprobaci/i.test(String(s.name || ""))
    ) || filledSnap.sheets?.[0];

  console.log(
    JSON.stringify(
      {
        order: orderName,
        sheet_id: sheet.id,
        sheet_name: sheet.name,
        filled,
        mode,
        dry_run: dryRun,
        confront,
        note_chars: note.length,
        sample_cf: {
          C2: form?.cells?.C2?.content ?? null,
          D2: form?.cells?.D2?.content ?? null,
          E2: form?.cells?.E2?.content ?? null,
          F2: form?.cells?.F2?.content ?? null,
        },
        spreadsheet_url: `${url}/odoo/sales/${so.id}/sale-order-spreadsheet/${sheet.id}`,
      },
      null,
      2
    )
  );

  if (dryRun) return;

  await kw("sale.order.spreadsheet", "write", [
    [sheet.id],
    { spreadsheet_snapshot: encodeSnapshot(filledSnap) },
  ]);
  await kw("sale.order", "write", [[so.id], { note }]);
  console.log("wrote snapshot + note");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
