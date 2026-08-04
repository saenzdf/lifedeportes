async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const availableEdges = Array.isArray(body?.available_edges) ? body.available_edges : [];
  const executionContext = body?.execution_context || {};
  const vars = executionContext.vars || {};

  const signal = String(vars?.intent_next || "continue_chat");
  const defaultEdge = availableEdges.includes("continue_chat")
    ? "continue_chat"
    : availableEdges[0];

  const nextEdge = availableEdges.includes(signal) ? signal : defaultEdge;

  return new Response(
    JSON.stringify({
      next_edge: nextEdge,
      vars: {
        service: {
          last_call_name: "route_intent_next",
          last_call_status: "ready",
          last_call_at: new Date().toISOString(),
          routed_signal: signal,
          routed_edge: nextEdge,
          fallback_message: null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
