/**
 * Kapso tool: clasificar-adjuntos-pedido
 */
import {
  jsonResponse,
  mergeAttachments,
  patchOrderDraft,
  pickMediaFromContext,
  serviceVars,
} from "./lib/order_detail_shared.js";

function suggestTools(attachments) {
  const tools = [];
  const hasListFile = attachments.some(
    (a) =>
      a.role === "detail_list" &&
      /\.(xlsx|xls|docx)|spreadsheet|wordprocessing/i.test(`${a.filename || ""}${a.mime_type || ""}`)
  );
  const hasListImage = attachments.some((a) => a.role === "detail_list" && /\.(jpe?g|png|webp|pdf)$/i.test(a.filename || ""));
  const hasDesign = attachments.some((a) => a.role === "design_reference");

  if (hasListFile) tools.push("parsear_lista_excel_pedido");
  if (hasListImage) tools.push("parsear_lista_imagen_pedido");
  if (attachments.length) tools.push("registrar_adjuntos_pedido");
  if (hasDesign && !hasListFile && !hasListImage) tools.push("registrar_adjuntos_pedido");

  return [...new Set(tools)];
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  if (vars?.user?.role !== "staff") {
    return jsonResponse({ ok: false, error: "staff_only" }, 403);
  }

  const { mediaFromMessages } = pickMediaFromContext(body);
  const attachments = mergeAttachments(vars?.order_draft?.attachments, mediaFromMessages);
  const suggested_tools = suggestTools(attachments);

  const order_draft = patchOrderDraft(vars, { attachments });

  return jsonResponse({
    ok: true,
    attachment_count: attachments.length,
    attachments,
    suggested_tools,
    vars: {
      order_draft,
      ...serviceVars("clasificar_adjuntos_pedido", "ready", now, null),
    },
  });
}

export { handler };
