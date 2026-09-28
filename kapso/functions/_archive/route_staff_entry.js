// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: route-staff-entry  id: 04a7d6df-9467-4981-a04d-5df66a45cac9
// ultimo deploy: 2026-06-17T09:48:27-04:00  status: deployed
// motivo: ya archivada localmente (graph-guard)
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const availableEdges = Array.isArray(body?.available_edges) ? body.available_edges : [];
  const executionContext = body?.execution_context || {};
  const vars = executionContext.vars || {};
  const now = new Date().toISOString();

  const signal = String(vars?.staff_route || "staff_consultation");
  const defaultEdge = availableEdges.includes("staff_consultation")
    ? "staff_consultation"
    : availableEdges.includes("continue_agent")
      ? "continue_agent"
      : availableEdges[0];
  const nextEdge = availableEdges.includes(signal) ? signal : defaultEdge;

  return new Response(
    JSON.stringify({
      next_edge: nextEdge,
      vars: {
        service: {
          last_call_name: "route_staff_entry",
          last_call_status: "ready",
          last_call_at: now,
          routed_signal: signal,
          routed_edge: nextEdge,
          fallback_message: null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
