/**
 * Organiza lista desde adjuntos de project.task (y/o sale.order ligado).
 * Escribe project.task.description + sale.order.note (mismo HTML).
 * Excel/Word/PDF texto → parsers locales; imagen/PDF raster → Gemini.
 */

import { parseListAttachmentBytes } from "./parse_list_bytes.js";
import { parseLifePdfListBytes } from "./parse_life_pdf.js";
import { buildOdooOrderNoteHtml } from "./build_odoo_order_note.js";
import { compact, stripOppPrefix } from "./order_detail_shared.js";
import { inferCommercialLinesFromDetailRows } from "./list_section_products.js";
import { parseListaImageWithGemini } from "./vision_lista_gemini.js";
import { ensureSoCommercialLines } from "./ensure_so_commercial_lines.js";
import { stripPhoneFromHtml } from "./apply_lista_so_note.js";

function base64ToBytes(b64) {
  const raw = String(b64 || "").replace(/\s+/g, "");
  if (!raw) return new Uint8Array(0);
  if (typeof Buffer !== "undefined") {
    try {
      return new Uint8Array(Buffer.from(raw, "base64"));
    } catch {
      /* fall through */
    }
  }
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isExcel(name) {
  return /\.(xlsx|xlsm|xltx|xls|csv)$/i.test(compact(name));
}
function isWord(name) {
  return /\.docx$/i.test(compact(name));
}
function isPdf(name) {
  return /\.pdf$/i.test(compact(name));
}
function isImage(name, mime = "") {
  return (
    /\.(jpe?g|png|webp|gif)$/i.test(compact(name)) ||
    /^image\//i.test(compact(mime))
  );
}

function looksLikeListaName(name) {
  return /formato|life|pedido|lista|tallas|jugadores|roster|plantel|nomin/i.test(
    compact(name).toLowerCase()
  );
}

/** Prioridad: Excel LIFE → xlsx → PDF → docx → imagen lista. */
export function pickListaAttachment(attachments = []) {
  const list = (attachments || []).filter((a) => a && compact(a.name));
  const excelLife = list.find((a) => isExcel(a.name) && looksLikeListaName(a.name));
  if (excelLife) return { ...excelLife, kind: "excel" };
  const excel = list.find((a) => isExcel(a.name));
  if (excel) return { ...excel, kind: "excel" };
  const pdfLife = list.find((a) => isPdf(a.name) && looksLikeListaName(a.name));
  if (pdfLife) return { ...pdfLife, kind: "pdf" };
  const pdf = list.find((a) => isPdf(a.name));
  if (pdf) return { ...pdf, kind: "pdf" };
  const docx = list.find((a) => isWord(a.name));
  if (docx) return { ...docx, kind: "docx" };
  const imgLista = list.find(
    (a) => isImage(a.name, a.mimetype) && looksLikeListaName(a.name)
  );
  if (imgLista) return { ...imgLista, kind: "image" };
  const img = list.find((a) => isImage(a.name, a.mimetype));
  if (img) return { ...img, kind: "image" };
  return null;
}

async function loadAttachments(odoo, resModel, resId) {
  return (
    (await odoo.executeKw(
      "ir.attachment",
      "search_read",
      [[["res_model", "=", resModel], ["res_id", "=", resId]]],
      { fields: ["id", "name", "mimetype", "datas", "create_date"], limit: 50, order: "id desc" }
    )) || []
  );
}

async function ensureDatas(odoo, att) {
  if (att.datas) return att;
  const full = await odoo.executeKw("ir.attachment", "read", [[att.id]], {
    fields: ["id", "name", "mimetype", "datas"],
  });
  att.datas = full?.[0]?.datas;
  att.mimetype = att.mimetype || full?.[0]?.mimetype;
  return att;
}

async function parseAttachment(odoo, pick, env = {}) {
  await ensureDatas(odoo, pick);
  const bytes = base64ToBytes(pick.datas);
  if (!bytes.length) {
    return { ok: false, reason: "empty_attachment", filename: pick.name };
  }

  const kind = pick.kind || (isImage(pick.name, pick.mimetype) ? "image" : isPdf(pick.name) ? "pdf" : "excel");

  if (kind === "image" || (kind === "pdf" && bytes[0] !== 0x25 /* rare */)) {
    // try binary parsers first for pdf; images go to vision
  }

  if (kind === "excel" || kind === "docx" || isExcel(pick.name) || isWord(pick.name)) {
    const parsed = await parseListAttachmentBytes(bytes, pick.name);
    if (parsed.ok && parsed.rows?.length) return { ...parsed, source_kind: kind };
    return {
      ok: false,
      reason: parsed.error || "organize_failed",
      message: parsed.message,
      filename: pick.name,
    };
  }

  if (kind === "pdf" || isPdf(pick.name)) {
    const parsed = await parseLifePdfListBytes(bytes, pick.name);
    if (parsed.ok && parsed.rows?.length) return { ...parsed, source_kind: "pdf" };
    if (parsed.needs_ocr) {
      const vision = await parseListaImageWithGemini(bytes, {
        mime: "application/pdf",
        filename: pick.name,
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL,
      });
      if (vision.ok) return { ...vision, source_kind: "pdf_vision" };
      return {
        ok: false,
        reason: "needs_ocr",
        needs_ocr: true,
        message: vision.message || parsed.message,
        filename: pick.name,
        vision,
      };
    }
    return {
      ok: false,
      reason: parsed.error || "organize_failed",
      message: parsed.message,
      filename: pick.name,
    };
  }

  // image
  const vision = await parseListaImageWithGemini(bytes, {
    mime: pick.mimetype || "image/jpeg",
    filename: pick.name,
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
  });
  if (vision.ok) return { ...vision, source_kind: "image_vision" };
  return {
    ok: false,
    reason: vision.error || "needs_vision",
    needs_ocr: true,
    message: vision.message,
    filename: pick.name,
    vision,
  };
}

/**
 * @param {{ executeKw: Function }} odoo
 * @param {{
 *   taskId: number,
 *   force?: boolean,
 *   syncCommercial?: boolean,
 *   env?: object,
 * }} opts
 */
export async function applyListaFromTask(odoo, opts = {}) {
  const taskId = Number(opts.taskId || 0);
  if (!taskId) return { applied: false, reason: "no_task_id" };

  const tasks = await odoo.executeKw("project.task", "read", [[taskId]], {
    fields: ["id", "name", "description", "sale_order_id", "partner_id"],
  });
  const task = tasks?.[0];
  if (!task) return { applied: false, reason: "task_missing" };

  const orderId = Number(
    Array.isArray(task.sale_order_id) ? task.sale_order_id[0] : task.sale_order_id
  ) || 0;

  let order = null;
  if (orderId) {
    const orders = await odoo.executeKw("sale.order", "read", [[orderId]], {
      fields: [
        "id",
        "name",
        "note",
        "x_studio_nombre_del_pedido",
        "partner_id",
      ],
    });
    order = orders?.[0] || null;
  }

  const taskAtts = await loadAttachments(odoo, "project.task", taskId);
  const soAtts = orderId ? await loadAttachments(odoo, "sale.order", orderId) : [];
  const fromTask = pickListaAttachment(taskAtts);
  const fromSo = pickListaAttachment(soAtts);
  const pick = fromTask
    ? { ...fromTask, from_so: false }
    : fromSo
      ? { ...fromSo, from_so: true }
      : null;

  if (!pick || !pick.id) {
    return {
      applied: false,
      reason: "no_list_attachment",
      message:
        "Sube a la tarea un Excel FORMATO LIFE, PDF de lista o foto de la lista, luego vuelve a ejecutar Interpretar lista.",
      task_id: taskId,
      order_id: orderId || null,
      attachment_names: [...taskAtts, ...soAtts].map((a) => a.name),
    };
  }

  const parsed = await parseAttachment(odoo, pick, opts.env || {});
  if (!parsed.ok) {
    return {
      applied: false,
      reason: parsed.reason || "organize_failed",
      message: parsed.message || "No se pudo organizar la lista.",
      filename: pick.name,
      task_id: taskId,
      order_id: orderId || null,
      needs_ocr: Boolean(parsed.needs_ocr),
      source: pick.from_so ? "sale.order" : "project.task",
    };
  }

  const title =
    stripOppPrefix(
      compact(opts.title) ||
        compact(order?.x_studio_nombre_del_pedido) ||
        (Array.isArray(order?.partner_id) ? compact(order.partner_id[1]) : "") ||
        compact(task.name) ||
        compact(order?.name) ||
        ""
    ) || "Pedido";

  const commercialLines = inferCommercialLinesFromDetailRows(parsed.rows).map((l) => ({
    name: l.product_text || l.name,
    product_text: l.product_text || l.name,
    quantity: l.quantity,
    label: l.product_text || l.name,
  }));

  const noteHtml = stripPhoneFromHtml(
    buildOdooOrderNoteHtml({
      title,
      detailRows: parsed.rows,
      listLayout: parsed.layout || "",
      mirrorGrid: parsed.grid || null,
      sheetName: parsed.sheetName || "",
      commercialLines,
    })
  );

  await odoo.executeKw("project.task", "write", [[taskId], { description: noteHtml }]);
  if (orderId) {
    await odoo.executeKw("sale.order", "write", [[orderId], { note: noteHtml }]);
  }

  let commercial = { skipped: true, reason: "not_requested" };
  if (opts.syncCommercial !== false && orderId) {
    try {
      commercial = await ensureSoCommercialLines(odoo, {
        orderId,
        detailRows: parsed.rows,
        env: opts.env || {},
      });
    } catch (err) {
      commercial = {
        skipped: true,
        reason: "commercial_error",
        error: String(err?.message || err).slice(0, 300),
      };
    }
  }

  try {
    await odoo.executeKw(
      "project.task",
      "message_post",
      [[taskId]],
      {
        body: `Lista organizada desde <b>${compact(pick.name)}</b> (${parsed.rows.length} filas) → descripción de tarea${orderId ? " + nota del presupuesto" : ""}.`,
        message_type: "comment",
        subtype_xmlid: "mail.mt_note",
      }
    );
  } catch {
    /* chatter optional */
  }

  return {
    applied: true,
    reason: "ok",
    task_id: taskId,
    order_id: orderId || null,
    order_name: order?.name || null,
    filename: pick.name,
    rows: parsed.rows.length,
    layout: parsed.layout || null,
    source_kind: parsed.source_kind || pick.kind,
    source: pick.from_so ? "sale.order" : "project.task",
    commercial,
  };
}
