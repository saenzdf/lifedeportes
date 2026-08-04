/**
 * route_staff_write — ok | needs_confirmation | blocked
 * needs_confirmation usa edge staff_write_blocked (mensaje pide CONFIRMO SUBIR)
 * o staff_write_needs_confirmation si el grafo lo expone.
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const availableEdges = Array.isArray(body?.available_edges) ? body.available_edges : [];
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const status = String(vars?.staff?.write_status || "ok");
  let signal;
  if (status === "blocked" && availableEdges.includes("staff_write_blocked")) {
    signal = "staff_write_blocked";
  } else if (
    status === "needs_confirmation" &&
    availableEdges.includes("staff_write_needs_confirmation")
  ) {
    signal = "staff_write_needs_confirmation";
  } else if (status === "needs_confirmation" && availableEdges.includes("staff_write_blocked")) {
    signal = "staff_write_blocked";
  } else if (availableEdges.includes("staff_write_ok")) {
    signal = "staff_write_ok";
  } else {
    signal = availableEdges[0];
  }

  return new Response(
    JSON.stringify({
      next_edge: signal,
      vars: {
        service: {
          last_call_name: "route_staff_write",
          last_call_status: "ready",
          last_call_at: now,
          routed_edge: signal,
          fallback_message: vars?.staff?.write_blocked_reason || null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
