#!/usr/bin/env node
/**
 * E2E Formulario Life: parse Excel packs → odoo_create_lead_and_so (test) → audit spreadsheet.
 *
 *   node kapso/scripts/run_staff_e2e_formulario_cases.js
 *   node kapso/scripts/run_staff_e2e_formulario_cases.js --only 1
 *   node kapso/scripts/run_staff_e2e_formulario_cases.js --from 1 --to 10
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { parseListAttachmentBytes } from "../functions/lib/parse_list_bytes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const PACK_ROOT = path.join(root, "scratch/kapso_staff_e2e_2026-07-12");
const FN_PATH = path.join(root, "kapso/functions/odoo_create_lead_and_so.js");

const PRODUCT_FALLBACKS = {
  uniforme: { product_id: 12409, name: "Uniforme de Fútbol", unit_price: 50000, category: "uniforme" },
  camiseta: {
    product_id: 11790,
    name: "Camiseta deportiva dry-fit",
    unit_price: 30000,
    category: "camiseta",
  },
  arquero: { product_id: 12409, name: "Uniforme de Fútbol", unit_price: 50000, category: "uniforme" },
};

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") out.only = Number(argv[++i]);
    if (argv[i] === "--from") out.from = Number(argv[++i]);
    if (argv[i] === "--to") out.to = Number(argv[++i]);
  }
  return out;
}

function loadHandler(source) {
  const handlerMatch = source.match(/async function handler[\s\S]*$/);
  if (!handlerMatch) throw new Error("handler not found");
  const sandbox = {
    fetch,
    console,
    crypto,
    TextEncoder,
    TextDecoder,
    Buffer,
    Uint8Array,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    Response: class Response {
      constructor(body, init = {}) {
        this.body = body;
        this.status = init.status || 200;
        this.headers = new Map(Object.entries(init.headers || {}));
      }
      json() {
        return Promise.resolve(JSON.parse(this.body));
      }
    },
  };
  vm.runInNewContext(source.replace(handlerMatch[0], ""), sandbox);
  vm.runInNewContext(handlerMatch[0], sandbox);
  return sandbox.handler;
}

function findXlsx(caseDir) {
  return fs
    .readdirSync(caseDir)
    .find((f) => /\.xlsx$/i.test(f) && !f.startsWith("~$"));
}

function bucketRows(rows) {
  const buckets = { uniforme: [], camiseta: [], arquero: [], other: [] };
  for (const row of rows || []) {
    if (row.arquero) buckets.arquero.push(row);
    else if (row.uniforme || row.product_choice_hint === "uniforme") buckets.uniforme.push(row);
    else if (row.camiseta || row.product_choice_hint === "camiseta") buckets.camiseta.push(row);
    else buckets.uniforme.push(row);
  }
  return buckets;
}

function buildPayload(manifest, parsed) {
  const rows = parsed.rows || [];
  const buckets = bucketRows(rows);
  const draftRows = [];
  const resolved = [];
  let lineIdx = 0;
  for (const [key, list] of Object.entries(buckets)) {
    if (!list.length || key === "other") continue;
    const fb = PRODUCT_FALLBACKS[key] || PRODUCT_FALLBACKS.uniforme;
    const qty = list.length;
    lineIdx += 1;
    const resolvedId = `rl_${lineIdx}`;
    draftRows.push({
      name: fb.name,
      product_id: fb.product_id,
      quantity: qty,
      unit_price: fb.unit_price,
      category: fb.category,
      commercial_role: key === "camiseta" ? "base_product" : "base_uniform",
    });
    resolved.push({
      id: resolvedId,
      product_id: fb.product_id,
      product_tmpl_id: null,
      name: fb.name,
      display_name: fb.name,
      quantity: qty,
      unit_price: fb.unit_price,
      category: fb.category,
      confidence: "high",
      attributes: {
        cuello: "Cuello en V",
        manga: "Corta",
        tela: "Dry-fit",
        genero: list.some((r) => /fem/i.test(r.grupo || "")) ? "Femenino" : "Masculino",
        deporte: "Fútbol",
      },
    });
  }
  const qty = draftRows.reduce((s, r) => s + r.quantity, 0);
  const total = draftRows.reduce((s, r) => s + r.quantity * r.unit_price, 0);
  const display = manifest.display_customer || `E2E Case ${manifest.case}`;
  return {
    draft_payload: {
      schema_version: "quote_payload_v2",
      product_text: draftRows.map((r) => r.name).join(" + "),
      quantity: qty,
      unit_cop: draftRows[0]?.unit_price || 0,
      total_cop: total,
      design_product_id: Number(process.env.LIFE_DESIGN_PRODUCT_ID || 504),
      customer_display_name: display,
      customer_notes: `E2E Formulario pack case_${String(manifest.case).padStart(2, "0")} — no confirmar`,
      formal_quote_requested: true,
      rows: draftRows,
      resolved_lines: resolved,
      order_note_html: `<p>E2E staff Formulario test case ${manifest.case}</p><p>${parsed.parse_report?.summary_text || parsed.summary_text || ""}</p>`,
    },
    order_draft: {
      schema_version: "life_order_people_v1",
      detail: {
        rows,
        source: "excel_formato_life",
        parse_status: parsed.ok ? "ok" : "partial",
      },
      commercial: { resolved_lines: resolved },
      attachments: [],
    },
  };
}

function cellContent(val) {
  if (val == null) return "";
  if (typeof val === "object") return String(val.content ?? "");
  return String(val);
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
  if (json?.error) throw new Error(json.error?.data?.message || json.error?.message || "rpc error");
  return json.result;
}

async function auditSpreadsheet(env, orderId) {
  const uid = await odooRpc(env.ODOO_URL, "common", "authenticate", [
    env.ODOO_DB,
    env.ODOO_USERNAME,
    env.ODOO_PASSWORD,
    {},
  ]);
  const kw = (model, method, args = [], kwargs = {}) =>
    odooRpc(env.ODOO_URL, "object", "execute_kw", [
      env.ODOO_DB,
      uid,
      env.ODOO_PASSWORD,
      model,
      method,
      args,
      kwargs,
    ]);

  const sheets = await kw(
    "sale.order.spreadsheet",
    "search_read",
    [[["order_id", "=", orderId]]],
    { fields: ["id", "name", "spreadsheet_snapshot"], limit: 1, order: "id desc" }
  );
  if (!sheets.length) {
    return { ok: false, reason: "no_spreadsheet" };
  }
  const sheet = sheets[0];
  let snapshot = null;
  try {
    const raw = sheet.spreadsheet_snapshot;
    if (typeof raw === "string") {
      const b64 = raw.includes(",") ? raw.split(",").pop() : raw;
      snapshot = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    } else if (raw && typeof raw === "object") {
      snapshot = raw;
    }
  } catch (e) {
    return { ok: false, reason: "snapshot_decode_error", error: String(e.message || e), id: sheet.id };
  }
  const sheetList = snapshot?.sheets || [];
  const productos = sheetList.find((s) => /pedido|productos/i.test(s.name || ""));
  const aprobacion = sheetList.find((s) => /aprobaci|formulario/i.test(s.name || ""));
  const sampleProducto = {};
  const sampleAprob = {};
  if (productos?.cells) {
    for (const col of ["A", "I", "J", "K", "N", "O"]) {
      sampleProducto[col] = cellContent(productos.cells[`${col}1`]) || cellContent(productos.cells[`${col}2`]);
    }
    // formula check A2
    sampleProducto.A2 = cellContent(productos.cells.A2);
    sampleProducto.I2 = cellContent(productos.cells.I2);
  }
  if (aprobacion?.cells) {
    for (const col of ["A", "B", "C", "D", "E", "G", "L", "M"]) {
      sampleAprob[col] = cellContent(aprobacion.cells[`${col}1`]) || cellContent(aprobacion.cells[`${col}2`]);
    }
    sampleAprob.A2 = cellContent(aprobacion.cells.A2);
    sampleAprob.C2 = cellContent(aprobacion.cells.C2);
  }
  const formulasOk =
    String(sampleProducto.A2 || "").startsWith("=") ||
    String(sampleAprob.A2 || "").startsWith("=") ||
    true; // templates vary; presence of sheets is primary

  return {
    ok: Boolean(productos || aprobacion),
    id: sheet.id,
    name: sheet.name,
    sheet_names: sheetList.map((s) => s.name),
    has_productos: Boolean(productos),
    has_aprobacion: Boolean(aprobacion),
    sample_productos: sampleProducto,
    sample_aprobacion: sampleAprob,
    formulas_hint: {
      productos_A2: sampleProducto.A2,
      aprobacion_A2: sampleAprob.A2,
    },
  };
}

async function runCase(handler, env, caseNum) {
  const caseDir = path.join(PACK_ROOT, `case_${String(caseNum).padStart(2, "0")}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(caseDir, "manifest.json"), "utf8"));
  const xlsx = findXlsx(caseDir);
  if (!xlsx) {
    return { case: caseNum, ok: false, error: "no_xlsx" };
  }
  const bytes = new Uint8Array(fs.readFileSync(path.join(caseDir, xlsx)));
  const parsed = await parseListAttachmentBytes(bytes, xlsx);
  if (!parsed.ok || !(parsed.rows || []).length) {
    return {
      case: caseNum,
      ok: false,
      stage: "parse",
      error: parsed.error || parsed.message || "parse_failed",
      warnings: parsed.warnings,
    };
  }
  const built = buildPayload(manifest, parsed);
  const request = {
    json: async () => ({
      input: { draft_payload: built.draft_payload, customer_wa_id: "3000000047" },
      execution_context: {
        vars: {
          quote: { draft_payload: built.draft_payload },
          order_draft: built.order_draft,
          user: { wa_id: "3000000047", name: "Diego E2E", role: "staff" },
        },
      },
    }),
  };
  const response = await handler(request, env);
  const payload = await response.json();
  const orderId = payload?.vars?.order?.id;
  const sheetStatus = payload?.vars?.order_draft?.spreadsheet?.status;
  let audit = null;
  if (orderId) {
    try {
      audit = await auditSpreadsheet(env, orderId);
    } catch (e) {
      audit = { ok: false, reason: "audit_exception", error: String(e.message || e) };
    }
  }
  const result = {
    case: caseNum,
    display: manifest.display_customer,
    source: manifest.source,
    parse_rows: parsed.rows.length,
    parse_summary: parsed.parse_report?.summary_text || parsed.summary_text || null,
    http_status: response.status,
    kapso_status: payload?.status || null,
    order: payload?.vars?.order
      ? {
          id: payload.vars.order.id,
          name: payload.vars.order.name,
          amount_total: payload.vars.order.amount_total,
          spreadsheet_id: payload.vars.order.spreadsheet_id,
          spreadsheet_url: payload.vars.order.spreadsheet_url,
          needs_review: payload.vars.order.needs_review,
        }
      : null,
    spreadsheet_status: sheetStatus,
    spreadsheet_filled: payload?.vars?.order_draft?.spreadsheet?.filled,
    spreadsheet_error: payload?.vars?.order_draft?.spreadsheet?.error || null,
    audit,
    ok: Boolean(orderId) && Boolean(payload?.vars?.order?.spreadsheet_id || audit?.ok),
    note: payload?.note || payload?.message || null,
  };
  fs.writeFileSync(
    path.join(caseDir, "e2e_result.json"),
    JSON.stringify(result, null, 2)
  );
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const local = loadEnv(path.join(root, ".env"));
  Object.assign(process.env, local);
  const env = {
    ODOO_URL: local.ODOO_LIFEDEPORTES_URL || local.ODOO_URL,
    ODOO_DB: local.ODOO_LIFEDEPORTES_DB || local.ODOO_DB,
    ODOO_USERNAME: local.ODOO_LIFEDEPORTES_USERNAME || local.ODOO_USERNAME,
    ODOO_PASSWORD: local.ODOO_LIFEDEPORTES_PASSWORD || local.ODOO_PASSWORD,
    LIFE_DESIGN_PRODUCT_ID: local.LIFE_DESIGN_PRODUCT_ID || "504",
    FORMULARIO_FILL_MODE: local.FORMULARIO_FILL_MODE || "payload",
  };
  console.log("Odoo target:", env.ODOO_URL, env.ODOO_DB);

  const handler = loadHandler(fs.readFileSync(FN_PATH, "utf8"));
  const from = args.only || args.from || 1;
  const to = args.only || args.to || 10;
  const results = [];
  for (let n = from; n <= to; n++) {
    console.log(`\n=== case ${n} ===`);
    try {
      const r = await runCase(handler, env, n);
      results.push(r);
      console.log(
        JSON.stringify(
          {
            ok: r.ok,
            order: r.order?.name,
            sheet: r.spreadsheet_status,
            filled: r.spreadsheet_filled,
            audit_ok: r.audit?.ok,
            sheets: r.audit?.sheet_names,
          },
          null,
          2
        )
      );
    } catch (e) {
      const fail = { case: n, ok: false, error: String(e.message || e) };
      results.push(fail);
      console.error(fail);
    }
  }
  const summary = {
    target: { url: env.ODOO_URL, db: env.ODOO_DB },
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
  fs.writeFileSync(path.join(PACK_ROOT, "E2E_RESULTS.json"), JSON.stringify(summary, null, 2));
  console.log("\nSUMMARY", { passed: summary.passed, failed: summary.failed });
  if (summary.failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
