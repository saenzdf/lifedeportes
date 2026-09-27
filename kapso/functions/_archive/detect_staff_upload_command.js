// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: detect-staff-upload-command  id: 7113451a-db22-4863-bec5-26f9eb223c23
// ultimo deploy: 2026-06-29T19:55:24-04:00  status: deployed
// motivo: ya archivada localmente (graph-guard)
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

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
  const uploadPedido = /^SUBIR\s+PEDIDO$/i.test(rawText);
  const uploadNomina = /^SUBIR\s+NOMINA$/i.test(rawText);
  const uploadCompra = /^SUBIR\s+COMPRA$/i.test(rawText);

  let staffRoute = "staff_consultation";
  let registrationType = vars?.staff?.registration_type || null;

  if (isStaff && uploadPedido) {
    staffRoute = "staff_upload_pedido";
    registrationType = "pedido";
  } else if (isStaff && (uploadNomina || uploadCompra)) {
    staffRoute = "staff_upload_registro";
    registrationType = uploadNomina ? "nomina" : "compra";
  }

  const uploadCommand = staffRoute !== "staff_consultation";

  return new Response(
    JSON.stringify({
      vars: {
        staff_route: staffRoute,
        staff: {
          ...(vars.staff || {}),
          registration_type: registrationType,
        },
        intent_next: uploadCommand ? staffRoute : vars?.intent_next,
        service: {
          last_call_name: "detect_staff_upload_command",
          last_call_status: "ready",
          last_call_at: now,
          staff_route: staffRoute,
          upload_command_detected: uploadCommand,
          registration_type: registrationType,
          detected_from_text: rawText || null,
          fallback_message: null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
