/**
 * Kapso tool: buscar-pedido-odoo (staff)
 * Usa vars del hilo + mensajes WhatsApp si no hay input explícito.
 * Al cambiar de pedido limpia order_draft / sesión anterior.
 */
import {
  createOdooClient,
  hasOdooCredentials,
  loadOrderBundle,
  odooCredentialsError,
  resolveStaffOrderSearchInput,
  searchStaffOrders,
} from "./lib/odoo_order_correction.js";
import {
  buildOrderSession,
  clearOrderSessionVars,
  detectOrderSessionSwitch,
  latestInboundText,
  readOrderSession,
} from "./lib/staff_order_session.js";

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();
  const inboundText = latestInboundText(body);
  const session = readOrderSession(vars);

  if (vars?.user?.role !== "staff") {
    return json({ ok: false, error: "staff_only" }, 403);
  }
  if (!hasOdooCredentials(env)) {
    return json(odooCredentialsError("buscar-pedido-odoo"));
  }

  // Nombre distinto sin S0 + sesión activa → preguntar (no mezclar).
  const preSwitch = detectOrderSessionSwitch({
    session,
    incomingDisplayName: body?.input?.customer_name || null,
    messageText: inboundText,
  });
  if (preSwitch.switch && preSwitch.ambiguous) {
    return json({
      ok: false,
      status: "needs_disambiguation",
      message:
        `¿Seguimos en ${session.order_name || session.order_id}` +
        (session.display_name ? ` ${session.display_name}` : "") +
        ` o pasamos a ${preSwitch.incoming_display_name}? Indique el S0… del pedido nuevo.`,
      active_session: session,
      incoming_display_name: preSwitch.incoming_display_name,
    });
  }

  try {
    const { executeKw } = await createOdooClient(env);
    const resolved = resolveStaffOrderSearchInput(body);

    if (resolved.already_resolved && resolved.order_id) {
      const bundle = await loadOrderBundle(executeKw, resolved.order_id);
      if (bundle?.mapped) {
        const primary = bundle.mapped;
        return json({
          ok: true,
          status: "ready",
          message: `${primary.order_name} · ${primary.task_stage || "sin etapa"} · ${primary.editable ? "ok" : "bloqueado"}`,
          source: resolved.source,
          orders: [primary],
          vars: buildSearchVars({
            primary,
            source: resolved.source,
            now,
            prevVars: vars,
            displayName: resolved.customer_name || session?.display_name,
            forceClear: false,
          }),
        });
      }
    }

    if (!resolved.order_number) {
      return json({
        ok: false,
        status: "needs_input",
        message: "Indique el número del pedido (ej. 2564).",
      });
    }

    const result = await searchStaffOrders(executeKw, resolved);
    if (result.note && !result.orders?.length) {
      return json({ ok: false, status: "needs_input", message: result.note });
    }

    const orders = result.orders || [];
    if (!orders.length) {
      return json({
        ok: false,
        status: "not_found",
        message: result.note || "Pedido no encontrado.",
      });
    }

    const primary = orders[0];
    const switchInfo = detectOrderSessionSwitch({
      session,
      incomingOrderId: primary.order_id,
      incomingOrderName: primary.order_name,
      incomingDisplayName: resolved.customer_name || null,
      messageText: inboundText,
    });
    const forceClear = Boolean(switchInfo.switch || resolved.session_switch || !session);

    return json({
      ok: true,
      status: "ready",
      message: `${primary.order_name} · ${primary.task_stage || "sin etapa"} · ${primary.editable ? "ok" : "bloqueado"}`,
      source: resolved.source,
      session_switched: forceClear && Boolean(session),
      orders,
      vars: buildSearchVars({
        primary,
        source: resolved.source || "buscar",
        now,
        prevVars: vars,
        displayName: resolved.customer_name || null,
        forceClear,
      }),
    });
  } catch (err) {
    return json({ ok: false, error: "odoo_error", message: String(err?.message || err) });
  }
}

function buildSearchVars({ primary, source, now, prevVars, displayName, forceClear }) {
  const session = readOrderSession(prevVars || {});
  const switched =
    forceClear ||
    (session?.order_id && Number(session.order_id) !== Number(primary.order_id));
  const cleared = switched ? clearOrderSessionVars() : {};
  const orderSession = buildOrderSession({
    orderId: primary.order_id,
    orderName: primary.order_name,
    displayName: displayName || primary.partner_name || session?.display_name || null,
    source: switched ? "session_switch" : source || "buscar",
    boundAt: now,
  });

  return {
    ...cleared,
    order_session: orderSession,
    order_correction: {
      search_status: "ready",
      target_order_id: primary.order_id,
      target_order_name: primary.order_name,
      target_task_id: primary.task_id,
      target_task_stage: primary.task_stage,
      editable: primary.editable,
      lock_reason: primary.lock_reason,
      search_source: source || null,
      session_switched: Boolean(switched && session),
      previous_order_id: switched && session ? session.order_id : null,
    },
    order: { id: primary.order_id, name: primary.order_name, status: primary.order_state },
    // Si no switch, preservar order_draft existente; si switch, cleared ya puso vacío.
    ...(switched
      ? {}
      : prevVars?.order_draft
        ? { order_draft: prevVars.order_draft }
        : {}),
    ...serviceVars("buscar_pedido_odoo", "ready", now, null),
  };
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
