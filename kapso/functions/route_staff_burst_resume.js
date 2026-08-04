/**
 * route_staff_burst_resume — tras wait_staff_burst (~15s).
 * user_input → reinicia el wait (acumula hilo de 3–4 mensajes);
 * timeout → Agent Staff.
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const availableEdges = Array.isArray(body?.available_edges) ? body.available_edges : [];
  const executionContext = body?.execution_context || {};
  const vars = executionContext.vars || {};
  const system = executionContext.system || body?.system || {};
  const now = new Date().toISOString();

  const reason = String(
    system?.last_resume?.reason ||
      vars?.system?.last_resume?.reason ||
      executionContext?.last_resume?.reason ||
      body?.last_resume_reason ||
      ""
  ).toLowerCase();

  let signal;
  let routeReason;
  if (reason === "user_input" && availableEdges.includes("user_input")) {
    signal = "user_input";
    routeReason = "staff_burst_more_messages";
  } else if (availableEdges.includes("timeout")) {
    signal = "timeout";
    routeReason = reason === "timeout" ? "staff_burst_silence_timeout" : "staff_burst_default_to_agent";
  } else if (availableEdges.includes("user_input")) {
    signal = "user_input";
    routeReason = "staff_burst_fallback_rewait";
  } else {
    signal = availableEdges[0];
    routeReason = "first_edge";
  }

  return new Response(
    JSON.stringify({
      next_edge: signal,
      vars: {
        staff: {
          ...(vars.staff || {}),
          burst_resume_reason: reason || null,
          burst_route_reason: routeReason,
        },
        service: {
          ...(vars.service || {}),
          last_call_name: "route_staff_burst_resume",
          last_call_status: "ready",
          last_call_at: now,
          burst_resume_reason: reason || null,
          route_reason: routeReason,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
