function classifyOrderInput(messages) {
  const inbound = [...messages].reverse().filter((message) => message?.direction === "inbound");
  const lastText = String(
    inbound[0]?.content || inbound[0]?.text?.body || ""
  ).trim();
  const evidence = inbound.slice(0, 12).flatMap((message) => {
    const url =
      message?.media_url ||
      message?.media?.url ||
      message?.document?.url ||
      message?.image?.url ||
      null;
    const filename = String(
      message?.media?.filename || message?.document?.filename || message?.filename || ""
    ).trim();
    const mime_type = String(message?.media?.mime_type || message?.mimetype || "").trim();
    return url || filename ? [{ url, filename: filename || null, mime_type: mime_type || null }] : [];
  });
  const names = evidence.map((item) => `${item.filename || ""} ${item.mime_type || ""}`).join(" ");
  if (/\.(xlsx|xlsm|xltx|xls|csv)\b|spreadsheet|excel/i.test(names)) {
    return { lane: "staff_pedido", format: "excel_unknown_layout", confidence: 0.7, parser: "parsear_lista_excel_pedido", mode: "deterministic_then_agent", evidence };
  }
  if (/\.docx\b|wordprocessingml/i.test(names)) {
    return { lane: "staff_pedido", format: "docx_unknown_layout", confidence: 0.65, parser: "parsear_lista_excel_pedido", mode: "deterministic_then_agent", evidence };
  }
  if (/\.(jpe?g|png|webp|pdf)\b|image\//i.test(names)) {
    return { lane: "staff_pedido", format: "image_or_pdf", confidence: 0.55, parser: "parsear_lista_imagen_pedido", mode: "deterministic_then_agent", evidence };
  }
  if (
    /\b(talla|numero|número|dorsal|manga|uniforme|camiseta|arquero)\b/i.test(lastText) &&
    /(?:\n|,|;|\||#|\d)/.test(lastText)
  ) {
    return { lane: "staff_pedido", format: "structured_text", confidence: 0.75, parser: "parsear_lista_texto_pedido", mode: "deterministic", evidence };
  }
  return {
    lane: "staff_pedido",
    format: lastText ? "unstructured_conversation" : "unknown",
    confidence: lastText ? 0.35 : 0.2,
    parser: null,
    mode: "agent_normalize",
    evidence,
  };
}

// Fuente canónica testeable: kapso/functions/lib/classify_order_input.js (mantener en sync).


async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const whatsappContext = body?.whatsapp_context || {};
  const messages = Array.isArray(whatsappContext.messages) ? whatsappContext.messages : [];
  const conversation = whatsappContext.conversation || {};
  const executionContext = body?.execution_context || {};
  const vars = executionContext.vars || {};
  const context = executionContext.context || {};

  const waId = String(
    context?.phone_number ||
      conversation.phone_number ||
      vars?.user?.wa_id ||
      ""
  ).replace(/\D/g, "");

  const tenantId = vars?.tenant?.id || "life_main";

  const isTruthy = (v) =>
    ["1", "true", "yes", "on"].includes(String(v || "").toLowerCase().trim());

  // Solo simulador Kapso sin teléfono real — nunca sobreescribe un wa_id de WhatsApp.
  const forceStaffLane = isTruthy(env.LIFE_FORCE_STAFF_LANE) && !waId;
  const forceStaffName = String(env.LIFE_FORCE_STAFF_NAME || "Staff Test").trim();

  // Staff allowlist - Life Deportes team (match estricto últimos 10 dígitos CO).
  // odoo_project_* se usa en presupuesto/SO (Javier id 8, Paola id 9).
  const LIFE_STAFF = [
    {
      phone: "573103362484",
      name: "Javier Ayala",
      role: "staff",
      odoo_project_id: 8,
      odoo_project_name: "Proyecto Javier",
    },
    {
      phone: "573213988464",
      name: "Paola",
      role: "staff",
      odoo_project_id: 9,
      odoo_project_name: "Proyecto Paola",
    },
    { phone: "3000000046", name: "Sebastián Ayala", role: "staff" },
    { phone: "3000000047", name: "Diego Saenz", role: "staff" },
  ];

  const localDigits = (digits) => {
    const d = String(digits).replace(/\D/g, "");
    return d.length >= 10 ? d.slice(-10) : d;
  };

  const phonesMatch = (incoming, allowed) => {
    const a = localDigits(incoming);
    const b = localDigits(allowed);
    return Boolean(a && b && a.length === 10 && a === b);
  };

  const fromEnv = String(env.LIFE_STAKEHOLDER_WHITELIST || "")
    .split(/[,;\s]+/)
    .map((x) => x.replace(/\D/g, ""))
    .filter(Boolean);

  let isStaff = false;
  let staffMember = null;

  if (waId) {
    for (const member of LIFE_STAFF) {
      if (phonesMatch(waId, member.phone)) {
        isStaff = true;
        staffMember = member;
        break;
      }
    }
    if (!isStaff) {
      for (const phone of fromEnv) {
        if (phonesMatch(waId, phone)) {
          isStaff = true;
          staffMember = { phone: localDigits(phone), name: "Staff", role: "staff" };
          break;
        }
      }
    }
  }

  if (forceStaffLane && !isStaff) {
    isStaff = true;
    staffMember = {
      phone: "573000000000",
      name: forceStaffName,
      role: "staff",
    };
  }

  return new Response(
    JSON.stringify({
      vars: {
        user: {
          wa_id: waId || staffMember?.phone || null,
          role: isStaff ? "staff" : "customer",
          name:
            staffMember?.name ||
            context?.contact?.profile_name ||
            context?.contact?.name ||
            null,
          is_allowed_for_transactions: isStaff,
          odoo_project_id: staffMember?.odoo_project_id ?? null,
          odoo_project_name: staffMember?.odoo_project_name ?? null,
          staff_member: staffMember || null,
        },
        staff: isStaff
          ? {
              ...(vars.staff || {}),
              lane: "staff_order_intake",
              input_route: classifyOrderInput(messages),
            }
          : vars.staff,
        tenant: {
          id: tenantId,
          name: tenantId === "life_main" ? "Life Deportes Principal" : "Life Deportes",
          policy_set: "sales_default_v1",
          secret_prefix: tenantId === "life_main" ? "TENANT_LIFE_MAIN" : "TENANT_SECONDARY",
          phone_number_id: vars?.tenant?.phone_number_id || null,
        },
        service: {
          last_call_name: "staff_allowlist_check",
          last_call_status: "ready",
          last_call_at: new Date().toISOString(),
          force_staff_lane: forceStaffLane,
          fallback_message: isStaff
            ? forceStaffLane
              ? `Staff test (LIFE_FORCE_STAFF_LANE): ${staffMember?.name || forceStaffName}`
              : `Staff detectado: ${staffMember?.name || waId}`
            : waId
              ? `Cliente (no allowlist): ${waId}`
              : null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
