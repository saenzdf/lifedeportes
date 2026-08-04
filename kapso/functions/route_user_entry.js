/**
 * route_user_entry — staff | customer (whitelist ventas) | maintenance.
 *
 * - staff → carril staff
 * - whitelist ventas (Diego / LIFE_SALES_TESTER_WHITELIST) → customer (vendedor)
 * - resto → maintenance (mensaje de mantenimiento)
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

  const isTruthy = (v) =>
    ["1", "true", "yes", "on"].includes(String(v ?? "").toLowerCase().trim());

  const waId = String(
    context?.phone_number ||
      conversation.phone_number ||
      vars?.user?.wa_id ||
      ""
  ).replace(/\D/g, "");

  const localDigits = (digits) => {
    const d = String(digits || "").replace(/\D/g, "");
    return d.length >= 10 ? d.slice(-10) : d;
  };

  // Sales tester whitelist (Diego). Env override: LIFE_SALES_TESTER_WHITELIST
  const DEFAULT_TESTERS = ["573172575981", "3172575981"];
  const fromEnv = String(env.LIFE_SALES_TESTER_WHITELIST || "")
    .split(/[,;\s]+/)
    .map((x) => x.replace(/\D/g, ""))
    .filter(Boolean);
  const allowed = [...DEFAULT_TESTERS, ...fromEnv]
    .map(localDigits)
    .filter((d) => d.length === 10);
  const incoming = localDigits(waId);
  const salesTester = Boolean(incoming && allowed.includes(incoming));

  // Disable sales whitelist gate completely to keep sales lane open.
  const salesGate = false;

  const isStaff = vars?.user?.role === "staff";

  let signal;
  let reason;
  if (isStaff && availableEdges.includes("staff")) {
    signal = "staff";
    reason = "staff_role";
  } else if (salesGate && salesTester && availableEdges.includes("customer")) {
    signal = "customer";
    reason = "sales_tester_whitelist";
  } else if (salesGate && availableEdges.includes("maintenance")) {
    signal = "maintenance";
    reason = salesTester ? "no_customer_edge" : "not_in_sales_whitelist";
  } else if (availableEdges.includes("customer")) {
    signal = "customer";
    reason = "customer_default";
  } else {
    signal = availableEdges[0];
    reason = "first_edge";
  }

  return new Response(
    JSON.stringify({
      next_edge: signal,
      vars: {
        user_lane: signal === "staff" ? "staff" : signal === "customer" ? "customer" : "maintenance",
        user: {
          ...(vars.user || {}),
          wa_id: waId || vars?.user?.wa_id || null,
          sales_tester: salesTester,
        },
        kapso: {
          ...(vars.kapso || {}),
          staff_only_mode: false,
          sales_whitelist_gate: salesGate,
          sales_allowed: salesTester,
          customer_lane:
            signal === "customer"
              ? salesTester
                ? "sales_tester"
                : "open"
              : signal === "maintenance"
                ? "paused_maintenance"
                : null,
        },
        service: {
          last_call_name: "route_user_entry",
          last_call_status: "ready",
          last_call_at: now,
          routed_edge: signal,
          route_reason: reason,
          fallback_message: null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
