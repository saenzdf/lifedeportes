function textOf(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function detectApproval(text) {
  const lower = text.toLowerCase();
  if (/\b(aprobado|apruebo|aprobamos|queda aprobado|autorizo produccion|pueden producir)\b/.test(lower)) {
    return "approved";
  }
  if (/\b(cambiar|corrige|corregir|sin |con |mover|subir|bajar|quitar|poner|ajustar|modificar|otro color|logo|bandera|manga)\b/.test(lower)) {
    return "corrections_requested";
  }
  if (/^(ok|listo|dale|si|sí|me gusta|perfecto|👍|👌|✅)\.?$/i.test(text)) {
    return "needs_human_review";
  }
  return "needs_human_review";
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body.input || {};
  const executionContext = body.execution_context || {};
  const vars = executionContext.vars || {};
  const now = new Date().toISOString();

  const action = textOf(input.action || vars.intent_next || "detect");
  const customerText = textOf(input.customer_text || vars.intent?.raw_text || "");
  let status = textOf(input.approval_status || "");

  if (!status) {
    if (action === "approve_design") status = "approved";
    else if (action === "record_design_corrections") status = "corrections_requested";
    else if (action === "send_design_for_approval") status = "sent_to_customer";
    else status = detectApproval(customerText);
  }

  const previousCorrections = Array.isArray(vars.design?.corrections)
    ? vars.design.corrections
    : [];
  const correction =
    status === "corrections_requested"
      ? {
          text: customerText,
          version: input.version || vars.design?.version || null,
          received_at: now,
        }
      : null;

  const design = {
    approval_status: status,
    version: input.version || vars.design?.version || null,
    sent_at:
      status === "sent_to_customer"
        ? now
        : vars.design?.sent_at || null,
    approved_at: status === "approved" ? now : vars.design?.approved_at || null,
    approved_text: status === "approved" ? customerText : vars.design?.approved_text || null,
    corrections: correction ? [...previousCorrections, correction] : previousCorrections,
    handoff_required: status === "needs_human_review",
  };

  return new Response(
    JSON.stringify({
      vars: {
        funnel: {
          stage: status === "approved" ? "produccion" : "diseno_en_aprobacion",
          stage_reason:
            status === "approved"
              ? "client_design_approved"
              : status === "corrections_requested"
                ? "client_requested_design_corrections"
                : status === "sent_to_customer"
                  ? "design_sent_to_customer"
                  : "design_response_needs_review",
          updated_at: now,
        },
        design,
        production_order: {
          ready_for_design:
            vars.payment?.verification_status === "approved" &&
            vars.order_details?.completeness === "complete",
          ready_for_production: status === "approved",
          notes_for_designers: vars.production_order?.notes_for_designers || "",
        },
        handoff:
          status === "needs_human_review"
            ? {
                reason: "design_approval_ambiguous",
                context_packet: {
                  customer_text: customerText,
                  current_design: design,
                  order_details: vars.order_details || null,
                },
              }
            : vars.handoff,
        service: {
          last_call_name: "design_approval_gate",
          last_call_status: "ready",
          last_call_at: now,
          fallback_message: null,
        },
      },
      status: "ready",
      design_status: status,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
