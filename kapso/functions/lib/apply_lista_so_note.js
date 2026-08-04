/**
 * Desde adjuntos de sale.order: si hay Excel/Word lista → organizar datos → note SO.
 * Nunca escribe lista en crm.lead.description. Teléfono no va en note.
 */

import { parseListAttachmentBytes } from "./parse_list_bytes.js";
import { parseLifePdfListBytes } from "./parse_life_pdf.js";
import { buildOdooOrderNoteHtml } from "./build_odoo_order_note.js";
import { compact, stripOppPrefix } from "./order_detail_shared.js";
import { inferCommercialLinesFromDetailRows } from "./list_section_products.js";

function stripPhoneFromHtml(html) {
  return String(html || "")
    .replace(/^\s*telefono\s*:.*$/gim, "")
    .replace(/<p[^>]*>\s*<b>\s*Tel[eé]fono\s*:?\s*<\/b>\s*[^<]*<\/p>/gi, "")
    .replace(/<li>\s*Tel[eé]fono[^<]*<\/li>/gi, "")
    .replace(/\sphone=\d+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function base64ToBytes(b64) {
  const raw = String(b64 || "").replace(/\s+/g, "");
  if (!raw) return new Uint8Array(0);
  // Prefer Buffer (Node / workerd nodejs_compat) — more reliable than atob for large payloads
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

function isListExcelName(name) {
  return /\.(xlsx|xlsm|xltx|xls|csv)$/i.test(compact(name));
}

function isListWordName(name) {
  return /\.docx$/i.test(compact(name));
}

function isListPdfName(name) {
  return /\.pdf$/i.test(compact(name));
}

function looksLikeListFilename(name) {
  const n = compact(name).toLowerCase();
  if (isListExcelName(n) || isListWordName(n) || isListPdfName(n)) return true;
  return /formato\s*pedido|lista|tallas|jugadores/i.test(n) && /\.(xlsx|xlsm|docx|pdf)$/i.test(n);
}

/** Prioridad: Excel FORMATO LIFE → xlsx → PDF lista → docx. */
export function pickListAttachment(attachments = []) {
  const list = (attachments || []).filter((a) => a && compact(a.name));
  const excelLife = list.find(
    (a) => isListExcelName(a.name) && /formato|life|pedido|lista/i.test(a.name)
  );
  if (excelLife) return excelLife;
  const excel = list.find((a) => isListExcelName(a.name));
  if (excel) return excel;
  const pdfLife = list.find(
    (a) => isListPdfName(a.name) && /formato|life|pedido|lista/i.test(a.name || "")
  );
  if (pdfLife) return pdfLife;
  const pdf = list.find((a) => isListPdfName(a.name));
  if (pdf) return pdf;
  const docx = list.find((a) => isListWordName(a.name));
  if (docx) return docx;
  return list.find((a) => looksLikeListFilename(a.name)) || null;
}

function noteAlreadyHasLista(noteHtml) {
  const n = String(noteHtml || "");
  return (
    /<table[\s>]/i.test(n) &&
    (/Lista de jugador/i.test(n) ||
      /espejo Excel/i.test(n) ||
      /Resumen por variante/i.test(n) ||
      /organización de los datos/i.test(n))
  );
}

/**
 * @param {{ executeKw: Function }} odoo
 * @param {{ orderId: number, orderName?: string, title?: string, force?: boolean }} opts
 */
export async function applyListaFromSoAttachments(odoo, opts = {}) {
  const orderId = Number(opts.orderId || 0);
  if (!orderId) return { applied: false, reason: "no_order_id" };

  const orders = await odoo.executeKw(
    "sale.order",
    "read",
    [[orderId]],
    {
      fields: [
        "id",
        "name",
        "note",
        "x_studio_nombre_del_pedido",
        "partner_id",
      ],
    }
  );
  const order = orders?.[0];
  if (!order) return { applied: false, reason: "so_missing" };

  const currentNote = String(order.note || "");
  if (!opts.force && noteAlreadyHasLista(currentNote)) {
    return {
      applied: false,
      reason: "lista_already_in_note",
      order_id: orderId,
      order_name: order.name,
    };
  }

  const atts = await odoo.executeKw(
    "ir.attachment",
    "search_read",
    [[["res_model", "=", "sale.order"], ["res_id", "=", orderId]]],
    { fields: ["id", "name", "mimetype", "datas"], limit: 40 }
  );

  const pick = pickListAttachment(atts || []);
  if (!pick) {
    return {
      applied: false,
      reason: "no_list_attachment",
      message: "Sin Excel/Word/PDF de lista en el presupuesto.",
      order_id: orderId,
      order_name: order.name,
      attachment_names: (atts || []).map((a) => a.name),
    };
  }

  if (!pick.datas) {
    const full = await odoo.executeKw(
      "ir.attachment",
      "read",
      [[pick.id]],
      { fields: ["id", "name", "datas"] }
    );
    pick.datas = full?.[0]?.datas;
  }

  const bytes = base64ToBytes(pick.datas);
  if (!bytes.length) {
    return { applied: false, reason: "empty_attachment", filename: pick.name };
  }

  const isPdf = isListPdfName(pick.name) || bytes[0] === 0x25;
  const magic = new TextDecoder("latin1").decode(bytes.slice(0, 8));
  const parsed = isPdf
    ? await parseLifePdfListBytes(bytes, pick.name)
    : await parseListAttachmentBytes(bytes, pick.name);

  if (!parsed.ok || !Array.isArray(parsed.rows) || !parsed.rows.length) {
    return {
      applied: false,
      reason: parsed.error || parsed.needs_ocr ? "needs_ocr" : "organize_failed",
      message:
        parsed.message ||
        (parsed.needs_ocr
          ? "PDF sin texto: en staff usar ask_about_file (visión) y luego organizar la lista."
          : "No se pudo organizar la lista del archivo."),
      filename: pick.name,
      order_id: orderId,
      needs_ocr: Boolean(parsed.needs_ocr),
      debug: {
        build: "pdf-fflate-v2-binarystring",
        bytes_len: bytes.length,
        magic,
        datas_b64_len: String(pick.datas || "").length,
        fragmentCount: parsed.fragmentCount ?? null,
        layout: parsed.layout || null,
        error: parsed.error || null,
        extract: parsed.extract_debug || null,
      },
    };
  }

  const title =
    stripOppPrefix(
      compact(opts.title) ||
        compact(order.x_studio_nombre_del_pedido) ||
        (Array.isArray(order.partner_id) ? compact(order.partner_id[1]) : "") ||
        compact(order.name) ||
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
      listLayout: parsed.layout || parsed.excel_layout || "",
      mirrorGrid: parsed.grid || parsed.mirror_grid || null,
      sheetName: parsed.sheetName || parsed.sheet_name || "",
      commercialLines,
    })
  );

  await odoo.executeKw("sale.order", "write", [[orderId], { note: noteHtml }]);

  return {
    applied: true,
    reason: "ok",
    order_id: orderId,
    order_name: order.name,
    filename: pick.name,
    rows: parsed.rows.length,
    detail_rows: parsed.rows,
    commercial_lines: commercialLines,
    layout: parsed.layout || null,
  };
}

export { stripPhoneFromHtml };
