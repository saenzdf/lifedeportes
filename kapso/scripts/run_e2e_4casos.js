#!/usr/bin/env node
/**
 * 4 casos E2E Formulario (2026-07-12):
 *  c1 — Excel FORMATO LIFE (GELBERSON) + foto
 *  c2 — Texto recreado de conversación Kapso ventas (cliente)
 *  c3 — Tarea sin Excel: fotos lista+refs (Centro VC)
 *  c4 — PRESEAS 14 solo Excel minimalista (no formato Life)
 *
 * Regla dura: NO forzar cuadre personas↔qty SO. Canal A = líneas comerciales;
 * canal B = nombres/tallas del detalle. Si no coinciden → needs_review visible.
 *
 *   node kapso/scripts/run_e2e_4casos.js
 *   node kapso/scripts/run_e2e_4casos.js --only c1
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { parseListAttachmentBytes } from "../functions/lib/parse_list_bytes.js";
import {
  buildFormularioPayload,
  validateFormularioPayload,
  payloadToFillInput,
} from "../functions/lib/payload_formulario.js";
import { applyLifeFormularioFill } from "../functions/lib/sale_order_spreadsheet.js";
import { applyPlantillaV2 } from "./apply_formulario_plantilla_v2.js";
import {
  buildOdooOrderNoteHtml,
  buildExcelMirrorHtml,
} from "../functions/lib/build_odoo_order_note.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const PACK = path.join(root, "scratch/e2e_4casos_2026-07-12");
const FN_PATH = path.join(root, "kapso/functions/odoo_create_lead_and_so.js");

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

function bucketRows(rows) {
  const buckets = { uniforme: [], camiseta: [], chaqueta: [], other: [] };
  for (const row of rows || []) {
    const rol = String(row.rol || row.comentario || row.grupo || "").toLowerCase();
    // Arquero cuenta dentro de uniforme (no línea standalone < 6)
    if (/chaqueta|rompe/i.test(rol)) buckets.chaqueta.push(row);
    else if (
      (row.camiseta || /camiseta|coach/i.test(rol) || row.product_choice_hint === "camiseta") &&
      !/uniforme/i.test(rol)
    )
      buckets.camiseta.push(row);
    else if (row.uniforme || row.product_choice_hint === "uniforme" || /uniforme|fútbol|futbol|arquero/i.test(rol) || row.arquero)
      buckets.uniforme.push(row);
    else buckets.uniforme.push(row);
  }
  return buckets;
}

const PRODUCT = {
  uniforme: { product_id: 12409, name: "Uniforme de Fútbol", unit_price: 50000, category: "uniforme" },
  camiseta: {
    product_id: 11790,
    name: "Camiseta deportiva dry-fit",
    unit_price: 30000,
    category: "camiseta",
  },
  arquero: { product_id: 12409, name: "Uniforme de Fútbol", unit_price: 50000, category: "uniforme" },
  chaqueta: {
    product_id: 11740,
    name: "Chaqueta Rompevientos",
    unit_price: 65000,
    category: "otros",
  },
};

/**
 * Arma borrador con canales SEPARADOS (no forzar cuadre):
 * - detailRows → Formulario / nota lista (solo lo parseado de verdad)
 * - commercialLines → líneas SO (solo lo comercial resuelto)
 * Si commercialLines se omite y deriveCommercialFromDetail=true, se derivan del detalle
 * (válido solo cuando el mismo parse Life produjo ambos).
 */
function buildOrderPayload(label, { detailRows = [], commercialLines = null, deriveCommercialFromDetail = false, ...extras } = {}) {
  const rows = detailRows || [];
  let draftRows = [];
  let resolved = [];

  if (Array.isArray(commercialLines) && commercialLines.length) {
    draftRows = commercialLines.map((l) => ({
      name: l.name || l.product_text || l.product_base,
      product_id: l.product_id || l.product_variant_id,
      quantity: Number(l.quantity || 0),
      unit_price: Number(l.unit_price || l.unit_cop || 0),
      category: l.category || "uniforme",
      commercial_role: l.commercial_role || (l.category === "uniforme" ? "base_uniform" : "extra"),
    }));
    resolved = draftRows.map((l, i) => ({
      id: `rl_${i + 1}`,
      line_id: `rl_${i + 1}`,
      product_id: l.product_id,
      product_variant_id: l.product_id,
      product_base: l.name,
      product_text: l.name,
      quantity: l.quantity,
      unit_price: l.unit_price,
      category: l.category,
      confidence: "high",
      commercial_role: l.commercial_role,
      attributes: l.attributes || {
        cuello: "Cuello en V",
        manga: "Corta",
        tela: "Dry-fit",
        deporte: "Fútbol",
      },
    }));
  } else if (deriveCommercialFromDetail && rows.length) {
    const buckets = bucketRows(rows);
    let i = 0;
    for (const [key, list] of Object.entries(buckets)) {
      if (!list.length || key === "other") continue;
      const fb = PRODUCT[key] || PRODUCT.uniforme;
      i += 1;
      const role =
        key === "uniforme" ? "base_uniform" : key === "camiseta" || key === "chaqueta" ? "extra" : "base_product";
      draftRows.push({
        name: fb.name,
        product_id: fb.product_id,
        quantity: list.length,
        unit_price: fb.unit_price,
        category: fb.category,
        commercial_role: role,
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
        commercial_role: role,
        attributes: {
          cuello: "Cuello en V",
          manga: "Corta",
          tela: "Dry-fit",
          deporte: /basket|baloncesto/i.test(label) ? "Baloncesto" : "Fútbol",
          ...(key === "chaqueta" ? { forro: "con forro" } : {}),
        },
      });
    }
  }

  const qty = draftRows.reduce((s, r) => s + r.quantity, 0);
  const total = draftRows.reduce((s, r) => s + r.quantity * r.unit_price, 0);
  const personCount = rows.filter((r) => r.nombre || r.talla).length;
  const qtyMatch =
    personCount === 0 && qty === 0
      ? null
      : personCount > 0 && qty > 0
        ? personCount === qty
        : false;

  const listLayout = extras.listLayout || extras.layout || null;
  const orderNoteHtml =
    extras.order_note_html ||
    buildOdooOrderNoteHtml({
      title: extras.customer || label,
      commercialLines: draftRows.map((r) => ({
        name: r.name,
        quantity: r.quantity,
        variant_notes: "",
      })),
      detailRows: rows,
      listLayout,
      mirrorGrid: extras.mirrorGrid || null,
      mirrorHtml: extras.mirrorHtml || null,
      sheetName: extras.sheetName || null,
      designNotes: extras.interpretation || null,
      referenceFiles: extras.referenceFiles || [],
    });

  return {
    draft_payload: {
      schema_version: "quote_payload_v2",
      product_text: draftRows.map((r) => r.name).join(" + ") || extras.product_text || "Pedido",
      quantity: qty,
      unit_cop: draftRows[0]?.unit_price || 0,
      total_cop: total,
      design_product_id: 504,
      customer_display_name: extras.customer || label,
      customer_notes: `E2E 4casos ${label} — no confirmar`,
      formal_quote_requested: true,
      rows: draftRows,
      resolved_lines: resolved,
      order_note_html: orderNoteHtml,
      detail_rows: rows,
      mirror_grid: extras.mirrorGrid || null,
      detail_layout: listLayout,
    },
    order_draft: {
      schema_version: "life_order_people_v1",
      title: extras.customer || label,
      detail: {
        rows,
        source: extras.source || "e2e",
        parse_status: rows?.length ? "ok" : extras.mirrorGrid ? "mirror_v1" : "empty",
        layout: listLayout,
        excel_layout: listLayout,
        mirror_grid: extras.mirrorGrid || null,
        mirror_html: extras.mirrorHtml || null,
        sheet_name: extras.sheetName || null,
      },
      commercial: { lines: draftRows, resolved_lines: resolved },
      notes_for_odoo: orderNoteHtml,
    },
    channels: { person_count: personCount, line_qty: qty, qty_match: qtyMatch },
  };
}

/** @deprecated use buildOrderPayload — name kept for call sites during edit */
function buildFromRows(label, rows, extras = {}) {
  return buildOrderPayload(label, {
    detailRows: rows,
    deriveCommercialFromDetail: extras.deriveCommercialFromDetail !== false && !extras.commercialLines,
    commercialLines: extras.commercialLines || null,
    ...extras,
  });
}

function parsePreseasTextLista(text) {
  const rows = [];
  let currentRol = "Uniforme";
  for (const line of String(text).split("\n")) {
    const sec = line.match(/^\*\*\d+\.\s*(.+?)\s*\(/);
    if (sec) {
      currentRol = sec[1].replace(/\*+/g, "").trim();
      continue;
    }
    const m = line.match(/^\d+\.\s*(.+?)\s*·\s*#?([^\s·]*)\s*·\s*([^\s·]+)\s*(?:·\s*(.*))?$/);
    if (!m) continue;
    rows.push({
      nombre: m[1].trim(),
      numero: m[2].replace(/^#/, "").trim(),
      talla: m[3].trim(),
      comentario: (m[4] || "").trim(),
      rol: currentRol,
      arquero: /arquero/i.test(m[4] || "") || /arquero/i.test(currentRol),
      camiseta: /camiseta/i.test(currentRol),
      uniforme: /uniforme/i.test(currentRol),
    });
  }
  return rows;
}

function parsePreseasMinimalSheet(parsed) {
  // parseListAttachmentBytes may return generic rows; also read via AOA from warnings
  const rows = [];
  for (const r of parsed.rows || []) {
    rows.push({
      nombre: r.nombre || r.name || "",
      numero: r.numero || r.number || "",
      talla: r.talla || r.size || "",
      comentario: r.comentario || r.comment || r.color || "",
      rol: r.seccion || r.rol || r.grupo || "",
      arquero: /arquero/i.test(String(r.comentario || r.nota || "")),
      camiseta: /camiseta/i.test(String(r.seccion || r.rol || "")),
      uniforme: /uniforme/i.test(String(r.seccion || r.rol || "")),
    });
  }
  return rows;
}

/** Fallback: read PRESEAS minimal xlsx with known columns via parse or manual map from CSV twin */
function loadPreseasRowsFromCsvFallback() {
  const csv = path.join(PACK, "c4_preseas_excel/PRESEAS_14_minimal.csv");
  if (!fs.existsSync(csv)) return [];
  const lines = fs.readFileSync(csv, "utf8").trim().split("\n").slice(1);
  return lines.map((line) => {
    const [seccion, nombre, numero, talla, color, nota] = line.split(",");
    return {
      nombre,
      numero,
      talla,
      comentario: [color, nota].filter(Boolean).join(" · "),
      rol: seccion,
      arquero: /arquero/i.test(nota || ""),
      camiseta: /camiseta/i.test(seccion || ""),
      uniforme: /uniforme/i.test(seccion || ""),
    };
  });
}

async function auditAndFill(env, orderId, built) {
  const uid = await odooRpc(env.ODOO_URL, "common", "authenticate", [
    env.ODOO_DB,
    env.ODOO_USERNAME,
    env.ODOO_PASSWORD,
    {},
  ]);
  const kw = (model, method, a = [], kwargs = {}) =>
    odooRpc(env.ODOO_URL, "object", "execute_kw", [
      env.ODOO_DB,
      uid,
      env.ODOO_PASSWORD,
      model,
      method,
      a,
      kwargs,
    ]);

  const so = (
    await kw("sale.order", "read", [[orderId]], {
      fields: ["id", "name", "note", "order_line", "partner_id"],
    })
  )[0];

  // Fase 1: descripción = lista entendida (tablas Life o espejo Excel)
  const noteHtml =
    built.order_draft?.notes_for_odoo ||
    built.draft_payload?.order_note_html ||
    "";
  if (noteHtml && noteHtml.includes("<") && noteHtml.length > 80) {
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

  // Ensure plantilla v2 on this SO sheet
  const tmpl = (
    await kw("sale.order.spreadsheet", "read", [[11]], { fields: ["spreadsheet_snapshot"] })
  )[0];
  let baseSnap = decodeSnap(tmpl.spreadsheet_snapshot);
  // Template 11 already v2; clone as-is (avoid double-apply). If missing I1, apply.
  const pedido = (baseSnap.sheets || []).find((s) => /^pedido$/i.test(s.name));
  if (pedido && pedido.cells?.I1 !== "Producto base") {
    baseSnap = applyPlantillaV2(baseSnap);
  }

  if (!sheets.length) {
    const id = await kw("sale.order.spreadsheet", "create", [
      {
        name: "Formulario pedido Life",
        order_id: orderId,
        spreadsheet_snapshot: encodeSnap(baseSnap),
      },
    ]);
    sheets = [{ id, name: "Formulario pedido Life", spreadsheet_snapshot: encodeSnap(baseSnap) }];
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
    meta: { source: "e2e_4casos" },
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

  const lineQty = lines
    .filter((l) => !/dise[nñ]o/i.test(l.name || ""))
    .reduce((s, l) => s + Number(l.product_uom_qty || 0), 0);
  const channels = built.channels || {
    person_count: (built.order_draft?.detail?.rows || []).length,
    line_qty: lineQty,
    qty_match: null,
  };
  const confront = {
    person_count_detail: channels.person_count,
    people_cf_sheet: people,
    line_qty_so: lineQty,
    qty_match:
      people === 0 && lineQty === 0
        ? null
        : people > 0 && lineQty > 0
          ? people === lineQty
          : false,
    needs_review:
      Boolean(validation.warnings?.length) ||
      (people > 0 && lineQty > 0 && people !== lineQty) ||
      (people === 0 && lineQty > 0) ||
      (people > 0 && lineQty === 0),
    payload_warnings: validation.warnings || [],
  };

  return {
    so_name: so.name,
    partner: so.partner_id,
    note_chars: String(so.note || "").length,
    note_preview: String(so.note || "").replace(/<[^>]+>/g, " ").slice(0, 280),
    lines: lines.map((l) => ({
      qty: l.product_uom_qty,
      name: String(l.name || "").split("\n")[0].slice(0, 80),
      price: l.price_unit,
    })),
    spreadsheet_id: sheets[0].id,
    spreadsheet_url: `${env.ODOO_URL}/odoo/sales/${orderId}/sale-order-spreadsheet/${sheets[0].id}`,
    filled,
    mode,
    people_cf: people,
    channels_confront: confront,
    payload_validation: validation,
    sample: {
      C2: cellVal(form?.cells?.C2),
      D2: cellVal(form?.cells?.D2),
      E2: cellVal(form?.cells?.E2),
      F2: cellVal(form?.cells?.F2),
      H2: cellVal(form?.cells?.H2),
      I2: cellVal(form?.cells?.I2),
      M2: cellVal(form?.cells?.M2),
      B2: cellVal(form?.cells?.B2),
    },
  };
}

async function invokeWriter(handler, env, built, attachments = []) {
  const request = {
    json: async () => ({
      input: {
        draft_payload: built.draft_payload,
        customer_wa_id: "3000000047",
        attachments,
      },
      execution_context: {
        vars: {
          quote: { draft_payload: built.draft_payload },
          order_draft: built.order_draft,
          user: { wa_id: "3000000047", name: "Diego E2E", role: "staff" },
        },
      },
    }),
  };
  const resp = await handler(request, env);
  const body = typeof resp?.json === "function" ? await resp.json() : resp;
  return body;
}

async function runC1(handler, env) {
  const dir = path.join(PACK, "c1_life_excel");
  const xlsx = "FORMATO_GELBERSON.xlsx";
  const bytes = new Uint8Array(fs.readFileSync(path.join(dir, xlsx)));
  const parsed = await parseListAttachmentBytes(bytes, xlsx);
  // Mismo parse Life → detalle + comercial (derive OK; no inventamos filas).
  const built = buildFromRows("E2E c1 GELBERSON Life Excel", parsed.rows || [], {
    customer: "E2E c1 GELBERSON",
    source: "excel_formato_life",
    deriveCommercialFromDetail: true,
    listLayout: parsed.layout || "formato_life_v1",
    interpretation: `Parse Life: ok=${parsed.ok} rows=${(parsed.rows || []).length} layout=${parsed.layout || parsed.parse_report?.layout || ""}`,
    referenceFiles: [xlsx],
  });
  const img = fs.readdirSync(dir).find((f) => /\.jpe?g$/i.test(f));
  const attachments = [
    {
      filename: xlsx,
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content_base64: Buffer.from(bytes).toString("base64"),
    },
  ];
  if (img) {
    attachments.push({
      filename: img,
      mime_type: "image/jpeg",
      content_base64: fs.readFileSync(path.join(dir, img)).toString("base64"),
    });
  }
  const write = await invokeWriter(handler, env, built, attachments);
  const orderId = write?.vars?.order?.id || write?.order_id || write?.sale_order_id || write?.data?.order_id;
  if (!orderId) return { case: "c1", ok: false, stage: "write", write, parse: { ok: parsed.ok, rows: (parsed.rows || []).length, layout: parsed.layout } };
  const audit = await auditAndFill(env, orderId, built);
  return { case: "c1", ok: true, label: "Excel FORMATO LIFE GELBERSON", parse: { ok: parsed.ok, rows: (parsed.rows || []).length, layout: parsed.layout || parsed.parse_report?.layout }, write_status: write?.status || write?.ok, ...audit };
}

async function runC2(handler, env) {
  // Recreación desde Kapso ventas (snippets reales platform_conversations + cierre ingreso)
  const convo = `Cliente (Kapso ventas — recreación):
Hola, quiero cotizar uniformes de futbol para 16 personas
Que sea del inter de Bogotá

[audio transcript real Kapso]
Buenas tardes, ¿cómo estás? Eh, es que necesito ocho uniformes para un equipo de fútbol. Eh, con estampado, ¿cuánto me sale?

Staff cierre para ingreso (texto):
Pedido Inter Bogotá — 16 uniformes de fútbol dry-fit, cuello V, manga corta, con medias.
Lista jugadores:
1. ANDRES · #10 · M
2. CAMILO · #7 · L
3. DIEGO · #9 · M
4. ESTEBAN · #1 · L · arquero
5. FELIPE · #5 · S
6. GABRIEL · #8 · M
7. HUGO · #11 · L
8. IVAN · #4 · M
9. JORGE · #6 · S
10. KEVIN · #3 · M
11. LUIS · #2 · L
12. MARCO · #14 · M
13. NESTOR · #15 · S
14. OSCAR · #16 · M
15. PABLO · #17 · L
16. RAUL · #18 · M`;
  fs.writeFileSync(path.join(PACK, "c2_texto_kapso/cliente_conversacion_recreada.txt"), convo);

  const rows = [];
  for (const line of convo.split("\n")) {
    const m = line.match(/^\d+\.\s*(.+?)\s*·\s*#(\d+)\s*·\s*(\S+)(?:\s*·\s*(.*))?$/);
    if (!m) continue;
    rows.push({
      nombre: m[1].trim(),
      numero: m[2],
      talla: m[3],
      comentario: (m[4] || "").trim(),
      rol: "Uniforme de Fútbol",
      arquero: /arquero/i.test(m[4] || ""),
      uniforme: true,
    });
  }
  // Lista en el mismo texto de ingreso → derive OK. Nota = tablas Life (no <pre> narrativo).
  const built = buildFromRows("E2E c2 texto Kapso ventas", rows, {
    customer: "E2E c2 Inter Bogotá",
    source: "kapso_sales_conversation_text",
    deriveCommercialFromDetail: true,
    listLayout: "texto_lista_v1",
    interpretation: "Conversación Kapso ventas + lista cerrada para ingreso.",
  });
  const write = await invokeWriter(handler, env, built, []);
  const orderId = write?.vars?.order?.id || write?.order_id || write?.sale_order_id || write?.data?.order_id;
  if (!orderId) return { case: "c2", ok: false, stage: "write", write, rows: rows.length };
  const audit = await auditAndFill(env, orderId, built);
  return { case: "c2", ok: true, label: "Texto conversación Kapso ventas", rows: rows.length, ...audit };
}

async function runC3(handler, env) {
  const dir = path.join(PACK, "c3_foto_texto");
  const original = JSON.parse(fs.readFileSync(path.join(dir, "original_so_lines.json"), "utf8"));
  const qty =
    original.lines?.find((l) => /uniforme/i.test(l.name))?.product_uom_qty || 20;
  // Canal A: qty comercial de evidencia SO. Canal B: vacío (sin OCR) — NO inventar JUGADOR N.
  const textFallback = `Pedido Centro VC (tarea sin Excel — lista en foto LISTADO CENTRO.jpeg).
Uniforme de fútbol × ${qty} (evidencia SO).
Referencias: HD, RB, VZ, UNIFORME CENTRO.
Detalle nombres/tallas: OCR no ejecutado → Formulario debe quedar vacío y confrontación needs_review.`;

  const commercialLines = [
    {
      ...PRODUCT.uniforme,
      quantity: qty,
      commercial_role: "base_uniform",
      attributes: {
        cuello: "Cuello en V",
        manga: "Corta",
        tela: "Dry-fit",
        deporte: "Fútbol",
      },
    },
  ];
  const built = buildOrderPayload("E2E c3 Centro VC foto/texto", {
    detailRows: [],
    commercialLines,
    customer: "E2E c3 Centro VC",
    source: "task_photo_list_no_ocr",
    listLayout: "photo_pending_ocr",
    interpretation: textFallback,
    referenceFiles: fs.readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)),
  });

  const attachments = fs
    .readdirSync(dir)
    .filter((f) => /\.jpe?g$/i.test(f))
    .map((f) => ({
      filename: f,
      mime_type: "image/jpeg",
      content_base64: fs.readFileSync(path.join(dir, f)).toString("base64"),
    }));

  const write = await invokeWriter(handler, env, built, attachments);
  const orderId = write?.vars?.order?.id || write?.order_id || write?.sale_order_id || write?.data?.order_id;
  if (!orderId) return { case: "c3", ok: false, stage: "write", write, attachments: attachments.length };
  const audit = await auditAndFill(env, orderId, built);
  return {
    case: "c3",
    ok: true,
    label: "Tarea sin Excel (fotos Centro VC)",
    attachments: attachments.length,
    note_goal: "identificar + descripción + pedido; confrontación debe marcar desfase si no hay OCR",
    expect_mismatch: true,
    ...audit,
  };
}

async function runC4(handler, env) {
  const dir = path.join(PACK, "c4_preseas_excel");
  const xlsx = "PRESEAS_14_minimal.xlsx";
  const bytes = new Uint8Array(fs.readFileSync(path.join(dir, xlsx)));
  const parsed = await parseListAttachmentBytes(bytes, xlsx);
  // Life parser → 0. Espejo Excel en nota. Secciones CSV = best-effort para Formulario (no fuerza SO).
  const lifeRows = parsePreseasMinimalSheet(parsed);
  const sectionRows = lifeRows.length ? lifeRows : loadPreseasRowsFromCsvFallback();
  const mirrorGrid =
    parsed.grid ||
    [
      ["SECCION", "NOMBRE", "NUMERO", "TALLA", "COLOR", "NOTA"],
      ...sectionRows.map((r) => [
        r.rol || "",
        r.nombre || "",
        r.numero || "",
        r.talla || "",
        "",
        r.comentario || "",
      ]),
    ];

  const understand = {
    ok: parsed.ok,
    layout: parsed.layout || parsed.parse_report?.layout || null,
    rows_parsed: (parsed.rows || []).length,
    life_rows: lifeRows.length,
    section_rows_for_formulario: sectionRows.length,
    use_mirror: true,
    warnings: parsed.warnings || parsed.parse_report?.warnings || [],
    summary: parsed.summary_text || parsed.parse_report?.summary_text || null,
    error: parsed.error || parsed.message || null,
    forced_square: false,
  };
  fs.writeFileSync(path.join(dir, "parse_understand.json"), JSON.stringify(understand, null, 2));

  // Canal A comercial (texto/agente). Nota = espejo. Formulario = filas sección si existen.
  const commercialLines = [
    { ...PRODUCT.uniforme, quantity: 8, commercial_role: "base_uniform" },
    { ...PRODUCT.camiseta, quantity: 3, commercial_role: "extra" },
    { ...PRODUCT.chaqueta, quantity: 4, commercial_role: "extra" },
  ];
  const built = buildOrderPayload("E2E c4 PRESEAS 14 solo Excel", {
    detailRows: sectionRows,
    commercialLines,
    customer: "E2E c4 PRESEAS 14",
    source: "excel_preseas_mirror_plus_sections",
    listLayout: "mirror_v1",
    mirrorGrid,
    sheetName: parsed.sheetName || "PRESEAS",
    interpretation:
      "Excel no Life → nota espejo. Comercial 8+3+4 desde evidencia pedido. Formulario = secciones best-effort (no inventado desde qty SO).",
    referenceFiles: [xlsx],
  });

  const attachments = [
    {
      filename: xlsx,
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content_base64: Buffer.from(bytes).toString("base64"),
    },
  ];
  const write = await invokeWriter(handler, env, built, attachments);
  const orderId = write?.vars?.order?.id || write?.order_id || write?.sale_order_id || write?.data?.order_id;
  if (!orderId) return { case: "c4", ok: false, stage: "write", write, understand };
  const audit = await auditAndFill(env, orderId, built);
  return {
    case: "c4",
    ok: true,
    label: "PRESEAS 14 solo Excel minimalista",
    understand,
    expect_mismatch: sectionRows.length !== 15,
    ...audit,
  };
}

async function main() {
  const envFile = loadEnv(path.join(root, ".env"));
  Object.assign(process.env, envFile);
  const env = {
    ODOO_URL:
      envFile.ODOO_LIFEDEPORTES_TEST_URL ||
      envFile.ODOO_LIFEDEPORTES_URL ||
      envFile.ODOO_URL ||
      process.env.ODOO_URL,
    ODOO_DB:
      envFile.ODOO_LIFEDEPORTES_TEST_DB ||
      envFile.ODOO_LIFEDEPORTES_DB ||
      envFile.ODOO_DB ||
      process.env.ODOO_DB,
    ODOO_USERNAME:
      envFile.ODOO_LIFEDEPORTES_TEST_USERNAME ||
      envFile.ODOO_LIFEDEPORTES_USERNAME ||
      envFile.ODOO_USERNAME ||
      process.env.ODOO_USERNAME,
    ODOO_PASSWORD:
      envFile.ODOO_LIFEDEPORTES_TEST_PASSWORD ||
      envFile.ODOO_LIFEDEPORTES_PASSWORD ||
      envFile.ODOO_PASSWORD ||
      process.env.ODOO_PASSWORD,
    LIFE_DESIGN_PRODUCT_ID: envFile.LIFE_DESIGN_PRODUCT_ID || "504",
    // Gradual: payload + celdas (descripción → SO → Formulario C–F/H–M)
    FORMULARIO_FILL_MODE: "both",
  };
  console.log("Odoo target:", env.ODOO_URL, env.ODOO_DB, "user?", Boolean(env.ODOO_USERNAME));
  if (!env.ODOO_URL || !env.ODOO_PASSWORD) throw new Error("Missing Odoo env");

  const only = process.argv.includes("--only")
    ? process.argv[process.argv.indexOf("--only") + 1]
    : null;

  const source = fs.readFileSync(FN_PATH, "utf8");
  const handler = loadHandler(source);

  const runners = {
    c1: runC1,
    c2: runC2,
    c3: runC3,
    c4: runC4,
  };
  const keys = only ? [only] : ["c1", "c2", "c3", "c4"];
  const results = [];
  for (const k of keys) {
    console.log("\n===", k, "===");
    try {
      const r = await runners[k](handler, env);
      results.push(r);
      console.log(JSON.stringify(r, null, 2));
      fs.writeFileSync(path.join(PACK, k.includes("c") ? `${k.split("_")[0] || k}` : k, "result.json").replace(/c\d/, (m) => {
        const map = { c1: "c1_life_excel", c2: "c2_texto_kapso", c3: "c3_foto_texto", c4: "c4_preseas_excel" };
        return map[m] || m;
      }), JSON.stringify(r, null, 2));
    } catch (e) {
      const err = { case: k, ok: false, error: String(e.message || e), stack: e.stack };
      results.push(err);
      console.error(err);
    }
  }

  // fix result paths properly
  for (const r of results) {
    const map = {
      c1: "c1_life_excel",
      c2: "c2_texto_kapso",
      c3: "c3_foto_texto",
      c4: "c4_preseas_excel",
    };
    if (r.case && map[r.case]) {
      fs.writeFileSync(path.join(PACK, map[r.case], "result.json"), JSON.stringify(r, null, 2));
    }
  }

  const report = {
    at: new Date().toISOString(),
    results: results.map((r) => ({
      case: r.case,
      ok: r.ok,
      label: r.label,
      so_name: r.so_name,
      lines: r.lines,
      people_cf: r.people_cf,
      filled: r.filled,
      channels_confront: r.channels_confront || null,
      expect_mismatch: r.expect_mismatch || false,
      spreadsheet_url: r.spreadsheet_url,
      understand: r.understand || null,
      error: r.error || null,
    })),
  };
  fs.writeFileSync(path.join(PACK, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log("\nREPORT", JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
