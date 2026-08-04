async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const whatsappContext = body?.whatsapp_context || {};
  const messages = Array.isArray(whatsappContext.messages) ? whatsappContext.messages : [];
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  const executionContext = body?.execution_context || {};
  const vars = executionContext.vars || {};
  const now = new Date().toISOString();

  const rawText = String(
    lastInbound?.content ||
      lastInbound?.text?.body ||
      vars?.last_user_input ||
      vars?.intent?.raw_text ||
      body?.input?.text ||
      body?.input?.message ||
      ""
  ).trim();

  const isStaff = vars?.user?.role === "staff";

  // v9: canal staff = solo ingreso de pedidos (nómina/compra archivados).
  const staffRoute = isStaff ? "staff_upload_pedido" : "staff_consultation";
  const registrationType = isStaff ? "pedido" : vars?.staff?.registration_type || null;

  return new Response(
    JSON.stringify({
      vars: {
        staff_route: staffRoute,
        staff: {
          ...(vars.staff || {}),
          registration_type: registrationType,
          lane: isStaff ? "staff_order_intake" : null,
        },
        intent_next: isStaff ? staffRoute : vars?.intent_next,
        service: {
          last_call_name: "detect_staff_upload_command",
          last_call_status: "ready",
          last_call_at: now,
          staff_route: staffRoute,
          upload_command_detected: /^SUBIR\s+PEDIDO$/i.test(rawText),
          registration_type: registrationType,
          detected_from_text: rawText || null,
          fallback_message: null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
