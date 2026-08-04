/**
 * Kapso tool: parsear-lista-imagen-pedido
 * Recibe vision_text (salida de ask_about_file) o devuelve instrucción fija.
 */
import { parseTextList } from "./lib/parse_life_text_lines.js";
import {
  FIXED_IMAGE_LIST_QUESTION,
  compact,
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
    return jsonResponse({ ok: false, error: "staff_only" }, 403);
  }

  const { primaryUrl, mediaFromMessages } = pickMediaFromContext(body);
  const fileUrl = compact(input.file_url || primaryUrl);
  const visionText = compact(input.vision_text || input.text || "");

  if (!visionText) {
    return jsonResponse({
      ok: false,
      status: "needs_vision",
      error: "needs_vision",
      fixed_question: FIXED_IMAGE_LIST_QUESTION,
      file_url: fileUrl || null,
      message:
        "Llama ask_about_file con fixed_question, luego reinvoca con vision_text.",
      vars: serviceVars("parsear_lista_imagen_pedido", "pending", now, null),
    });
  }

  const parsed = parseTextList({ text: visionText, source: "image_vision" });
  if (!parsed.ok) {
    return jsonResponse({
      ok: false,
      error: parsed.error,
      fixed_question: FIXED_IMAGE_LIST_QUESTION,
      vars: serviceVars(
        "parsear_lista_imagen_pedido",
        "error",
        now,
        "No pude estructurar la imagen. Repita ask_about_file o envíe Excel."
      ),
    });
  }

  const merged = mergeOrderDetailDraft(vars, {
    rows: parsed.rows,
    source: "image_vision",
    mode: input.merge_mode === "append" ? "append" : "replace",
    now,
  });

  const attachments = fileUrl
    ? mergeAttachments(vars?.order_draft?.attachments, [
        {
          url: fileUrl,
          filename:
            compact(input.filename) ||
            mediaFromMessages.find((m) => m.url === fileUrl)?.filename ||
            filenameFromUrl(fileUrl),
          mime_type: compact(input.mime_type || "image/jpeg"),
          role: "detail_list",
        },
      ])
    : vars?.order_draft?.attachments || [];

  const order_draft = patchOrderDraft(vars, {
    ...merged.order_draft,
    attachments,
  });

  return jsonResponse({
    ok: true,
    status: merged.detail.parse_status,
    row_count: parsed.rows.length,
    summary_text: merged.detail.summary_text,
    warnings: merged.warnings,
    vars: {
      order_draft,
      ...serviceVars("parsear_lista_imagen_pedido", "ready", now, null),
    },
  });
}

export { handler };
