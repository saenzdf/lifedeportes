// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: get-service-status  id: c0ea46a6-24f3-4e64-bdd9-cbb51c21a85d
// ultimo deploy: 2026-04-22T17:27:51-04:00  status: deployed
// motivo: tool de ops retirado
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const serviceName = String(input.service_name || "").trim();

  const SERVICE_REGISTRY = {
    buscar_producto_odoo: { status: "ready", fallback_message: "No logre traer el precio exacto, pero sigo con la conversacion." },
    construir_payload_pedido: { status: "stub", fallback_message: "Tomo nota de lo que me diste; te confirmo el detalle del pedido en cuanto cerremos." },
    activar_cotizacion_odoo: { status: "stub", fallback_message: "Perfecto, dejo tu pedido en proceso. Un asesor humano te confirma el numero y el link de pago." },
    invocar_media_intake: { status: "stub", fallback_message: "Recibi tu archivo. Por ahora necesito que me confirmes los datos por chat; te ayudo a armar la lista." },
    get_service_status: { status: "ready", fallback_message: null },
    handoff_to_human: { status: "ready", fallback_message: null },
    resolve_tenant_context: { status: "ready", fallback_message: null },
    policy_guard_input: { status: "ready", fallback_message: null },
    staff_allowlist_check: { status: "stub", fallback_message: "Allowlist vacia; toda interaccion se trata como cliente." },
  };

  const entry = SERVICE_REGISTRY[serviceName] || {
    status: "unknown",
    fallback_message: `Servicio '${serviceName}' no registrado.`,
  };

  return new Response(
    JSON.stringify({
      vars: {
        service: {
          last_call_name: "get_service_status",
          last_call_status: "ready",
          last_call_at: new Date().toISOString(),
          queried_service: serviceName,
          queried_status: entry.status,
          queried_fallback_message: entry.fallback_message,
          fallback_message: null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
