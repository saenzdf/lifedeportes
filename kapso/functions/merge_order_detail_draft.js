/**
 * Kapso tool: fusionar-borrador-lista
 */
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
    return jsonResponse({ ok: false, error: "staff_only" }, 403);
  }

  const merged = mergeOrderDetailDraft(vars, {
    rows: Array.isArray(input.rows) ? input.rows : undefined,
    people: Array.isArray(input.people) ? input.people : undefined,
    source: input.source || vars?.order_draft?.detail?.source || "agent_normalized",
    mode: input.merge_mode === "append" ? "append" : "replace",
    now,
  });

  const order_draft = patchOrderDraft(vars, merged.order_draft);

  return jsonResponse({
    ok: true,
    status: merged.detail.parse_status,
    row_count: merged.detail.row_count,
    summary_text: merged.detail.summary_text,
    warnings: merged.warnings,
    commercial_lines: merged.commercial_lines || order_draft.commercial?.lines || null,
    multi_product: Boolean(order_draft.commercial?.multi_product),
    vars: {
      order_draft,
      ...serviceVars("fusionar_borrador_lista", "ready", now, null),
    },
  });
}

export { handler };
