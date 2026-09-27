// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: mark-maintenance-sent  id: 4fb0b1cc-b2a3-4232-8e7c-9b295710faf3
// ultimo deploy: 2026-07-02T09:17:28-04:00  status: deployed
// motivo: ruteo cliente legacy (marzo-julio)
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

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
