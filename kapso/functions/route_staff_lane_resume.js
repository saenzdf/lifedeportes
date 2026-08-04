/**
 * route_staff_lane_resume — tras wait_staff_lane.
 * CONFIRMO SUBIR → revalidar write (prioridad sobre hasOrder / nuevo pedido).
 * Nuevo Excel/refs/SUBIR PEDIDO → agente (aunque ya exista un SO en vars).
 * Corrección explícita → agente.
 * Ack corto (gracias/ok/listo) + SO existente → done.
 * Cualquier otra cosa (copiloto / interpretación) → agente — no matar modo B.
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const availableEdges = Array.isArray(body?.available_edges) ? body.available_edges : [];
  const now = new Date().toISOString();

  const reply = compact(
    vars.staff_lane_reply ||
      vars.staff?.lane_reply ||
      vars.intent?.raw_text ||
      vars.intent?.text ||
      vars.last_user_input ||
      vars.last_user_text ||
      vars.context?.last_user_text ||
      vars.context?.last_inbound_text ||
      ""
  );
  const confirmo =
    /\bCONFIRMO\s+SUBIR\b/i.test(reply) ||
    /\bCONFIRMO\s+PRESUPUESTO\b/i.test(reply) ||
    /\b(HAZ|HAS|HACE|CREA|CREAR)(?:\s+\w+){0,3}\s+PRESUPUESTO\b/i.test(reply) ||
    /\bconfirmo\b[\s,]*y?\s*(?:sube|subir|crea|crear|haz|has)\b/i.test(reply) ||
    /\bconfirmo\b[\s,]+(?:los?\s+)?\d{1,4}\s*(?:uniformes?|camisetas?|unidades?)/i.test(reply) ||
    /\bsube\s+(?:los?\s+)?(?:archivos?|adjuntos?|pedido|lista|\d+)/i.test(reply);
  const presupuestoIntent =
    /\bCONFIRMO\s+PRESUPUESTO\b/i.test(reply) ||
    /\b(HAZ|HAS|HACE|CREA|CREAR)(?:\s+\w+){0,3}\s+PRESUPUESTO\b/i.test(reply);
  const newOrderIntent = !confirmo && looksLikeNewOrderUpload(reply);
  const correctionIntent = !confirmo && looksLikeCorrectionIntent(reply);
  const ackOnly = !confirmo && looksLikeAckOnly(reply);
  const orderName = compact(vars.order?.name || "");
  const orderId = Number(vars.order?.id || 0);
  const hasOrder = Boolean(orderName || orderId);

  const writeStatus = compact(vars.staff?.write_status || vars.order_draft?.write?.status || "");
  const needsConfirm =
    writeStatus === "needs_confirmation" ||
    writeStatus === "needs_staff_confirmation" ||
    writeStatus === "blocked" ||
    (!writeStatus && confirmo);
  const fingerprint = compact(vars.order_draft?.write?.fingerprint || "");

  let signal = "staff_lane_agent";
  let confirmationFingerprint = compact(vars.staff?.confirmation_fingerprint || "");
  let fallback = null;
  let clearPriorOrder = false;

  if (confirmo && availableEdges.includes("staff_lane_retry_write")) {
    signal = "staff_lane_retry_write";
    confirmationFingerprint = fingerprint || confirmationFingerprint || null;
  } else if (confirmo && availableEdges.includes("staff_write_ok")) {
    signal = "staff_write_ok";
    confirmationFingerprint = fingerprint || confirmationFingerprint || null;
  } else if (newOrderIntent && availableEdges.includes("staff_lane_agent")) {
    signal = "staff_lane_agent";
    clearPriorOrder = hasOrder;
    confirmationFingerprint = null;
  } else if (correctionIntent && availableEdges.includes("staff_lane_agent")) {
    signal = "staff_lane_agent";
    confirmationFingerprint = null;
  } else if (hasOrder && ackOnly && availableEdges.includes("staff_lane_done")) {
    signal = "staff_lane_done";
    fallback = `Pedido ${orderName || orderId} ya estaba en Odoo (borrador).`;
  } else if (availableEdges.includes("staff_lane_agent")) {
    // Default: copiloto / preguntas / adjuntos ambiguos → agente
    signal = "staff_lane_agent";
  } else if (hasOrder && availableEdges.includes("staff_lane_done")) {
    signal = "staff_lane_done";
    fallback = `Pedido ${orderName || orderId} ya estaba en Odoo (borrador).`;
  } else if (availableEdges.includes("next")) {
    signal = "next";
  } else if (availableEdges.length) {
    signal = availableEdges[0];
  }

  const outVars = {
    staff: {
      ...(vars.staff || {}),
      confirmation_fingerprint: confirmationFingerprint || null,
      lane_resume_signal: signal,
      lane_reply: reply || null,
      last_user_text: reply || vars.staff?.last_user_text || null,
      new_order_intent: newOrderIntent || null,
      write_mode: presupuestoIntent
        ? "sale_order"
        : confirmo
          ? vars.staff?.write_mode || "sale_order"
          : vars.staff?.write_mode || null,
      write_status: confirmo && needsConfirm ? writeStatus || "needs_confirmation" : vars.staff?.write_status,
    },
    service: {
      last_call_name: "route_staff_lane_resume",
      last_call_status: "ready",
      last_call_at: now,
      fallback_message: fallback,
    },
  };
  if (clearPriorOrder) {
    outVars.order = null;
    outVars.order_draft = {
      ...(vars.order_draft || {}),
      write: null,
      spreadsheet: null,
    };
    outVars.staff.write_status = null;
    outVars.staff.write_code = null;
    outVars.staff.write_blocked_reason = null;
  }

  return new Response(JSON.stringify({ next_edge: signal, vars: outVars }), {
    headers: { "Content-Type": "application/json" },
  });
}

function looksLikeNewOrderUpload(reply) {
  const t = String(reply || "");
  return (
    /SUBIR\s+PEDIDO/i.test(t) ||
    /FORMATO\s+PEDIDO/i.test(t) ||
    /\.xlsx/i.test(t) ||
    /Image attached/i.test(t) ||
    /document attached/i.test(t) ||
    /Document attached/i.test(t) ||
    /Referencia/i.test(t) ||
    /listado/i.test(t)
  );
}

function looksLikeCorrectionIntent(reply) {
  const t = String(reply || "");
  // Verbo de corrección/retoma o S0… — no dígitos sueltos (años/qty).
  return (
    /\b(corregir|actualizar|modificar|cambiar|editar|retomar|mejorar|completar|reabrir|correction)\b/i.test(
      t
    ) || /\bS0?\d{3,6}\b/i.test(t)
  );
}

function looksLikeAckOnly(reply) {
  const t = compact(reply);
  if (!t || t.length > 40) return false;
  return /^(ok|okay|vale|listo|gracias|grax|perfecto|de acuerdo|entendido|dale|sí|si|👍|✔|done)[\s!.]*$/i.test(
    t
  );
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
