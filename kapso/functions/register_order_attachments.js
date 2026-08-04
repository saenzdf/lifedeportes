/**
 * Kapso tool: registrar-adjuntos-pedido
 */
import {
  jsonResponse,
  mergeAttachments,
  patchOrderDraft,
  pickMediaFromContext,
  serviceVars,
} from "./lib/order_detail_shared.js";

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  if (vars?.user?.role !== "staff") {
    return jsonResponse({ ok: false, error: "staff_only" }, 403);
  }

  const { mediaFromMessages } = pickMediaFromContext(body);
  const manual = Array.isArray(input.attachments) ? input.attachments : [];
  const attachments = mergeAttachments(vars?.order_draft?.attachments, [
    ...mediaFromMessages,
    ...manual,
  ]);

  const order_draft = patchOrderDraft(vars, { attachments });

  return jsonResponse({
    ok: true,
    attachment_count: attachments.length,
    attachments,
    vars: {
      order_draft,
      ...serviceVars("registrar_adjuntos_pedido", "ready", now, null),
    },
  });
}

export { handler };
