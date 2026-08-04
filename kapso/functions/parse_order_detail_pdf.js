/**
 * Kapso tool: parsear-lista-pdf-pedido
 * 1) PDF FORMATO LIFE con texto embebido → organiza filas.
 * 2) PDF solo imagen → needs_ocr: ask_about_file + vision_text.
 */
import { parseLifePdfListBytes, FIXED_PDF_LIST_QUESTION } from "./lib/parse_life_pdf.js";
import { parseTextList } from "./lib/parse_life_text_lines.js";
import {
  compact,
  filenameFromUrl,
  jsonResponse,
  mergeAttachments,
  patchOrderDraft,
  pickMediaFromContext,
  serviceVars,
} from "./lib/order_detail_shared.js";
import { mergeOrderDetailDraft } from "./lib/merge_order_detail_draft.js";

async function downloadBytes(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`download_failed:${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  if (vars?.user?.role !== "staff") {
    return jsonResponse({ ok: false, error: "staff_only" }, 403);
  }

  const { primaryUrl, mediaFromMessages } = pickMediaFromContext(body);
  const fileUrl = compact(input.file_url || primaryUrl);
  const visionText = compact(input.vision_text || input.text || "");
  const filename =
    compact(input.filename) ||
    mediaFromMessages.find((m) => m.url === fileUrl)?.filename ||
    filenameFromUrl(fileUrl) ||
    "lista.pdf";

  // Camino visión (ask_about_file ya corrió)
  if (visionText) {
    const parsed = parseTextList({ text: visionText, source: "pdf_vision" });
    if (!parsed.ok) {
      return jsonResponse({
        ok: false,
        error: parsed.error,
        fixed_question: FIXED_PDF_LIST_QUESTION,
        vars: serviceVars(
          "parsear_lista_pdf_pedido",
          "error",
          now,
          "No pude estructurar el PDF. Repita ask_about_file o envíe Excel."
        ),
      });
    }
    const merged = mergeOrderDetailDraft(vars, {
      rows: parsed.rows,
      source: "pdf_vision",
      mode: input.merge_mode === "append" ? "append" : "replace",
      now,
    });
    const attachments = fileUrl
      ? mergeAttachments(vars?.order_draft?.attachments, [
          {
            url: fileUrl,
            filename,
            mime_type: "application/pdf",
            role: "detail_list",
          },
        ])
      : vars?.order_draft?.attachments || [];
    return jsonResponse({
      ok: true,
      status: merged.detail.parse_status,
      row_count: parsed.rows.length,
      layout: "pdf_vision",
      summary_text: merged.detail.summary_text,
      vars: {
        order_draft: patchOrderDraft(vars, { ...merged.order_draft, attachments }),
        ...serviceVars("parsear_lista_pdf_pedido", "ready", now, null),
      },
    });
  }

  if (!fileUrl) {
    return jsonResponse({
      ok: false,
      error: "missing_file",
      fixed_question: FIXED_PDF_LIST_QUESTION,
      message: "Pasa file_url del PDF o vision_text de ask_about_file.",
      vars: serviceVars("parsear_lista_pdf_pedido", "pending", now, null),
    });
  }

  let bytes;
  try {
    bytes = await downloadBytes(fileUrl);
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: "download_failed",
      message: String(err?.message || err).slice(0, 200),
      fixed_question: FIXED_PDF_LIST_QUESTION,
      vars: serviceVars("parsear_lista_pdf_pedido", "error", now, null),
    });
  }

  const parsed = await parseLifePdfListBytes(bytes, filename);
  if (parsed.needs_ocr || parsed.error === "needs_ocr") {
    return jsonResponse({
      ok: false,
      status: "needs_ocr",
      error: "needs_ocr",
      fixed_question: FIXED_PDF_LIST_QUESTION,
      file_url: fileUrl,
      message:
        "PDF sin capa de texto. Llama ask_about_file con fixed_question, luego reinvoca con vision_text.",
      vars: serviceVars("parsear_lista_pdf_pedido", "pending", now, null),
    });
  }

  if (!parsed.ok) {
    return jsonResponse({
      ok: false,
      error: parsed.error || "organize_failed",
      message: parsed.message,
      fixed_question: FIXED_PDF_LIST_QUESTION,
      vars: serviceVars("parsear_lista_pdf_pedido", "error", now, parsed.message),
    });
  }

  const merged = mergeOrderDetailDraft(vars, {
    rows: parsed.rows,
    source: "pdf_embedded",
    layout: parsed.layout,
    mode: input.merge_mode === "append" ? "append" : "replace",
    now,
  });
  const attachments = mergeAttachments(vars?.order_draft?.attachments, [
    {
      url: fileUrl,
      filename,
      mime_type: "application/pdf",
      role: "detail_list",
    },
  ]);

  return jsonResponse({
    ok: true,
    status: merged.detail.parse_status,
    row_count: parsed.rows.length,
    layout: parsed.layout,
    meta: parsed.meta || null,
    summary_text: merged.detail.summary_text,
    vars: {
      order_draft: patchOrderDraft(vars, { ...merged.order_draft, attachments }),
      ...serviceVars("parsear_lista_pdf_pedido", "ready", now, null),
    },
  });
}

export { handler };
{ handler };
