/**
 * Kapso tool: parsear-lista-excel-pedido
 */
import { parseListAttachmentBytes } from "./lib/parse_list_bytes.js";
import {
  compact,
  fetchBinary,
  filenameFromUrl,
  jsonResponse,
  mergeAttachments,
  patchOrderDraft,
  pickMediaFromContext,
  serviceVars,
} from "./lib/order_detail_shared.js";
import { mergeOrderDetailDraft } from "./lib/merge_order_detail_draft.js";

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  if (vars?.user?.role !== "staff") {
    return jsonResponse(
      { ok: false, error: "staff_only", vars: serviceVars("parsear_lista_excel_pedido", "blocked", now) },
      403
    );
  }

  const { primaryUrl, mediaFromMessages } = pickMediaFromContext(body);
  const fileUrl = compact(input.file_url || primaryUrl);
  if (!fileUrl) {
    return jsonResponse({
      ok: false,
      error: "missing_file_url",
      vars: serviceVars("parsear_lista_excel_pedido", "error", now, "Adjunte Excel, Word (.docx) o pase file_url."),
    });
  }

  const filename =
    compact(input.filename) ||
    mediaFromMessages.find((m) => m.url === fileUrl)?.filename ||
    filenameFromUrl(fileUrl);

  try {
    const bytes = await fetchBinary(fileUrl);
    const parsed = await parseListAttachmentBytes(bytes, filename, {
      sheet_name: compact(input.sheet_name || input.sheet || ""),
    });

    if (parsed.needs_sheet_choice) {
      return jsonResponse({
        ok: false,
        status: "needs_sheet_choice",
        error: "ambiguous_sheet",
        message: parsed.message,
        sheet_choices: parsed.sheet_choices || [],
        vars: serviceVars(
          "parsear_lista_excel_pedido",
          "needs_input",
          now,
          parsed.message || "¿Qué pestaña del Excel debo usar? Normalmente «formato life»."
        ),
      });
    }

    if (!parsed.ok) {
      return jsonResponse({
        ok: false,
        error: parsed.error,
        vars: serviceVars(
          "parsear_lista_excel_pedido",
          "error",
          now,
          parsed.message ||
            "Archivo sin filas reconocibles. Use Excel FORMATO PEDIDO LIFE o lista Word (.docx)."
        ),
      });
    }

    const source = /\.docx$/i.test(filename) ? "word" : "excel";

    const merged = mergeOrderDetailDraft(vars, {
      rows: parsed.rows,
      source,
      mode: input.merge_mode === "append" ? "append" : "replace",
      now,
    });

    const detailPatch = {
      ...merged.order_draft.detail,
      excel_layout: parsed.layout || null,
      excel_sheet: parsed.sheetName || null,
      parse_report: parsed.parse_report || null,
      color_media: parsed.color_media || null,
      disciplina: parsed.disciplina || null,
    };

    const staffSummary =
      parsed.parse_report?.summary_text || merged.detail.summary_text;

    const mimeType = /\.docx$/i.test(filename)
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    const attachments = mergeAttachments(vars?.order_draft?.attachments, [
      {
        url: fileUrl,
        filename,
        mime_type: mimeType,
        role: "detail_list",
      },
    ]);

    const order_draft = patchOrderDraft(vars, {
      ...merged.order_draft,
      detail: detailPatch,
      attachments,
    });

    return jsonResponse({
      ok: true,
      status: merged.detail.parse_status,
      row_count: parsed.rows.length,
      sheet_name: parsed.sheetName,
      layout: parsed.layout || null,
      layout_notes: parsed.layout_notes || [],
      parse_report: parsed.parse_report || null,
      color_media: parsed.color_media || null,
      disciplina: parsed.disciplina || null,
      warnings: [...(merged.warnings || []), ...(parsed.warnings || [])].filter(Boolean),
      summary_text: staffSummary,
      vars: {
        order_draft,
        ...serviceVars("parsear_lista_excel_pedido", "ready", now, staffSummary),
      },
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: String(err?.message || err),
      vars: serviceVars(
        "parsear_lista_excel_pedido",
        "error",
        now,
        "No pude leer el archivo. Reenvíe Excel o Word (.docx)."
      ),
    });
  }
}

export { handler };
