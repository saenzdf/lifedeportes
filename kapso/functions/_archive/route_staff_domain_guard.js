// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: route-staff-domain-guard  id: 313d9a31-9197-4aa8-8e33-ba7feba69409
// ultimo deploy: 2026-07-21T16:25:41-04:00  status: deployed
// motivo: ruteo del agente staff (nodo retirado)
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

/**
 * Tras Agent Staff: si el dominio activo es nómina/compra, no entrar a compile→pedido.
 * Pedido: next → compile. Nómina/compra tras tools: skip_pedido → wait.
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const availableEdges = Array.isArray(body?.available_edges) ? body.available_edges : [];
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const reg = String(vars?.staff?.registration_type || vars?.staff?.lane || "")
    .trim()
    .toLowerCase();
  const writeMode = String(vars?.staff?.write_mode || "")
    .trim()
    .toLowerCase();
  const explicitPedido =
    writeMode === "opportunity_only" || writeMode === "sale_order";

  const isNomina =
    reg === "nomina" ||
    reg === "staff_nomina" ||
    vars?.nomina?.status === "queued" ||
    vars?.nomina?.status === "pending_confirmation";
  const isCompra =
    reg === "compra" ||
    reg === "staff_compra" ||
    vars?.purchase?.status === "draft_created" ||
    vars?.purchase?.status === "pending_confirmation";

  // Si el agente acaba de pedir write de pedido, prioridad pedido.
  let signal = "staff_pedido_write";
  if (!explicitPedido && (isNomina || isCompra)) {
    signal = "staff_domain_skip_pedido";
  }

  const nextEdge = availableEdges.includes(signal)
    ? signal
    : availableEdges.includes("next")
      ? "next"
      : availableEdges[0];

  const fallback =
    signal === "staff_domain_skip_pedido"
      ? "Dominio nómina/compra: no uses complete_task. Usa confirmar_nomina / crear_compra_odoo y enter_waiting."
      : null;

  return new Response(
    JSON.stringify({
      next_edge: nextEdge,
      vars: {
        service: {
          last_call_name: "route_staff_domain_guard",
          last_call_status: "ready",
          last_call_at: now,
          routed_edge: nextEdge,
          domain_signal: signal,
          fallback_message: fallback,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
