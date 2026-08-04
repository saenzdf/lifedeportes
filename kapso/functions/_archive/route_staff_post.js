async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const availableEdges = Array.isArray(body?.available_edges) ? body.available_edges : [];
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const signal = String(vars?.intent_next || vars?.staff_route || "staff_consultation");
  const order = ["staff_consultation", "staff_upload_pedido", "staff_upload_registro", "continue_chat"];
  const pick =
    order.find((e) => e === signal && availableEdges.includes(e)) ||
    (availableEdges.includes("staff_consultation") ? "staff_consultation" : availableEdges[0]);

  return new Response(
    JSON.stringify({
      next_edge: pick,
      vars: {
        service: {
          last_call_name: "route_staff_post",
          last_call_status: "ready",
          last_call_at: now,
          routed_signal: signal,
          routed_edge: pick,
          fallback_message: null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
