#!/usr/bin/env node
/**
 * 10 pruebas al azar — reingreso desde tareas (packs scratch) + partner historia/nuevo.
 *
 * Staff WA: 3000000047 (Diego). NO se usa como customer_wa_id (evitar pegar todo a Diego).
 *
 *   node kapso/scripts/run_staff_e2e_10_reingreso.js
 *   node kapso/scripts/run_staff_e2e_10_reingreso.js --only 3
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { parseListAttachmentBytes } from "../functions/lib/parse_list_bytes.js";
import { buildOdooOrderNoteHtml } from "../functions/lib/build_odoo_order_note.js";
import {
  buildFormularioPayload,
  payloadToFillInput,
  validateFormularioPayload,
} from "../functions/lib/payload_formulario.js";
import { applyLifeFormularioFill } from "../functions/lib/sale_order_spreadsheet.js";
import { applyPlantillaV2 } from "./apply_formulario_plantilla_v2.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const PACK_ROOT = path.join(root, "scratch/kapso_staff_e2e_2026-07-12");
const OUT_ROOT = path.join(root, "scratch/e2e_10_reingreso_2026-07-12");
const FN_PATH = path.join(root, "kapso/functions/odoo_create_lead_and_so.js");
const STAFF_WA = "3000000047";

const PRODUCT = {
  uniforme: { product_id: 12409, name: "Uniforme de Fútbol", unit_price: 50000, category: "uniforme" },
  camiseta: {
    product_id: 11790,
    name: "Camiseta deportiva dry-fit",
    unit_price: 30000,
    category: "camiseta",
  },
};

/** Matriz de variedad: historia vs nuevo + modo de ingreso. */
const MATRIX = [
  {
    case: 1,
    partner_mode: "history",
    partner_name: "PASTO",
    entry: "excel_life_plus_fotos",
    note: "Excel Life + fotos diseño/arquero",
  },
  {
    case: 2,
    partner_mode: "history",
    partner_name: "JORGE DUEÑOS DEL BALON",
    entry: "excel_life",
    note: "Excel Life solo",
  },
  {
    case: 3,
    partner_mode: "new",
    partner_name: null,
    entry: "excel_life_plus_fotos",
    note: "Cliente NUEVO + Excel Life + logo",
  },
  {
    case: 4,
    partner_mode: "history",
    partner_name: "NELSON ELEFANTES",
    entry: "excel_life_urgente",
    note: "Cliente con mucha historia + Excel urgente",
  },
  {
    case: 5,
    partner_mode: "history",
    partner_name: "FORTALEZA OMAR",
    entry: "excel_only",
    note: "5º pedido club — solo Excel",
  },
  {
    case: 6,
    partner_mode: "history",
    partner_name: "ADRIAN",
    entry: "excel_mirror_no_life",
    note: "Excel NO Life → espejo nota + comercial mínimo",
  },
  {
    case: 7,
    partner_mode: "new",
    partner_name: null,
    entry: "excel_life_plus_fotos",
    note: "Cliente NUEVO david-style",
  },
  {
    case: 8,
    partner_mode: "history",
    partner_name: "WILLIAM",
    entry: "excel_life_plus_fotos",
    note: "Historia + Excel + fotos jugadores",
  },
  {
    case: 9,
    partner_mode: "history",
    partner_name: "JEAN CARLOS F",
    entry: "excel_life_qty_edge",
    note: "Historia; qty puede ser edge (<6) — reportar gate",
  },
  {
    case: 10,
    partner_mode: "new",
    partner_name: null,
    entry: "excel_life",
    note: "Cliente NUEVO CHUCHO-style (no reusar TACALOA)",
  },
];

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
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
  if (json?.error) throw new Error(json.error?.data?.message || json.error?.message || "rpc");
  return json.result;
}

function decodeSnap(b64) {
  return JSON.parse(Buffer.from(String(b64), "base64").toString("utf8"));
}
function encodeSnap(snap) {
  return Buffer.from(JSON.stringify(snap), "utf8").toString("base64");
}
function cellVal(v) {
  if (v == null) return "";
  if (typeof v === "object") return String(v.content ?? "");
  return String(v);
}

function findXlsx(caseDir) {
  return fs.readdirSync(caseDir).find((f) => /\.xlsx$/i.test(f) && !f.startsWith("~$"));
}

function bucketRows(rows) {
  const buckets = { uniforme: [], camiseta: [], other: [] };
  for (const row of rows || []) {
    if (row.camiseta || row.product_choice_hint === "camiseta") buckets.camiseta.push(row);
    else buckets.uniforme.push(row);
  }
  return buckets;
}

function buildCommercialFromRows(rows) {
  const buckets = bucketRows(rows);
  const draftRows = [];
  const resolved = [];
  let i = 0;
  for (const [key, list] of Object.entries(buckets)) {
    if (!list.length || key === "other") continue;
    const fb = PRODUCT[key] || PRODUCT.uniforme;
    i += 1;
    const qty = Math.max(list.length, key === "uniforme" ? 6 : list.length);
    draftRows.push({
      name: fb.name,
      product_id: fb.product_id,
      quantity: list.length,
      unit_price: fb.unit_price,
      category: fb.category,
      commercial_role: key === "uniforme" ? "base_uniform" : "base_product",
    });
    resolved.push({
      id: `rl_${i}`,
      line_id: `rl_${i}`,
      product_id: fb.product_id,
      product_variant_id: fb.product_id,
      product_base: fb.name,
      product_text: fb.name,
      quantity: list.length,
      unit_price: fb.unit_price,
      category: fb.category,
      confidence: "high",
      commercial_role: key === "uniforme" ? "base_uniform" : "base_product",
      attributes: {
        cuello: "Cuello en V",
        manga: "Corta",
        tela: "Dry-fit",
        deporte: "Fútbol",
        genero: list.some((r) => /fem/i.test(r.grupo || "")) ? "Femenino" : "Masculino",
      },
    });
  }
  return { draftRows, resolved, bumped: false };
}

/** Si qty uniforme < 6, subir a 6 para no bloquear (marca bumped) — simula acuerdo staff. */
function ensureMinUniform(draftRows, resolved) {
  let bumped = false;
  for (const r of draftRows) {
    if (r.commercial_role === "base_uniform" && r.quantity > 0 && r.quantity < 6) {
      r.quantity = 6;
      bumped = true;
    }
  }
  for (const r of resolved) {
    if (r.commercial_role === "base_uniform" && r.quantity > 0 && r.quantity < 6) {
      r.quantity = 6;
      bumped = true;
    }
  }
  return bumped;
}

async function lookupPartnerHistory(env, name) {
  const uid = await odooRpc(env.ODOO_URL, "common", "authenticate", [
    env.ODOO_DB,
    env.ODOO_USERNAME,
    env.ODOO_PASSWORD,
    {},
  ]);
  const kw = (m, method, a = [], k = {}) =>
    odooRpc(env.ODOO_URL, "object", "execute_kw", [
      env.ODOO_DB,
      uid,
      env.ODOO_PASSWORD,
      m,
      method,
      a,
      k,
    ]);
  const partners = await kw(
    "res.partner",
    "search_read",
    [[["name", "ilike", name], ["active", "=", true]]],
    { fields: ["id", "name", "phone", "phone_sanitized"], limit: 8, order: "id desc" }
  );
  const ids = partners.map((p) => p.id);
  let sos = [];
  if (ids.length) {
    sos = await kw(
      "sale.order",
      "search_read",
      [[["partner_id", "in", ids]]],
      { fields: ["id", "name", "partner_id", "state", "date_order"], limit: 5, order: "date_order desc, id desc" }
    );
  }
  return { partners, so_count: sos.length, latest_so: sos[0] || null };
}

async function auditAndFill(env, orderId, built) {
  const uid = await odooRpc(env.ODOO_URL, "common", "authenticate", [
    env.ODOO_DB,
    env.ODOO_USERNAME,
    env.ODOO_PASSWORD,
    {},
  ]);
  const kw = (m, method, a = [], k = {}) =>
    odooRpc(env.ODOO_URL, "object", "execute_kw", [
      env.ODOO_DB,
      uid,
      env.ODOO_PASSWORD,
      m,
      method,
      a,
      k,
    ]);

  const so = (
    await kw("sale.order", "read", [[orderId]], {
      fields: ["id", "name", "note", "order_line", "partner_id", "amount_total", "state"],
    })
  )[0];

  const noteHtml =
    built.order_draft?.notes_for_odoo || built.draft_payload?.order_note_html || "";
  if (noteHtml.includes("<") && noteHtml.length > 80) {
    await kw("sale.order", "write", [[orderId], { note: noteHtml }]);
    so.note = noteHtml;
  }

  const lines = await kw("sale.order.line", "read", [so.order_line || []], {
    fields: ["name", "product_uom_qty", "price_unit"],
  });

  let sheets = await kw(
    "sale.order.spreadsheet",
    "search_read",
    [[["order_id", "=", orderId]]],
    { fields: ["id", "name", "spreadsheet_snapshot"], limit: 1, order: "id desc" }
  );

  const tmpl = (
    await kw("sale.order.spreadsheet", "read", [[11]], { fields: ["spreadsheet_snapshot"] })
  )[0];
  let baseSnap = decodeSnap(tmpl.spreadsheet_snapshot);
  const pedido = (baseSnap.sheets || []).find((s) => /^pedido$/i.test(s.name));
  if (pedido && pedido.cells?.I1 !== "Producto base") baseSnap = applyPlantillaV2(baseSnap);

  if (!sheets.length) {
    const id = await kw("sale.order.spreadsheet", "create", [
      {
        name: "Formulario pedido Life",
        order_id: orderId,
        spreadsheet_snapshot: encodeSnap(baseSnap),
      },
    ]);
    sheets = [{ id, spreadsheet_snapshot: encodeSnap(baseSnap) }];
  } else {
    await kw("sale.order.spreadsheet", "write", [
      [sheets[0].id],
      { spreadsheet_snapshot: encodeSnap(baseSnap) },
    ]);
    sheets[0].spreadsheet_snapshot = encodeSnap(baseSnap);
  }

  const payload = buildFormularioPayload({
    detail: built.order_draft.detail,
    resolvedLines: built.draft_payload.resolved_lines,
    meta: { source: "e2e_10_reingreso" },
  });
  const validation = validateFormularioPayload(payload);
  const fillInput = payloadToFillInput(payload);
  const snap = decodeSnap(sheets[0].spreadsheet_snapshot);
  const { snapshot: filledSnap, filled, mode } = applyLifeFormularioFill(snap, {
    ...fillInput,
    orderLines: lines.filter((l) => !/dise[nñ]o/i.test(l.name || "")),
  });
  await kw("sale.order.spreadsheet", "write", [
    [sheets[0].id],
    { spreadsheet_snapshot: encodeSnap(filledSnap) },
  ]);

  const form =
    (filledSnap.sheets || []).find((s) => /aprobaci|formulario/i.test(s.name || "")) ||
    filledSnap.sheets?.[0];
  let people = 0;
  for (const addr of Object.keys(form?.cells || {})) {
    if (/^C\d+$/.test(addr) && Number(addr.slice(1)) >= 2 && cellVal(form.cells[addr])) people++;
  }

  const partnerId = Array.isArray(so.partner_id) ? so.partner_id[0] : so.partner_id;
  const partnerName = Array.isArray(so.partner_id) ? so.partner_id[1] : "";
  const priorSos = await kw(
    "sale.order",
    "search_count",
    [[["partner_id", "=", partnerId], ["id", "!=", orderId]]]
  );

  return {
    so_name: so.name,
    so_state: so.state,
    amount_total: so.amount_total,
    partner_id: partnerId,
    partner_name: partnerName,
    partner_prior_so_count: priorSos,
    partner_has_history: priorSos > 0,
    note_has_lista: /Lista de jugador|espejo Excel|Resumen por variante/i.test(String(so.note || "")),
    note_chars: String(so.note || "").length,
    lines: lines.map((l) => ({
      qty: l.product_uom_qty,
      name: String(l.name || "").split("\n")[0].slice(0, 60),
    })),
    spreadsheet_id: sheets[0].id,
    spreadsheet_url: `${env.ODOO_URL}/odoo/sales/${orderId}/sale-order-spreadsheet/${sheets[0].id}`,
    filled,
    mode,
    people_cf: people,
    talla_sample: cellVal(form?.cells?.E2),
    nombre_sample: cellVal(form?.cells?.C2),
    payload_validation: validation,
  };
}

function buildAttachments(caseDir, entry) {
  const files = fs.readdirSync(caseDir);
  const out = [];
  const xlsx = files.find((f) => /\.xlsx$/i.test(f));
  if (xlsx) {
    out.push({
      filename: xlsx,
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content_base64: fs.readFileSync(path.join(caseDir, xlsx)).toString("base64"),
    });
  }
  if (/fotos|plus/i.test(entry)) {
    for (const f of files.filter((x) => /\.(jpe?g|png|jfif)$/i.test(x)).slice(0, 3)) {
      out.push({
        filename: f,
        mime_type: /\.png$/i.test(f) ? "image/png" : "image/jpeg",
        content_base64: fs.readFileSync(path.join(caseDir, f)).toString("base64"),
      });
    }
  }
  return out;
}

async function runOne(handler, env, spec, stamp) {
  const caseDir = path.join(PACK_ROOT, `case_${String(spec.case).padStart(2, "0")}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(caseDir, "manifest.json"), "utf8"));
  const xlsx = findXlsx(caseDir);
  if (!xlsx) return { case: spec.case, ok: false, error: "no_xlsx" };

  const bytes = new Uint8Array(fs.readFileSync(path.join(caseDir, xlsx)));
  const parsed = await parseListAttachmentBytes(bytes, xlsx);

  let historyProbe = null;
  let customerName;
  if (spec.partner_mode === "history") {
    customerName = spec.partner_name;
    historyProbe = await lookupPartnerHistory(env, spec.partner_name);
  } else {
    customerName = `E2E NUEVO ${stamp} C${spec.case} ${manifest.source?.partner || "CLIENTE"}`;
  }

  let detailRows = parsed.rows || [];
  let draftRows = [];
  let resolved = [];
  let listLayout = parsed.layout || null;
  let mirrorGrid = null;
  let bumpedMin = false;
  let parseNote = `layout=${parsed.layout} rows=${detailRows.length}`;

  if (spec.entry === "excel_mirror_no_life" || (!detailRows.length && parsed.use_mirror)) {
    mirrorGrid = parsed.grid || null;
    listLayout = "mirror_v1";
    detailRows = [];
    // Comercial desde SO original de la tarea (si hay) o uniforme ×8 placeholder
    draftRows = [
      {
        name: PRODUCT.uniforme.name,
        product_id: PRODUCT.uniforme.product_id,
        quantity: 8,
        unit_price: PRODUCT.uniforme.unit_price,
        category: "uniforme",
        commercial_role: "base_uniform",
      },
    ];
    resolved = [
      {
        id: "rl_1",
        line_id: "rl_1",
        product_id: PRODUCT.uniforme.product_id,
        product_variant_id: PRODUCT.uniforme.product_id,
        product_base: PRODUCT.uniforme.name,
        product_text: PRODUCT.uniforme.name,
        quantity: 8,
        unit_price: PRODUCT.uniforme.unit_price,
        category: "uniforme",
        confidence: "medium",
        commercial_role: "base_uniform",
        attributes: {
          cuello: "Cuello en V",
          manga: "Corta",
          tela: "Dry-fit",
          deporte: "Fútbol",
        },
      },
    ];
    parseNote += " · mirror + comercial×8 (parser Life 0 filas)";
  } else if (!detailRows.length) {
    return {
      case: spec.case,
      ok: false,
      stage: "parse",
      partner_mode: spec.partner_mode,
      customer_name: customerName,
      error: parsed.error || "no_rows",
      parse: parseNote,
      history_probe: historyProbe,
    };
  } else {
    const built = buildCommercialFromRows(detailRows);
    draftRows = built.draftRows;
    resolved = built.resolved;
    if (spec.entry === "excel_life_qty_edge") {
      bumpedMin = ensureMinUniform(draftRows, resolved);
      parseNote += bumpedMin ? " · qty subida a mín.6 (acuerdo staff)" : " · qty ok";
    } else if (draftRows.some((r) => r.commercial_role === "base_uniform" && r.quantity < 6)) {
      bumpedMin = ensureMinUniform(draftRows, resolved);
      parseNote += bumpedMin ? " · auto-bump mín.6" : "";
    }
  }

  const qty = draftRows.reduce((s, r) => s + r.quantity, 0);
  const total = draftRows.reduce((s, r) => s + r.quantity * r.unit_price, 0);
  const orderNoteHtml = buildOdooOrderNoteHtml({
    title: customerName,
    commercialLines: draftRows.map((r) => ({ name: r.name, quantity: r.quantity })),
    detailRows,
    listLayout,
    mirrorGrid,
    sheetName: parsed.sheetName || null,
    designNotes: `Reingreso tarea ${manifest.source?.name || ""} · ${spec.note} · ${parseNote}`,
    referenceFiles: [xlsx],
    projectName: "Proyecto E2E",
  });

  const built = {
    draft_payload: {
      schema_version: "quote_payload_v2",
      product_text: draftRows.map((r) => r.name).join(" + "),
      quantity: qty,
      unit_cop: draftRows[0]?.unit_price || 0,
      total_cop: total,
      design_product_id: 504,
      customer_display_name: customerName,
      customer_notes: `E2E 10 reingreso ${stamp} case ${spec.case} — no confirmar`,
      formal_quote_requested: true,
      rows: draftRows,
      resolved_lines: resolved,
      order_note_html: orderNoteHtml,
      detail_rows: detailRows,
    },
    order_draft: {
      schema_version: "life_order_people_v1",
      title: customerName,
      detail: {
        rows: detailRows,
        source: spec.entry,
        parse_status: detailRows.length ? "ok" : mirrorGrid ? "mirror_v1" : "empty",
        layout: listLayout,
        mirror_grid: mirrorGrid,
        sheet_name: parsed.sheetName || null,
      },
      commercial: { lines: draftRows, resolved_lines: resolved },
      notes_for_odoo: orderNoteHtml,
    },
  };

  const attachments = buildAttachments(caseDir, spec.entry);

  // Staff WA en user; customer_wa_id vacío → match por nombre (historia) o create (nuevo)
  const request = {
    json: async () => ({
      input: {
        draft_payload: built.draft_payload,
        customer_wa_id: "",
        attachments,
      },
      execution_context: {
        vars: {
          quote: { draft_payload: built.draft_payload },
          order_draft: built.order_draft,
          user: { wa_id: STAFF_WA, name: "Diego Staff", role: "staff" },
        },
      },
    }),
  };

  const resp = await handler(request, env);
  const body = typeof resp?.json === "function" ? await resp.json() : resp;
  const orderId = body?.vars?.order?.id;

  let audit = null;
  if (orderId) {
    audit = await auditAndFill(env, orderId, built);
  }

  const expectedHistory = spec.partner_mode === "history";
  const partnerOk =
    Boolean(audit?.partner_id) &&
    (expectedHistory
      ? audit.partner_has_history ||
        (historyProbe?.partners || []).some((p) => p.id === audit.partner_id)
      : !audit.partner_has_history ||
        String(audit.partner_name || "").includes(`E2E NUEVO ${stamp}`));

  return {
    case: spec.case,
    ok: Boolean(orderId) && Boolean(audit?.spreadsheet_id),
    partner_mode: spec.partner_mode,
    entry: spec.entry,
    note: spec.note,
    task: manifest.source,
    customer_requested: customerName,
    history_probe: historyProbe
      ? {
          candidates: (historyProbe.partners || []).slice(0, 3).map((p) => ({
            id: p.id,
            name: p.name,
          })),
          so_count: historyProbe.so_count,
          latest: historyProbe.latest_so?.name || null,
        }
      : null,
    parse: parseNote,
    parse_rows: detailRows.length,
    bumped_min6: bumpedMin,
    write_status: body?.status || body?.ok,
    write_error: body?.error || body?.message || null,
    order_id: orderId || null,
    partner_match_ok: partnerOk,
    ...audit,
  };
}

async function main() {
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  const local = loadEnv(path.join(root, ".env"));
  Object.assign(process.env, local);
  const env = {
    ODOO_URL:
      local.ODOO_LIFEDEPORTES_TEST_URL ||
      local.ODOO_LIFEDEPORTES_URL ||
      local.ODOO_URL,
    ODOO_DB:
      local.ODOO_LIFEDEPORTES_TEST_DB ||
      local.ODOO_LIFEDEPORTES_DB ||
      local.ODOO_DB,
    ODOO_USERNAME:
      local.ODOO_LIFEDEPORTES_TEST_USERNAME ||
      local.ODOO_LIFEDEPORTES_USERNAME ||
      local.ODOO_USERNAME,
    ODOO_PASSWORD:
      local.ODOO_LIFEDEPORTES_TEST_PASSWORD ||
      local.ODOO_LIFEDEPORTES_PASSWORD ||
      local.ODOO_PASSWORD,
    LIFE_DESIGN_PRODUCT_ID: "504",
    FORMULARIO_FILL_MODE: "both",
  };
  console.log("Odoo", env.ODOO_URL, env.ODOO_DB, "staff", STAFF_WA);

  const only = process.argv.includes("--only")
    ? Number(process.argv[process.argv.indexOf("--only") + 1])
    : null;

  const handler = loadHandler(fs.readFileSync(FN_PATH, "utf8"));
  const stamp = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "");
  const specs = only ? MATRIX.filter((m) => m.case === only) : MATRIX;
  const results = [];

  for (const spec of specs) {
    console.log(`\n=== case ${spec.case} ${spec.partner_mode} ${spec.entry} ===`);
    try {
      const r = await runOne(handler, env, spec, stamp);
      results.push(r);
      console.log(
        JSON.stringify(
          {
            case: r.case,
            ok: r.ok,
            so: r.so_name,
            partner: r.partner_name,
            history: r.partner_has_history,
            match_ok: r.partner_match_ok,
            people: r.people_cf,
            talla: r.talla_sample,
            url: r.spreadsheet_url,
            err: r.error || r.write_error,
          },
          null,
          2
        )
      );
      fs.writeFileSync(
        path.join(OUT_ROOT, `case_${String(spec.case).padStart(2, "0")}.json`),
        JSON.stringify(r, null, 2)
      );
    } catch (e) {
      const err = { case: spec.case, ok: false, error: String(e.message || e), stack: e.stack };
      results.push(err);
      console.error(err);
    }
  }

  const summary = {
    at: new Date().toISOString(),
    stamp,
    staff_wa: STAFF_WA,
    odoo: env.ODOO_URL,
    pass: results.filter((r) => r.ok).length,
    fail: results.filter((r) => !r.ok).length,
    history_matched: results.filter((r) => r.partner_mode === "history" && r.partner_match_ok).length,
    new_created: results.filter((r) => r.partner_mode === "new" && r.ok).length,
    results: results.map((r) => ({
      case: r.case,
      ok: r.ok,
      partner_mode: r.partner_mode,
      entry: r.entry,
      so_name: r.so_name,
      partner_name: r.partner_name,
      partner_has_history: r.partner_has_history,
      partner_match_ok: r.partner_match_ok,
      people_cf: r.people_cf,
      talla_sample: r.talla_sample,
      spreadsheet_url: r.spreadsheet_url,
      error: r.error || r.write_error || null,
    })),
  };
  fs.writeFileSync(path.join(OUT_ROOT, "SUMMARY.json"), JSON.stringify(summary, null, 2));

  const md = [
    `# E2E 10 reingresos — ${stamp}`,
    "",
    `Staff WA: \`${STAFF_WA}\` · Odoo test · **${summary.pass}/10** OK`,
    "",
    "| # | Modo | Entrada | SO | Partner | Historia | Formulario | OK |",
    "|---|------|---------|----|---------|----------|------------|----|",
    ...results.map((r) => {
      const hist = r.partner_mode === "history" ? (r.partner_has_history ? "sí" : "¿?") : "nuevo";
      return `| ${r.case} | ${r.partner_mode} | ${r.entry || ""} | ${r.so_name || "—"} | ${r.partner_name || r.customer_requested || "—"} | ${hist} | ${r.people_cf ?? "—"} · ${r.talla_sample || ""} | ${r.ok ? "✓" : "✗"} |`;
    }),
    "",
    "## Criterios",
    "- **history**: `customer_display_name` = nombre real del partner de la tarea; sin WA cliente → `findPartnerByName`.",
    "- **new**: nombre único `E2E NUEVO …` → debe crear partner sin historia previa.",
    "- Staff WA solo en `vars.user` (no como `customer_wa_id`).",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT_ROOT, "REPORT.md"), md);
  console.log("\nSUMMARY", JSON.stringify(summary, null, 2));
  console.log("Wrote", OUT_ROOT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
