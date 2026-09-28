// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: route-customer-entry  id: 189befcd-5a62-482a-ad95-982c6721ad3e
// ultimo deploy: 2026-08-31T18:17:08-04:00  status: deployed
// motivo: ruteo cliente legacy sin cablear
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

/**
 * route_customer_entry — dual mode:
 * 1) Sales-gate (edges sales_allowed / send_message / already_notified):
 *    whitelist Diego → ventas; resto → mantenimiento.
 * 2) Normal: existing_customer (historial) vs new_customer (vendedor).
 *
 * Nota: Kapso no redeploya route-customer-paused; el decide de pausa usa este ID.
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const availableEdges = Array.isArray(body?.available_edges) ? body.available_edges : [];
  const executionContext = body?.execution_context || {};
  const vars = executionContext.vars || {};
  const context = executionContext.context || {};
  const whatsappContext = body?.whatsapp_context || {};
  const conversation = whatsappContext.conversation || {};
  const now = new Date().toISOString();

  const localDigits = (digits) => {
    const d = String(digits || "").replace(/\D/g, "");
    return d.length >= 10 ? d.slice(-10) : d;
  };

  // —— Mode A: mantenimiento + whitelist ventas ——
  if (
    availableEdges.includes("sales_allowed") ||
    availableEdges.includes("send_message") ||
    availableEdges.includes("already_notified")
  ) {
    const waId = String(
      context?.phone_number ||
        conversation.phone_number ||
        vars?.user?.wa_id ||
        vars?.context?.phone_number ||
        ""
    ).replace(/\D/g, "");

    const DEFAULT_TESTERS = ["573172575981", "3172575981"];
    const fromEnv = String(env.LIFE_SALES_TESTER_WHITELIST || "")
      .split(/[,;\s]+/)
      .map((x) => x.replace(/\D/g, ""))
      .filter(Boolean);
    const allowed = [...DEFAULT_TESTERS, ...fromEnv]
      .map(localDigits)
      .filter((d) => d.length === 10);
    const incoming = localDigits(waId);
    const salesAllowed = Boolean(incoming && allowed.includes(incoming));
    const alreadySent = vars?.kapso?.maintenance_message_sent === true;

    let signal;
    let reason;
    if (salesAllowed && availableEdges.includes("sales_allowed")) {
      signal = "sales_allowed";
      reason = "sales_tester_whitelist";
    } else if (alreadySent && availableEdges.includes("already_notified")) {
      signal = "already_notified";
      reason = "maintenance_already_sent";
    } else if (availableEdges.includes("send_message")) {
      signal = "send_message";
      reason = "maintenance_first_message";
    } else {
      signal = availableEdges[0];
      reason = "first_edge";
    }

    return new Response(
      JSON.stringify({
        next_edge: signal,
        vars: {
          user: {
            ...(vars.user || {}),
            wa_id: waId || vars?.user?.wa_id || null,
            sales_tester: salesAllowed,
          },
          kapso: {
            ...(vars.kapso || {}),
            customer_lane: salesAllowed ? "sales_tester" : "paused_maintenance",
            staff_only_mode: !salesAllowed,
            sales_whitelist_gate: true,
            sales_allowed: salesAllowed,
          },
          service: {
            last_call_name: "route_customer_entry",
            last_call_status: "ready",
            last_call_at: now,
            routed_edge: signal,
            route_reason: reason,
            fallback_message: salesAllowed
              ? "Tester ventas — carril cliente abierto"
              : alreadySent
                ? "Mantenimiento ya enviado; conversacion en espera"
                : "Primer mensaje de mantenimiento",
          },
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // —— Mode B: historial vs vendedor ——
  const segment = String(vars?.user?.contact_segment || "new_customer");
  const returningSale =
    vars?.customer_line === "returning_sale" ||
    vars?.quote?.quote_request_source === "client_returning_sale";

  const lastText = [
    vars?.intent?.raw_text,
    vars?.last_user_input,
    vars?.context?.agent_last_message,
    executionContext?.last_user_input,
    body?.last_user_input,
  ]
    .map((t) => String(t || ""))
    .join("\n");

  // Señales de venta nueva (corpus Kapso: "Hola, quiero cotizar…")
  // Ojo: usar prefijos (cotiz…) — `\bcotiz\b` NO matchea "cotizar".
  const looksLikeNewQuote =
    /\b(cotiz\w*|precio|cu[aá]nto\s+sale|cu[aá]nto\s+cuesta|valor|abono)\b/i.test(lastText) ||
    /\b(quiero|necesito|necesitar[ií]amos)\b[\s\S]{0,40}\b(uniforme|camiseta|sudadera|peto|kit)s?\b/i.test(
      lastText
    ) ||
    /\b(uniforme|camiseta|sudadera)s?\b[\s\S]{0,40}\b(\d{1,3}|dry|dumonti|manga|cuello)\b/i.test(
      lastText
    ) ||
    /\.(xlsx|xlsm)|formato\s+pedido|image attached|document attached/i.test(lastText);

  // Solo seguimiento de pedido — no "Hola" ni msgs cortos de clientes conocidos
  const looksLikeHistoryOnly =
    !looksLikeNewQuote &&
    /\b(mi pedido|estado\s+(de\s+)?(mi\s+)?pedido|etapa|tarjeta|producci[oó]n|dise[nñ]o anterior|historial|seguimiento|d[oó]nde va|donde va|ya lo ped[ií]|n[uú]mero de pedido|pedido\s+S0\d+|S0\d{4,})\b/i.test(
      lastText
    );

  let signal;
  let reason;
  if (looksLikeNewQuote && availableEdges.includes("new_customer")) {
    signal = "new_customer";
    reason = "quote_intent";
  } else if (returningSale && availableEdges.includes("new_customer")) {
    signal = "new_customer";
    reason = "returning_sale_flag";
  } else if (
    looksLikeHistoryOnly &&
    availableEdges.includes("existing_customer")
  ) {
    signal = "existing_customer";
    reason = "history_intent";
  } else if (availableEdges.includes("new_customer")) {
    // Default: vendedor (también partners conocidos con "Hola" / msgs cortos)
    signal = "new_customer";
    reason = segment === "existing_customer" ? "existing_to_sales" : "new_or_fallback";
  } else if (availableEdges.includes("existing_customer")) {
    signal = "existing_customer";
    reason = "history_only_edge";
  } else {
    signal = availableEdges[0];
    reason = "first_edge";
  }

  const continuityResumed = vars?.session?.continuity?.resumed === true;
  const hasUsefulQuote =
    Boolean(vars?.quote?.product_text || vars?.quote?.quantity || vars?.quote?.lines?.length);

  const hasGreetingInText = /^(hola|buenas|buenos\s*dias|buen\s*dia|buenas\s*tardes|saludos)/i.test(lastText.trim());
  const isNewQuoteSession =
    continuityResumed || hasUsefulQuote
      ? false
      : !vars?.service?.greeting_sent || (hasGreetingInText && looksLikeNewQuote);

  if (continuityResumed && signal === "new_customer") {
    reason = vars?.session?.continuity?.cross_thread
      ? "continuity_cross_thread"
      : "continuity_resumed";
  }

  return new Response(
    JSON.stringify({
      next_edge: signal,
      vars: {
        customer_line:
          signal === "new_customer"
            ? continuityResumed || returningSale || looksLikeNewQuote
              ? "returning_sale"
              : "new_customer"
            : signal,
        quote:
          looksLikeNewQuote || returningSale
            ? (isNewQuoteSession
                ? {
                    quote_request_source:
                      segment === "existing_customer"
                        ? "client_returning_sale"
                        : "client_new",
                  }
                : {
                    ...(vars.quote || {}),
                    quote_request_source:
                      vars?.quote?.quote_request_source ||
                      (segment === "existing_customer"
                        ? "client_returning_sale"
                        : "client_new"),
                  })
            : vars.quote,
        service: {
          last_call_name: "route_customer_entry",
          last_call_status: "ready",
          last_call_at: now,
          routed_signal: segment,
          routed_edge: signal,
          route_reason: reason,
          returning_sale: Boolean(continuityResumed || returningSale || looksLikeNewQuote),
          fallback_message: null,
          greeting_sent: continuityResumed || hasUsefulQuote
            ? true
            : isNewQuoteSession
              ? false
              : (vars.service?.greeting_sent ?? false),
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
