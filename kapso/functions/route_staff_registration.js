async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const availableEdges = Array.isArray(body?.available_edges) ? body.available_edges : [];
  const executionContext = body?.execution_context || {};
  const vars = executionContext.vars || {};
  const now = new Date().toISOString();

  const registrationType = String(
    vars?.staff?.registration_type || "pedido"
  ).toLowerCase();

  const signal =
    registrationType === "nomina" &&
    availableEdges.includes("staff_register_nomina")
      ? "staff_register_nomina"
      : registrationType === "compra" &&
          availableEdges.includes("staff_register_pedido")
        ? "staff_register_pedido"
        : availableEdges.includes("staff_register_pedido")
          ? "staff_register_pedido"
          : availableEdges[0];

  return new Response(
    JSON.stringify({
      next_edge: signal,
      vars: {
        service: {
          last_call_name: "route_staff_registration",
          last_call_status: "ready",
          last_call_at: now,
          routed_registration_type: registrationType,
          routed_edge: signal,
          fallback_message: null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
