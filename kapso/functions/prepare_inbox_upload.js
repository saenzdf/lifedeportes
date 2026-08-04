/**
 * prepare_inbox_upload — gate Jump/Observer → write chain (hilo cliente).
 * Semilla order_draft desde quote, customer_wa_id del hilo, upload_source=inbox_silent.
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const ctx = body?.execution_context || {};
  const vars = ctx.vars || {};
  const now = new Date().toISOString();

  const contextPhone = String(ctx.context?.phone_number || vars?.user?.wa_id || "")
    .replace(/\D/g, "")
    .trim();

  const quote = { ...(vars.quote || {}) };
  if (!String(quote.customer_wa_id || "").replace(/\D/g, "").trim() && contextPhone) {
    quote.customer_wa_id = contextPhone;
  }
  if (!quote.quote_request_source) {
    quote.quote_request_source = "client_conversation";
  }

  const orderDraft = { ...(vars.order_draft || {}) };
  const commercial = { ...(orderDraft.commercial || {}) };
  let lines = Array.isArray(commercial.lines) ? [...commercial.lines] : [];

  if (!lines.length && String(quote.product_text || "").trim()) {
    lines = [
      {
        product_text: String(quote.product_text).trim(),
        quantity: Math.max(1, Number(quote.quantity || 0) || 1),
        product_variant_id: quote.odoo_product_id || null,
        unit_cop: quote.unit_cop || null,
        confidence: quote.match_confidence || null,
        category: /uniforme/i.test(quote.product_text) ? "uniforme" : null,
        source: "quote_seed",
      },
    ];
  }
  commercial.lines = lines;
  orderDraft.commercial = commercial;

  const handoff = { ...(vars.handoff || {}) };
  if (!handoff.context_packet || typeof handoff.context_packet !== "object") {
    handoff.context_packet = {
      product_text: quote.product_text || null,
      quantity: quote.quantity || null,
      customer_display_name: quote.customer_display_name || null,
      customer_wa_id: quote.customer_wa_id || null,
      unit_cop: quote.unit_cop || null,
      total_cop: quote.total_cop || null,
      summary_es: [
        quote.customer_display_name || "Cliente",
        quote.product_text || "producto",
        quote.quantity ? `${quote.quantity} u.` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  if (!handoff.reason) {
    handoff.reason = "inbox_ingreso";
  }

  const staff = { ...(vars.staff || {}) };
  staff.upload_source = "inbox_silent";
  staff.inbox_prepared_at = now;
  // confirmation_fingerprint: el agente lo setea al CONFIRMO; no forzar aquí

  return new Response(
    JSON.stringify({
      ok: true,
      message: "Inbox upload preparado (silent).",
      vars: {
        quote,
        order_draft: orderDraft,
        handoff,
        staff,
        service: {
          last_call_name: "prepare_inbox_upload",
          last_call_status: "ready",
          last_call_at: now,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
