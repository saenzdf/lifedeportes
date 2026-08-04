#!/usr/bin/env node
/**
 * PoC: fill Calculadora / Formulario pedido Life respetando fórmulas nativas.
 *
 *   node kapso/scripts/poc_fill_formulario_life.js --order S02616 --dry-run
 *   node kapso/scripts/poc_fill_formulario_life.js --order S02616
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { applyLifeFormularioFill } from "../functions/lib/sale_order_spreadsheet.js";
import { decomposeProductForSpreadsheet } from "../functions/lib/staff_order_contract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, "../../.env");
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
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
  if (json?.error) throw new Error(json.error?.data?.message || json.error?.message || "Odoo RPC error");
  return json.result;
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const orderIdx = args.indexOf("--order");
  const orderName = orderIdx >= 0 ? args[orderIdx + 1] : "S02616";

  const url = process.env.ODOO_LIFEDEPORTES_PROD_URL || "https://lifedeportes.odoo.com";
  const db = process.env.ODOO_LIFEDEPORTES_PROD_DB || "life-soluciones";
  const user = process.env.ODOO_LIFEDEPORTES_PROD_USERNAME;
  const pwd = process.env.ODOO_LIFEDEPORTES_PROD_PASSWORD;
  if (!user || !pwd) throw new Error("Missing prod Odoo credentials");

  const uid = await odooRpc(url, "common", "authenticate", [db, user, pwd, {}]);
  if (!uid) throw new Error("Odoo auth failed");
  const kw = (model, method, args = [], kwargs = {}) =>
    odooRpc(url, "object", "execute_kw", [db, uid, pwd, model, method, args, kwargs]);

  const sos = await kw(
    "sale.order",
    "search_read",
    [[["name", "=", orderName]]],
    { fields: ["id", "name", "order_line"], limit: 1 }
  );
  if (!sos.length) throw new Error(`Order ${orderName} not found`);
  const so = sos[0];
  const lines = await kw(
    "sale.order.line",
    "read",
    [so.order_line],
    { fields: ["id", "name", "product_id", "product_uom_qty"] }
  );
  const sheets = await kw(
    "sale.order.spreadsheet",
    "search_read",
    [[["order_id", "=", so.id]]],
    { fields: ["id", "name", "spreadsheet_snapshot"], limit: 1, order: "id desc" }
  );
  if (!sheets.length) throw new Error("No spreadsheet on order");

  const snapB64 = sheets[0].spreadsheet_snapshot;
  const snap = JSON.parse(Buffer.from(snapB64, "base64").toString("utf8"));

  const productLine = lines.find((l) => !/dise[nñ]o/i.test(l.name || ""));
  const decomp = decomposeProductForSpreadsheet(productLine?.name || "", {}, "");
  const qty = Math.round(Number(productLine?.product_uom_qty || 0));

  const people = Array.from({ length: Math.min(qty, 6) }, (_, i) => ({
    identity: { print_name: `Jugador ${i + 1}`, number: String(10 + i) },
    color_medias: i % 2 === 0 ? "Negro" : "Blanco",
    components: [{ size: ["S", "M", "L", "XL"][i % 4], comment: i === 0 ? "demo fill API" : "" }],
  }));

  const { snapshot, filled } = applyLifeFormularioFill(snap, {
    detail: { people },
    resolvedLines: [
      {
        product_text: productLine?.name,
        product_base: decomp.product_base,
        quantity: qty,
        attributes: decomp.attributes,
        comments: decomp.comments,
        product_variant_id: productLine?.product_id?.[0],
      },
    ],
    orderLines: lines,
  });

  const form = snapshot.sheets.find((s) => /formulario|aprobaci/i.test(s.name));
  const pedido = snapshot.sheets.find((s) => /^pedido$/i.test(s.name));
  const sample = {
    order: orderName,
    sheet_id: sheets[0].id,
    filled,
    dry_run: dryRun,
    preserve_A2: String(
      typeof form?.cells?.A2 === "object" ? form?.cells?.A2?.content : form?.cells?.A2 || ""
    ).startsWith("="),
    preserve_B2: String(
      typeof form?.cells?.B2 === "object" ? form?.cells?.B2?.content : form?.cells?.B2 || ""
    ).startsWith("="),
    preserve_Pedido_F2: String(
      typeof pedido?.cells?.F2 === "object" ? pedido?.cells?.F2?.content : pedido?.cells?.F2 || ""
    ).startsWith("="),
    preserve_Pedido_G1: String(
      typeof pedido?.cells?.G1 === "object" ? pedido?.cells?.G1?.content : pedido?.cells?.G1 || ""
    ),
    formulario_headers: {
      C1: typeof form?.cells?.C1 === "object" ? form?.cells?.C1?.content : form?.cells?.C1,
      G1: typeof form?.cells?.G1 === "object" ? form?.cells?.G1?.content : form?.cells?.G1,
      L1: typeof form?.cells?.L1 === "object" ? form?.cells?.L1?.content : form?.cells?.L1,
    },
    row2: {
      C: typeof form?.cells?.C2 === "object" ? form?.cells?.C2?.content : form?.cells?.C2,
      F: typeof form?.cells?.F2 === "object" ? form?.cells?.F2?.content : form?.cells?.F2,
      G: typeof form?.cells?.G2 === "object" ? form?.cells?.G2?.content : form?.cells?.G2,
      H: typeof form?.cells?.H2 === "object" ? form?.cells?.H2?.content : form?.cells?.H2,
      I: typeof form?.cells?.I2 === "object" ? form?.cells?.I2?.content : form?.cells?.I2,
      L: typeof form?.cells?.L2 === "object" ? form?.cells?.L2?.content : form?.cells?.L2,
    },
    pedido_row: {
      G3: typeof pedido?.cells?.G3 === "object" ? pedido?.cells?.G3?.content : pedido?.cells?.G3,
      I3: typeof pedido?.cells?.I3 === "object" ? pedido?.cells?.I3?.content : pedido?.cells?.I3,
      J3: typeof pedido?.cells?.J3 === "object" ? pedido?.cells?.J3?.content : pedido?.cells?.J3,
      K3: typeof pedido?.cells?.K3 === "object" ? pedido?.cells?.K3?.content : pedido?.cells?.K3,
      L3: typeof pedido?.cells?.L3 === "object" ? pedido?.cells?.L3?.content : pedido?.cells?.L3,
      O3: typeof pedido?.cells?.O3 === "object" ? pedido?.cells?.O3?.content : pedido?.cells?.O3,
    },
    decomp,
  };
  console.log(JSON.stringify(sample, null, 2));

  if (dryRun) {
    console.log("Dry-run only — no write.");
    return;
  }

  const encoded = Buffer.from(JSON.stringify(snapshot), "utf8").toString("base64");
  await kw("sale.order.spreadsheet", "write", [
    [sheets[0].id],
    { spreadsheet_snapshot: encoded },
  ]);
  console.log(`Wrote snapshot to sale.order.spreadsheet ${sheets[0].id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
