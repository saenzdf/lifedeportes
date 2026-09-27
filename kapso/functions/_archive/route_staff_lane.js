// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: route-staff-lane  id: 763ddc62-3d3a-439e-a3f4-78621a93ea3a
// ultimo deploy: 2026-07-05T20:47:28-04:00  status: deployed
// motivo: ruteo staff legacy
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const availableEdges = Array.isArray(body?.available_edges) ? body.available_edges : [];
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const route = String(vars?.staff_route || "staff_pedido");
  const preferred = route === "staff_nomina" ? "staff_nomina" : "staff_pedido";
  const nextEdge = availableEdges.includes(preferred)
    ? preferred
    : availableEdges.includes("staff_pedido")
      ? "staff_pedido"
      : availableEdges[0];

  return new Response(
    JSON.stringify({
      next_edge: nextEdge,
      vars: {
        service: {
          last_call_name: "route_staff_lane",
          last_call_status: "ready",
          last_call_at: now,
          routed_signal: preferred,
          routed_edge: nextEdge,
          fallback_message: null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
