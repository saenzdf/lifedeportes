// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: detect-staff-lane  id: b6e4935f-cbf7-48f7-9483-729a2294ec14
// ultimo deploy: 2026-08-04T17:25:17-04:00  status: deployed
// motivo: detección de carril staff legacy
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

/**
 * Staff: pedido vs nómina. Comando SUBIR NOMINA o sesión nomina activa.
 */
function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function classifyStaffOrderInput(messages, rawText) {
  const inbound = [...messages].reverse().filter((message) => message?.direction === "inbound");
  const evidence = [];
  for (const message of inbound.slice(0, 12)) {
    const url =
      message?.media_url ||
      message?.media?.url ||
      message?.document?.url ||
      message?.image?.url ||
      null;
    const filename = compact(
      message?.media?.filename || message?.document?.filename || message?.filename
    );
    const mimeType = compact(message?.media?.mime_type || message?.mimetype);
    if (url || filename) evidence.push({ url, filename: filename || null, mime_type: mimeType || null });
  }

  const names = evidence.map((item) => `${item.filename || ""} ${item.mime_type || ""}`).join(" ");
  if (/\.(xlsx|xlsm|xltx|xls|csv)\b|spreadsheet|excel/i.test(names)) {
    return {
      lane: "staff_pedido",
      format: "excel_unknown_layout",
      confidence: 0.7,
      parser: "parsear_lista_excel_pedido",
      mode: "deterministic_then_agent",
      evidence,
    };
  }
  if (/\.docx\b|wordprocessingml/i.test(names)) {
    return {
      lane: "staff_pedido",
      format: "docx_unknown_layout",
      confidence: 0.65,
      parser: "parsear_lista_excel_pedido",
      mode: "deterministic_then_agent",
      evidence,
    };
  }
  if (/\.(jpe?g|png|webp|pdf)\b|image\//i.test(names)) {
    return {
      lane: "staff_pedido",
      format: "image_or_pdf",
      confidence: 0.55,
      parser: "parsear_lista_imagen_pedido",
      mode: "deterministic_then_agent",
      evidence,
    };
  }
  if (
    /\b(talla|numero|número|dorsal|manga|uniforme|camiseta|arquero)\b/i.test(rawText) &&
    /(?:\n|,|;|\||#|\d)/.test(rawText)
  ) {
    return {
      lane: "staff_pedido",
      format: "structured_text",
      confidence: 0.75,
      parser: "parsear_lista_texto_pedido",
      mode: "deterministic",
      evidence,
    };
  }
  return {
    lane: "staff_pedido",
    format: rawText ? "unstructured_conversation" : "unknown",
    confidence: rawText ? 0.35 : 0.2,
    parser: null,
    mode: "agent_normalize",
    evidence,
  };
}

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
      body?.input?.text ||
      ""
  ).trim();

  const isStaff = vars?.user?.role === "staff";
  const isNominaCmd = /^SUBIR\s+NOMINA$/i.test(rawText);
  const isCompraCmd = /^SUBIR\s+COMPRA$/i.test(rawText);
  const isPedidoCmd =
    /^SUBIR(\s+PEDIDO)?$/i.test(rawText) && !isNominaCmd && !isCompraCmd;

  const nominaQueued = vars?.nomina?.status === "queued";
  const compraDone = vars?.purchase?.status === "draft_created";
  const inNominaSession =
    vars?.staff?.registration_type === "nomina" && !nominaQueued && !isPedidoCmd && !isCompraCmd;
  const inCompraSession =
    vars?.staff?.registration_type === "compra" && !compraDone && !isPedidoCmd && !isNominaCmd;

  // Semilla de vars para el Agent Staff unificado (no ramifica a otros agentes).
  let staffRoute = "staff_pedido";
  let registrationType = "pedido";

  if (isStaff && (isNominaCmd || inNominaSession)) {
    staffRoute = "staff_nomina";
    registrationType = "nomina";
  } else if (isStaff && (isCompraCmd || inCompraSession)) {
    staffRoute = "staff_compra";
    registrationType = "compra";
  }
  const inputRoute =
    registrationType === "pedido"
      ? classifyStaffOrderInput(messages, rawText)
      : registrationType === "nomina"
        ? {
            lane: "staff_nomina",
            format: "attlog_or_conversation",
            confidence: 0.8,
            parser: "parse_nomina_attlog",
            mode: "deterministic",
            evidence: [],
          }
        : {
            lane: "staff_compra",
            format: "purchase_draft",
            confidence: 0.75,
            parser: null,
            mode: "agent_normalize",
            evidence: [],
          };

  return new Response(
    JSON.stringify({
      vars: {
        staff_route: staffRoute,
        staff: {
          ...(vars.staff || {}),
          registration_type: registrationType,
          lane:
            registrationType === "nomina"
              ? "staff_nomina"
              : registrationType === "compra"
                ? "staff_compra"
                : "staff_order_intake",
          input_route: inputRoute,
        },
        intent_next: isStaff ? staffRoute : vars?.intent_next,
        service: {
          last_call_name: "detect_staff_lane",
          last_call_status: "ready",
          last_call_at: now,
          staff_route: staffRoute,
          registration_type: registrationType,
          detected_from_text: rawText || null,
          fallback_message: null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
