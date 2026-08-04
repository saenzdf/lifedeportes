/**
 * Sesión de pedido activo en carril staff Kapso.
 * Un solo pedido por chat: al cambiar (Fredy → Daniel Tovar) se limpia el draft anterior.
 * Sin imports de odoo_order_correction (evita ciclo en el bundle).
 */

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function bareOrderNumber(raw) {
  let s = String(raw || "").trim().toUpperCase();
  s = s.replace(/^S0*/i, "").replace(/^S/i, "");
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  return String(parseInt(digits, 10));
}

function bareOrderNumberFromName(orderName) {
  const m = String(orderName || "").match(/S0*(\d+)/i);
  return m ? String(parseInt(m[1], 10)) : null;
}

function extractOrderNumberFromText(text) {
  const s = String(text || "");
  const soMatch = s.match(/\bS0*(\d{3,6})\b/i);
  if (soMatch) return bareOrderNumber(soMatch[0]);
  const pedidoMatch = s.match(/(?:pedido|orden|presupuesto|so|n[°º]?)\s*#?\s*0*(\d{3,6})\b/i);
  if (pedidoMatch) return bareOrderNumber(pedidoMatch[1]);
  const corrMatch = s.match(
    /(?:corregir|actualizar|modificar|update|retoma|retomar)\s+(?:este\s+)?(?:el\s+)?(?:pedido\s+)?#?\s*0*(\d{3,6})\b/i
  );
  if (corrMatch) return bareOrderNumber(corrMatch[1]);
  const starred = s.match(/\*?(\d{3,6})\s*\]?\s+[A-Za-zÁÉÍÓÚ]/);
  if (starred && /retoma|pedido|corregir/i.test(s)) return bareOrderNumber(starred[1]);
  const looseNum = s.match(/\b0*(\d{4,6})\b/);
  if (looseNum && /actualizar|corregir|modificar|pedido|lista|retoma/i.test(s)) {
    return bareOrderNumber(looseNum[1]);
  }
  return null;
}

function extractCustomerNameFromText(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const afterNum = s.match(/\b0*\d{3,6}\b\s*\]?\s+([A-Za-zÁÉÍÓÚáéíóúñÑ][\w\sÁÉÍÓÚáéíóúñÑ.-]{2,40})/);
  if (afterNum) return afterNum[1].replace(/\*+$/, "").trim();
  const deMatch = s.match(
    /(?:de|para|cliente|pedido)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ][\w\sÁÉÍÓÚáéíóúñÑ.-]{2,40})/i
  );
  if (deMatch) return deMatch[1].replace(/\*+$/, "").trim();
  const ahora = s.match(
    /(?:ahora|pasamos\s+a)\s+(?:el\s+)?(?:pedido\s+)?(?:de\s+)?([A-Za-zÁÉÍÓÚáéíóúñÑ][\w\sÁÉÍÓÚáéíóúñÑ.-]{2,40})/i
  );
  if (ahora) return ahora[1].trim();
  return null;
}

/** Normaliza nombre para comparar FREDY BRAM vs Fredy Bram. */
export function normalizeDisplayName(raw) {
  return compact(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function namesLikelyDifferent(a, b) {
  const na = normalizeDisplayName(a);
  const nb = normalizeDisplayName(b);
  if (!na || !nb) return false;
  if (na === nb) return false;
  if (na.includes(nb) || nb.includes(na)) return false;
  const ta = new Set(na.split(/\s+/).filter((t) => t.length > 2));
  const tb = new Set(nb.split(/\s+/).filter((t) => t.length > 2));
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap += 1;
  return overlap === 0;
}

/** Parche de lista sin número de pedido (ej. «ODALINDA ES UNIFORME FEMENINO»). */
export function isLikelyListPatchMessage(text) {
  const s = compact(text);
  if (!s || s.length > 160) return false;
  if (extractOrderNumberFromText(s)) return false;
  if (/\b(retoma|retomar|nuevo pedido|pasamos a|ahora el pedido|pedido de)\b/i.test(s)) {
    return false;
  }
  if (
    /\b(femenin|masculin|talla|dorsal|arquero|uniforme|camiseta|manga|larga|corta)\b/i.test(s)
  ) {
    return true;
  }
  if (
    /^(cambia|cambiar|corrije|corregir|pasa|pasar|pon|poner)\b/i.test(s) &&
    s.split(/\s+/).length <= 12
  ) {
    return true;
  }
  return false;
}

export function readOrderSession(vars = {}) {
  const s = vars?.order_session;
  if (s && Number(s.order_id) > 0) {
    return {
      order_id: Number(s.order_id),
      order_name: compact(s.order_name) || null,
      display_name: compact(s.display_name) || null,
      bound_at: s.bound_at || null,
      source: s.source || null,
    };
  }
  const id = Number(vars?.order_correction?.target_order_id || vars?.order?.id || 0) || 0;
  if (!id) return null;
  return {
    order_id: id,
    order_name: compact(vars?.order_correction?.target_order_name || vars?.order?.name) || null,
    display_name:
      compact(vars?.order_session?.display_name || vars?.quote?.customer_display_name) || null,
    bound_at: null,
    source: "legacy",
  };
}

export function buildOrderSession({
  orderId,
  orderName,
  displayName = null,
  source = "buscar",
  boundAt = null,
} = {}) {
  const id = Number(orderId) || 0;
  if (!id) return null;
  return {
    order_id: id,
    order_name: compact(orderName) || null,
    display_name: compact(displayName) || null,
    bound_at: boundAt || new Date().toISOString(),
    source: compact(source) || "buscar",
  };
}

/** Draft vacío — no reutiliza filas/adjuntos del pedido anterior. */
export function emptyOrderDraft() {
  return {
    schema_version: "order_draft_v1",
    detail: { rows: [], parse_status: null },
    attachments: [],
    blockers: [],
    commercial: { lines: [] },
  };
}

/**
 * Vars a fusionar al cambiar de pedido (antes de anclar el nuevo).
 * No toca nómina/compra.
 */
export function clearOrderSessionVars() {
  return {
    order_draft: emptyOrderDraft(),
    order_correction: {
      search_status: null,
      target_order_id: null,
      target_order_name: null,
      cleared_for_switch: true,
    },
    order: null,
    order_session: null,
  };
}

/**
 * ¿El mensaje / target apunta a otro pedido que la sesión activa?
 */
export function detectOrderSessionSwitch({
  session = null,
  incomingOrderId = null,
  incomingOrderName = null,
  incomingDisplayName = null,
  messageText = "",
} = {}) {
  const text = compact(messageText);
  const msgNum = extractOrderNumberFromText(text);
  const msgName = extractCustomerNameFromText(text);
  const displayIn = compact(incomingDisplayName) || msgName || null;
  const nameIn = compact(incomingOrderName);
  const bareIn =
    bareOrderNumber(nameIn) || bareOrderNumberFromName(nameIn) || msgNum || null;
  const idIn = Number(incomingOrderId) || 0;

  if (!session?.order_id) {
    return {
      switch: false,
      reason: "no_session",
      incoming_order_number: bareIn,
      incoming_display_name: displayIn,
    };
  }

  if (idIn && idIn !== Number(session.order_id)) {
    return {
      switch: true,
      reason: "order_id",
      incoming_order_number: bareIn,
      incoming_display_name: displayIn,
    };
  }

  const sessionBare =
    bareOrderNumber(session.order_name) || bareOrderNumberFromName(session.order_name);
  if (bareIn && sessionBare && bareIn !== sessionBare) {
    return {
      switch: true,
      reason: "order_number",
      incoming_order_number: bareIn,
      incoming_display_name: displayIn,
    };
  }

  if (isLikelyListPatchMessage(text) && !bareIn) {
    return {
      switch: false,
      reason: "list_patch",
      incoming_order_number: null,
      incoming_display_name: displayIn,
    };
  }

  const switchPhrase =
    /\b(retoma|retomar|pedido\s+de|ahora\s+(el\s+)?pedido|pasamos\s+a|cambiar\s+(de\s+)?pedido|nuevo\s+pedido)\b/i.test(
      text
    );
  if (displayIn && session.display_name && namesLikelyDifferent(displayIn, session.display_name)) {
    if (switchPhrase || compact(incomingDisplayName)) {
      return {
        switch: true,
        reason: "display_name",
        ambiguous: !bareIn && !idIn,
        incoming_order_number: bareIn,
        incoming_display_name: displayIn,
      };
    }
  }

  return {
    switch: false,
    reason: "same",
    incoming_order_number: bareIn,
    incoming_display_name: displayIn,
  };
}

/**
 * Si el target no coincide con la sesión → mismatch (no mergear draft ajeno).
 */
export function orderSessionMismatch(vars, targetOrderId) {
  const session = readOrderSession(vars);
  const target = Number(targetOrderId) || 0;
  if (!session?.order_id || !target) return null;
  if (Number(session.order_id) === target) return null;

  return {
    status: "order_session_mismatch",
    message:
      `Pedido activo: ${session.order_name || session.order_id}` +
      (session.display_name ? ` (${session.display_name})` : "") +
      `. Pidió otro id ${target}. Llame buscar_pedido_odoo del nuevo pedido (limpia el anterior).`,
    active_session: session,
    target_order_id: target,
  };
}

/** Texto inbound reciente del body Kapso (para detección de switch). */
export function latestInboundText(body = {}) {
  const messages = Array.isArray(body?.whatsapp_context?.messages)
    ? body.whatsapp_context.messages
    : [];
  for (const msg of [...messages].reverse()) {
    if (msg.direction && msg.direction !== "inbound") continue;
    const t =
      msg.content ||
      msg.text?.body ||
      (typeof msg.text === "string" ? msg.text : "") ||
      msg.body ||
      "";
    const s = compact(t);
    if (s) return s;
  }
  const input = body?.input || {};
  return compact(input.message || input.text || input.change_summary || "");
}
