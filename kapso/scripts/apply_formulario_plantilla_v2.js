#!/usr/bin/env node
/**
 * Ajusta Plantilla venta Formulario (sale.order.spreadsheet template) a v2.
 *
 *   node kapso/scripts/apply_formulario_plantilla_v2.js
 *   node kapso/scripts/apply_formulario_plantilla_v2.js --dry-run
 *   node kapso/scripts/apply_formulario_plantilla_v2.js --sheet-id 11 --also-order S02642
 *
 * Backup previo: /tmp/formulario_tmpl{id}_before.json
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  PAYLOAD_ATTACHMENT_NAME,
  payloadToFillInput,
} from "../functions/lib/payload_formulario.js";
import { applyLifeFormularioFill } from "../functions/lib/sale_order_spreadsheet.js";

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

function decode(b64) {
  return JSON.parse(Buffer.from(String(b64), "base64").toString("utf8"));
}
function encode(snap) {
  return Buffer.from(JSON.stringify(snap), "utf8").toString("base64");
}

/** @see kapso/docs/formulario_plantilla_v2.md */
export function applyPlantillaV2(snap) {
  const clone = JSON.parse(JSON.stringify(snap));
  const pedido = clone.sheets.find((s) => /^pedido$/i.test(s.name));
  const form = clone.sheets.find((s) => /aprobaci|formulario life/i.test(s.name));
  if (!pedido || !form) throw new Error("Missing Pedido or Aprobación sheet");

  pedido.cells = pedido.cells || {};
  form.cells = form.cells || {};

  pedido.cells.I1 = "Producto base";

  const pedidoRows = [];
  for (const addr of Object.keys(pedido.cells)) {
    const m = addr.match(/^A(\d+)$/);
    if (m && Number(m[1]) >= 2) pedidoRows.push(Number(m[1]));
  }
  pedidoRows.sort((a, b) => a - b);

  for (const row of pedidoRows) {
    const idx = row - 1;
    pedido.cells[`A${row}`] = `=ODOO.LIST(1,${idx},"product_id")`;
    pedido.cells[`B${row}`] = `=ODOO.LIST(1,${idx},"product_uom_qty")`;
    if (pedido.cells[`C${row}`] != null) {
      pedido.cells[`C${row}`] = `=ODOO.LIST(1,${idx},"price_unit")`;
    }
    if (pedido.cells[`D${row}`] != null) {
      pedido.cells[`D${row}`] = `=ODOO.LIST(1,${idx},"price_subtotal")`;
    }
    pedido.cells[`E${row}`] =
      `=IF(AND(A${row}<>"",ISNUMBER(B${row}),B${row}>0,ISERROR(SEARCH("diseño",A${row})),ISERROR(SEARCH("diseno",A${row})),ISERROR(SEARCH("Diseño",A${row}))),1,0)`;
    if (row === 2) pedido.cells.F2 = "=IF(E2=1,B2,0)";
    else pedido.cells[`F${row}`] = `=F${row - 1}+IF(E${row}=1,B${row},0)`;
    pedido.cells[`I${row}`] =
      `=IF(A${row}="","",IF(ISNUMBER(FIND("(",A${row})),TRIM(LEFT(A${row},FIND("(",A${row})-1)),A${row}))`;
  }

  if (Array.isArray(pedido.tables) && pedido.tables[0]) {
    pedido.tables[0] = { ...pedido.tables[0], range: "A1:I69" };
  }

  form.cells.B1 = "Producto";
  form.cells.C1 = "Nombre en camiseta";
  form.cells.D1 = "Numero en camiseta";
  form.cells.E1 = "Talla uniforme";
  form.cells.F1 = "Color medias";
  form.cells.G1 = "Producto base";
  form.cells.H1 = "Cuello";
  form.cells.I1 = "Largo Manga";
  form.cells.J1 = "Género";
  form.cells.K1 = "Deportes";
  form.cells.L1 = "Otros atributos";
  form.cells.M1 = "Comentario";

  if (!form.cells.A2 || !String(form.cells.A2).startsWith("=SEQUENCE")) {
    form.cells.A2 = "=SEQUENCE(MAX(Pedido!F:F))";
  }

  for (let row = 2; row <= 200; row++) {
    form.cells[`B${row}`] = `=XLOOKUP(A${row},Pedido!F:F,Pedido!I:I,"",1,1)`;
    form.cells[`G${row}`] = `=IF(B${row}="","",B${row})`;
  }

  if (Array.isArray(form.tables) && form.tables[0]) {
    form.tables[0] = { ...form.tables[0], range: "A1:M200" };
  }
  if (typeof form.colNumber === "number" && form.colNumber < 16) form.colNumber = 16;

  clone.revisionId = `plantilla-v2-${Date.now()}`;
  return clone;
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const sheetIdx = args.indexOf("--sheet-id");
  const sheetId = sheetIdx >= 0 ? Number(args[sheetIdx + 1]) : 11;
  const orderIdx = args.indexOf("--also-order");
  const alsoOrder = orderIdx >= 0 ? args[orderIdx + 1] : null;

  const url = process.env.ODOO_URL || process.env.ODOO_LIFEDEPORTES_TEST_URL;
  const db = process.env.ODOO_DB || process.env.ODOO_LIFEDEPORTES_TEST_DB;
  const user = process.env.ODOO_USERNAME || process.env.ODOO_LIFEDEPORTES_TEST_USERNAME;
  const pwd = process.env.ODOO_PASSWORD || process.env.ODOO_LIFEDEPORTES_TEST_PASSWORD;
  if (!url || !db || !user || !pwd) throw new Error("Missing Odoo env");

  const uid = await odooRpc(url, "common", "authenticate", [db, user, pwd, {}]);
  if (!uid) throw new Error("Odoo auth failed");
  const kw = (model, method, a = [], kwargs = {}) =>
    odooRpc(url, "object", "execute_kw", [db, uid, pwd, model, method, a, kwargs]);

  const tmplRec = (await kw("sale.order.spreadsheet", "read", [[sheetId]], {
    fields: ["spreadsheet_snapshot", "name"],
  }))[0];
  if (!tmplRec?.spreadsheet_snapshot) throw new Error(`Sheet ${sheetId} empty`);

  const before = decode(tmplRec.spreadsheet_snapshot);
  writeFileSync(`/tmp/formulario_tmpl${sheetId}_before.json`, JSON.stringify(before, null, 2));
  const after = applyPlantillaV2(before);
  writeFileSync(`/tmp/formulario_tmpl${sheetId}_v2.json`, JSON.stringify(after, null, 2));

  console.log(
    JSON.stringify(
      {
        dry,
        sheet_id: sheetId,
        name: tmplRec.name,
        pedido_I1: after.sheets.find((s) => s.name === "Pedido")?.cells?.I1,
        form_B2: after.sheets.find((s) => /aprobaci/i.test(s.name))?.cells?.B2,
        form_table: after.sheets.find((s) => /aprobaci/i.test(s.name))?.tables?.[0]?.range,
      },
      null,
      2
    )
  );

  if (dry) return;

  await kw("sale.order.spreadsheet", "write", [
    [sheetId],
    { spreadsheet_snapshot: encode(after) },
  ]);
  console.log(`wrote template/sheet ${sheetId}`);

  if (!alsoOrder) return;

  const so = (
    await kw("sale.order", "search_read", [[["name", "=", alsoOrder]]], {
      fields: ["id", "order_line"],
      limit: 1,
    })
  )[0];
  if (!so) throw new Error(`Order ${alsoOrder} not found`);

  const sosSheets = await kw(
    "sale.order.spreadsheet",
    "search_read",
    [[["order_id", "=", so.id]]],
    { fields: ["id", "name"], limit: 1, order: "id desc" }
  );
  if (!sosSheets.length) throw new Error(`No spreadsheet on ${alsoOrder}`);
  const soSheetId = sosSheets[0].id;

  await kw("sale.order.spreadsheet", "write", [
    [soSheetId],
    { name: "Formulario pedido Life", spreadsheet_snapshot: encode(after) },
  ]);

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
    { fields: ["raw"], limit: 1, order: "id desc" }
  );
  if (!atts.length?.raw && !atts[0]?.raw) {
    console.log("no payload — template copied without fill");
    return;
  }
  const payload = JSON.parse(Buffer.from(String(atts[0].raw), "base64").toString("utf8"));
  const lines = await kw("sale.order.line", "read", [so.order_line || []], {
    fields: ["id", "name", "product_id", "product_uom_qty"],
  });
  const orderLinesNoDesign = (lines || []).filter(
    (l) => !/dise[nñ]o/i.test(String(l.name || l.product_id?.[1] || ""))
  );
  const snap = decode(
    (
      await kw("sale.order.spreadsheet", "read", [[soSheetId]], {
        fields: ["spreadsheet_snapshot"],
      })
    )[0].spreadsheet_snapshot
  );
  const { snapshot: filled, filled: n, mode } = applyLifeFormularioFill(snap, {
    ...payloadToFillInput(payload),
    orderLines: orderLinesNoDesign,
  });
  await kw("sale.order.spreadsheet", "write", [
    [soSheetId],
    { spreadsheet_snapshot: encode(filled) },
  ]);
  console.log(
    JSON.stringify(
      {
        order: alsoOrder,
        so_sheet_id: soSheetId,
        filled: n,
        mode,
        open: `${url}/odoo/sales/${so.id}/sale-order-spreadsheet/${soSheetId}`,
      },
      null,
      2
    )
  );
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}