async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const whatsappContext = body?.whatsapp_context || {};
  const messages = Array.isArray(whatsappContext.messages) ? whatsappContext.messages : [];
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  const executionContext = body?.execution_context || {};
  const vars = executionContext.vars || {};
  const rawText = String(
    waInboundText(lastInbound) ||
      vars?.last_user_input ||
      vars?.intent?.raw_text ||
      body?.input?.text ||
      body?.input?.message ||
      ""
  ).trim();

  function waInboundText(msg) {
    if (!msg || typeof msg !== "object") return "";
    const direct = msg.content ?? msg.body;
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const nested = msg.text;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
    if (nested && typeof nested === "object") {
      const bodyText = nested.body ?? nested.text;
      if (typeof bodyText === "string" && bodyText.trim()) return bodyText.trim();
    }
    return "";
  }

  const INJECTION_PATTERNS = [
    /ignora\s+(tus\s+)?instrucciones/i,
    /olvida\s+(tu\s+)?prompt/i,
    /act[uú]a\s+como/i,
    /eres\s+ahora/i,
    /nuevo\s+rol/i,
    /system\s*prompt/i,
    /jailbreak/i,
    /dan\s+mode/i,
    /developer\s+mode/i,
    /ignore\s+(all\s+)?previous/i,
    /forget\s+(your\s+)?instructions/i,
    /pretend\s+you\s+are/i,
    /execute\s+sql/i,
    /drop\s+table/i,
    /delete\s+from/i,
    /update\s+.*set/i,
    /--\s*admin/i,
    /sudo\s+/i,
    /rm\s+-rf/i,
    /unlink/i,
    /write.*ir\.rule/i,
  ];

  const flagged = INJECTION_PATTERNS.some((p) => p.test(rawText));
  const firstMatch = flagged
    ? INJECTION_PATTERNS.find((p) => p.test(rawText))?.source
    : null;

  const isStaffCommand = /^SUBIR(\s+(PEDIDO|NOMINA|COMPRA))?$/i.test(rawText.trim());
  const isStaffCorrection = /^(corregir|actualizar|modificar)\b/i.test(rawText.trim());
  const shouldBlock = flagged && !isStaffCommand && !isStaffCorrection;

  const sanitized = shouldBlock
    ? "[mensaje bloqueado por politica de seguridad]"
    : flagged
      ? rawText.replace(INJECTION_PATTERNS.find((p) => p.test(rawText)), "[contenido filtrado]")
      : rawText;

  const GENUINE_KEYWORDS = [
    "uniforme", "camiseta", "buzo", "pantaloneta", "medias", "talla", "futbol",
    "precio", "cotizar", "voley", "voleibol", "baloncesto", "arquero", "diseno", "sublimado",
    "dorsal", "nombre", "estampado", "taller", "pedido", "compra", "cotizacion",
    "presupuesto", "prenda", "tela", "dumonti", "dry", "manga", "cuello", "saco",
    "chaqueta", "pantalon", "licra", "impermeable", "bolsillo", "bordado",
    "vendedor", "asesor", "persona", "atencion", "humano", "atender", "cantidad",
  ];

  function fold(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function transcriptOf(msg) {
    const raw = msg?.transcript ?? msg?.metadata?.transcript ?? msg?.kapso?.transcript;
    if (!raw) return "";
    if (typeof raw === "string") return raw;
    if (typeof raw === "object") return String(raw.text || raw.transcript || raw.body || "");
    return "";
  }

  const conversation = whatsappContext.conversation || {};
  const assignee = conversation.assignee || vars.assignee || vars.assignee_id || null;
  const hasHumanAssignee = assignee !== null && assignee !== undefined &&
                           String(assignee).toLowerCase() !== "null" &&
                           String(assignee).trim() !== "";

  const combinedText = fold(rawText + " " + transcriptOf(lastInbound));
  const hasGenuineKeyword = GENUINE_KEYWORDS.some((kw) => combinedText.includes(kw));

  let spamProfile = vars.spam_profile || null;
  if (spamProfile && (spamProfile.is_spam || spamProfile.ads_prefill_only)) {
    if (hasHumanAssignee || hasGenuineKeyword) {
      spamProfile = null;
    }
  }

  return new Response(
    JSON.stringify({
      vars: {
        spam_profile: spamProfile,
        intent: {
          raw_text: sanitized,
        },
        security: {
          policy_version: "2026-06-17",
          input_flagged: flagged,
          input_blocked: shouldBlock,
          last_block_reason: flagged ? `injection_pattern:${firstMatch}` : null,
          mcp_call_count: 0,
        },
        service: {
          last_call_name: "policy_guard_input",
          last_call_status: shouldBlock ? "blocked" : "ready",
          last_call_at: new Date().toISOString(),
          fallback_message: shouldBlock
            ? "Mensaje bloqueado. Si necesita ayuda, escriba de forma normal o pida hablar con un asesor."
            : flagged
              ? "Mensaje sanitizado; preferir handoff si persiste comportamiento sospechoso."
              : null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
