/**
 * route_customer_sales_whitelist — gate carril ventas.
 * Solo números en whitelist (Diego / LIFE_SALES_TESTER_WHITELIST) → classify/vendedor.
 * Resto → mensaje de mantenimiento (mismo copy staff-only).
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

  // Diego (tester ventas) + override por env
  const DEFAULT_TESTERS = ["573172575981", "3172575981"];
  const fromEnv = String(env.LIFE_SALES_TESTER_WHITELIST || "")
    .split(/[,;\s]+/)
    .map((x) => x.replace(/\D/g, ""))
    .filter(Boolean);
  const allowed = [...DEFAULT_TESTERS, ...fromEnv].map(localDigits).filter((d) => d.length === 10);
  const incoming = localDigits(waId);
  const allowedSales = Boolean(incoming && allowed.includes(incoming));

  let signal;
  let reason;
  if (allowedSales && availableEdges.includes("sales_allowed")) {
    signal = "sales_allowed";
    reason = "sales_tester_whitelist";
  } else if (availableEdges.includes("maintenance")) {
    signal = "maintenance";
    reason = allowedSales ? "no_sales_edge" : "not_in_sales_whitelist";
  } else if (availableEdges.includes("sales_allowed")) {
    signal = "sales_allowed";
    reason = "sales_edge_fallback";
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
          sales_tester: allowedSales,
        },
        kapso: {
          ...(vars.kapso || {}),
          sales_whitelist_gate: true,
          sales_allowed: allowedSales,
        },
        service: {
          last_call_name: "route_customer_sales_whitelist",
          last_call_status: "ready",
          last_call_at: now,
          routed_edge: signal,
          route_reason: reason,
          fallback_message: allowedSales
            ? "Tester ventas — carril cliente abierto"
            : "Fuera de whitelist ventas — mantenimiento",
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
