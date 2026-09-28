// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: route-customer-paused  id: 64a408aa-2b5c-4112-81e2-9d09ccfda23d
// ultimo deploy: 2026-07-14T13:29:31-04:00  status: deployed
// motivo: ruteo cliente legacy sin cablear
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

/**
 * route_customer_paused — mantenimiento para clientes + bypass whitelist ventas.
 *
 * Edges:
 * - sales_allowed: número en LIFE_SALES_TESTER_WHITELIST / Diego → carril ventas
 * - send_message: primera vez → mensaje mantenimiento
 * - already_notified: ya avisado → solo wait
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

  const waId = String(
    context?.phone_number ||
      conversation.phone_number ||
      vars?.user?.wa_id ||
      vars?.context?.phone_number ||
      ""
  ).replace(/\D/g, "");

  const localDigits = (digits) => {
    const d = String(digits || "").replace(/\D/g, "");
    return d.length >= 10 ? d.slice(-10) : d;
  };

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
          last_call_name: "route_customer_paused",
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
