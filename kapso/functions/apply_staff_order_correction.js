/**
 * Kapso tool: corregir-pedido-odoo (staff)
 */
import {
  applyOrderCorrection,
  createOdooClient,
  detectProductMixChanges,
  hasOdooCredentials,
  loadOrderBundle,
  odooCredentialsError,
  parseDetailRowsFromNoteHtml,
  patchDetailRows,
  resolveCorrectionNoteHtml,
  resolveListaHtmlFromBundle,
  summarizeListDiff,
} from "./lib/odoo_order_correction.js";
import { syncOrderDraftFromOdoo } from "./lib/sync_order_draft_from_odoo.js";
import {
  buildOrderSession,
  orderSessionMismatch,
  readOrderSession,
} from "./lib/staff_order_session.js";

const VALID_CHANGE_TYPES = new Set(["cliente", "error_interno", "error_diseno"]);
const VALID_LIST_MODES = new Set(["full", "patch", "attachments_only"]);

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  if (vars?.user?.role !== "staff") {
    return json({ ok: false, error: "staff_only" }, 403);
  }
  if (!hasOdooCredentials(env)) {
    return json(odooCredentialsError("corregir-pedido-odoo"));
  }

  const orderId =
    Number(input.order_id || vars.order_correction?.target_order_id || vars.order?.id || 0) || 0;
  const changeType = String(input.change_type || "cliente").trim();
  let changeSummary = String(
    input.change_summary || input.change_description || vars.order_correction?.change_summary || ""
  ).trim();
  const listMode = String(input.list_mode || vars.order_correction?.list_mode || "").trim();

  if (!orderId) {
    return json({ ok: false, status: "needs_order", message: "Falta pedido." });
  }
  if (!VALID_CHANGE_TYPES.has(changeType)) {
    return json({ ok: false, status: "invalid_change_type" });
  }

  const mismatch = orderSessionMismatch(vars, orderId);
  if (mismatch) {
    return json({
      ok: false,
      status: mismatch.status,
      message: mismatch.message,
      active_session: mismatch.active_session,
      target_order_id: mismatch.target_order_id,
    });
  }

  const orderDraft = vars.order_draft || {};
  let detailRows = orderDraft.detail?.rows || [];
  const attachments = (orderDraft.attachments || []).filter((a) =>
    String(a?.url || "").startsWith("http")
  );
  const hasExcel = attachments.some(
    (a) => a.role === "detail_list" || /\.xlsx?$/i.test(a.filename || "")
  );

  let resolvedListMode = listMode;
  if (!resolvedListMode) {
    if (!detailRows.length && attachments.length) resolvedListMode = "attachments_only";
    else if (hasExcel) resolvedListMode = "full";
    else resolvedListMode = "patch";
  }
  if (!VALID_LIST_MODES.has(resolvedListMode)) resolvedListMode = "full";

  if (resolvedListMode !== "attachments_only" && !detailRows.length) {
    return json({ ok: false, status: "needs_list", message: "Falta lista." });
  }
  if (resolvedListMode === "attachments_only" && !attachments.length) {
    return json({ ok: false, status: "needs_attachments" });
  }

  const staffLabel = vars?.user?.name || vars?.user?.phone || "Staff";

  try {
    const { executeKw } = await createOdooClient(env);
    const bundle = await loadOrderBundle(executeKw, orderId);
    const listaSrc = resolveListaHtmlFromBundle(bundle);
    const existingNoteHtml = listaSrc.html;
    const oldRows = parseDetailRowsFromNoteHtml(existingNoteHtml);

    const productMixChanged =
      resolvedListMode !== "attachments_only" && detectProductMixChanges(oldRows, detailRows);

    if (!changeSummary && resolvedListMode !== "attachments_only") {
      changeSummary = summarizeListDiff(oldRows, detailRows);
    }
    if (!changeSummary && resolvedListMode === "attachments_only") {
      changeSummary = "Archivos subidos a la tarea.";
    }
    if (!changeSummary) {
      return json({ ok: false, status: "needs_summary" });
    }

    let orderNoteHtml = null;
    let rowCount = 0;
    let finalRows = detailRows;

    if (resolvedListMode !== "attachments_only") {
      const resolved = resolveCorrectionNoteHtml(vars, input, {
        listMode: resolvedListMode,
        existingNoteHtml,
        productMixChanged,
      });
      orderNoteHtml = resolved?.html || null;
      rowCount = resolved?.rowCount || 0;
      if (resolvedListMode === "patch" && oldRows.length) {
        finalRows = patchDetailRows(oldRows, detailRows);
      }
      if (!orderNoteHtml) {
        return json({ ok: false, status: "needs_list" });
      }
    }

    const result = await applyOrderCorrection(executeKw, {
      orderId,
      orderNoteHtml,
      changeType,
      changeSummary,
      staffLabel,
      attachments,
      rowCount,
      listMode: resolvedListMode,
      attachmentsOnly: resolvedListMode === "attachments_only",
      productMixChanged,
      newRows: finalRows,
    });

    if (!result.ok) {
      return json({
        ok: false,
        status: result.error,
        message: result.message,
        order: result.order,
      });
    }

    let syncedDraft = null;
    try {
      const synced = await syncOrderDraftFromOdoo(env, {
        orderId: result.order.order_id,
        orderName: result.order.order_name,
      });
      if (synced?.ok) syncedDraft = synced.order_draft;
    } catch {
      syncedDraft = null;
    }

    if (syncedDraft) {
      syncedDraft.order_session_id = result.order.order_id;
      syncedDraft.meta = {
        ...(syncedDraft.meta || {}),
        order_session_id: result.order.order_id,
      };
    }

    const prevSession = readOrderSession(vars);
    const orderSession = buildOrderSession({
      orderId: result.order.order_id,
      orderName: result.order.order_name,
      displayName: prevSession?.display_name || null,
      source: "corregir",
      boundAt: now,
    });

    return json({
      ok: true,
      status: "corrected",
      message: `Listo. ${result.summary}`,
      summary: result.summary,
      product_mix_changed: result.product_mix_changed,
      so_updated: result.product_mix_changed,
      order: result.order,
      vars: {
        order_session: orderSession,
        order_correction: {
          apply_status: "corrected",
          target_order_id: orderId,
          target_order_name: result.order.order_name,
          target_task_id: result.order.task_id,
          change_type: changeType,
          change_summary: changeSummary,
          list_mode: resolvedListMode,
          product_mix_changed: result.product_mix_changed,
          corrected_at: now,
          synced_from_odoo: Boolean(syncedDraft),
          revision_number: result.revision?.number || null,
          revision_attachment_id: result.revision?.attachment_id || null,
        },
        order: { id: result.order.order_id, name: result.order.order_name },
        order_lifecycle: {
          schema_version: "life_order_lifecycle_v1",
          state:
            result.order.order_state === "sale"
              ? "confirmed_revisioned"
              : "draft_revisioned",
          active_revision: result.revision?.number || 0,
          revision_attachment_id: result.revision?.attachment_id || null,
          updated_at: now,
        },
        ...(syncedDraft ? { order_draft: syncedDraft } : {}),
        ...serviceVars("corregir_pedido_odoo", "ready", now, result.summary),
      },
    });
  } catch (err) {
    return json({ ok: false, error: "odoo_error", message: String(err?.message || err) });
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function serviceVars(name, status, at, fallback) {
  return {
    service: {
      last_call_name: name,
      last_call_status: status,
      last_call_at: at,
      fallback_message: fallback,
    },
  };
}

export { handler };
