async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const executionContext = body.execution_context || {};
  const vars = executionContext.vars || {};
  const input = body.input || {};
  const now = new Date().toISOString();

  const context = executionContext.context || {};
  const whatsappContext = body.whatsapp_context || {};
  const lastMessage = Array.isArray(whatsappContext.messages)
    ? whatsappContext.messages[whatsappContext.messages.length - 1]
    : null;

  const expectedAmount = Number(
    input.expected_amount_cop ||
      vars.payment?.expected_amount_cop ||
      (Number(vars.quote?.total_cop || vars.order?.amount_total || 0) / 2)
  ) || null;

  const receiptAttachment =
    input.receipt_attachment ||
    vars.payment?.receipt_attachment ||
    lastMessage?.image ||
    lastMessage?.document ||
    lastMessage?.media ||
    null;

  const reviewPacket = {
    schema_version: "payment_review_v1",
    tenant_id: vars.tenant?.id || null,
    customer_wa_id: vars.user?.wa_id || context.contact?.wa_id || null,
    customer_name: context.contact?.profile_name || null,
    expected_amount_cop: expectedAmount,
    received_reference: input.received_reference || vars.payment?.received_reference || null,
    received_method: input.received_method || vars.payment?.received_method || null,
    receipt_attachment: receiptAttachment,
    quote: {
      product_text: vars.quote?.product_text || null,
      variant: vars.quote?.variant || null,
      material: vars.quote?.material || null,
      quantity: vars.quote?.quantity || null,
      unit_cop: vars.quote?.unit_cop || null,
      total_cop: vars.quote?.total_cop || vars.order?.amount_total || null,
    },
    order_id: vars.order?.id || null,
    conversation_summary:
      input.conversation_summary ||
      vars.quote?.commercial_summary ||
      vars.intent?.raw_text ||
      null,
    created_at: now,
    human_action: "verify_receipt_and_bank_entry",
  };

  return new Response(
    JSON.stringify({
      vars: {
        funnel: {
          stage: "pago_en_revision",
          stage_reason: "payment_receipt_received",
          updated_at: now,
        },
        payment: {
          verification_status: "pending_human_review",
          expected_amount_cop: expectedAmount,
          received_reference: reviewPacket.received_reference,
          received_method: reviewPacket.received_method,
          receipt_attachment: receiptAttachment,
          review_packet: reviewPacket,
          reviewed_by: null,
          reviewed_at: null,
        },
        handoff: {
          reason: "payment_human_review",
          context_packet: reviewPacket,
        },
        service: {
          last_call_name: "prepare_payment_review",
          last_call_status: "ready",
          last_call_at: now,
          fallback_message: null,
        },
      },
      status: "ready",
      message: "Payment review packet prepared for human verification.",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
