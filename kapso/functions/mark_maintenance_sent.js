async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  return new Response(
    JSON.stringify({
      vars: {
        kapso: {
          ...(vars.kapso || {}),
          maintenance_message_sent: true,
          maintenance_message_sent_at: now,
          customer_lane: "paused_maintenance",
          staff_only_mode: true,
        },
        service: {
          last_call_name: "mark_maintenance_sent",
          last_call_status: "ready",
          last_call_at: now,
          fallback_message: null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
