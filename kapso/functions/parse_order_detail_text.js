/**
 * Kapso tool: parsear-lista-texto-pedido
 * Normaliza texto pegado o salida de ask_about_file (visión) → order_draft.detail.rows
 */
import { parseTextList } from "./lib/parse_life_text_lines.js";
import {
  jsonResponse,
  patchOrderDraft,
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
      {
        ok: false,
        error: "staff_only",
        vars: serviceVars("parsear_lista_texto_pedido", "blocked", now, "Solo staff."),
      },
      403
    );
  }

  const text =
    String(input.text || input.raw_text || input.vision_text || "").trim() ||
    String(vars?.intent?.raw_text || "").trim();

  if (!text) {
    return jsonResponse({
      ok: false,
      error: "missing_text",
      message: "Pasa text con la lista pegada o vision_text de ask_about_file.",
      vars: serviceVars(
        "parsear_lista_texto_pedido",
        "error",
        now,
        "Falta texto de lista para parsear."
      ),
    });
  }

  const parsed = parseTextList({
    text,
    source: input.source || "text",
  });

  if (!parsed.ok) {
    return jsonResponse({
      ok: false,
      error: parsed.error,
      vars: serviceVars(
        "parsear_lista_texto_pedido",
        "error",
        now,
        "No pude extraer filas del texto. Revise formato o envíe Excel."
      ),
    });
  }

  const merged = mergeOrderDetailDraft(vars, {
    rows: parsed.rows,
    source: parsed.source,
    mode: input.merge_mode === "append" ? "append" : "replace",
    now,
  });

  const order_draft = patchOrderDraft(vars, merged.order_draft);

  return jsonResponse({
    ok: true,
    status: merged.detail.parse_status,
    row_count: parsed.rows.length,
    summary_text: merged.detail.summary_text,
    warnings: merged.warnings,
    vars: {
      order_draft,
      ...serviceVars("parsear_lista_texto_pedido", "ready", now, null),
    },
  });
}

export { handler };
