// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: route-nomina-confirm  id: e65f3ee7-2ff7-41a4-a5ac-66278b080db2
// ultimo deploy: 2026-07-05T20:47:32-04:00  status: deployed
// motivo: nómina legacy
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const availableEdges = Array.isArray(body?.available_edges) ? body.available_edges : [];
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const ok = vars?.staff?.write_status === "ok";
  const signal = ok ? "nomina_confirm_ok" : "nomina_confirm_blocked";
  const nextEdge = availableEdges.includes(signal) ? signal : availableEdges[0];

  return new Response(
    JSON.stringify({
      next_edge: nextEdge,
      vars: {
        service: {
          last_call_name: "route_nomina_confirm",
          last_call_status: "ready",
          last_call_at: now,
          routed_edge: nextEdge,
          fallback_message: null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
