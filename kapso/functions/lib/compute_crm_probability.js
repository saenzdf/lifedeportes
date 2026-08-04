/**
 * Módulo de evaluación de Probabilidad CRM (%) para Odoo Lead/Opportunity.
 *
 * Clasifica la probabilidad de éxito (0 - 100%) según el estado del diálogo,
 * la claridad del pedido y las señales de intención de compra del cliente.
 */

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extractLastCustomerTexts(vars = {}, body = {}) {
  const texts = [];
  if (vars?.last_user_input) texts.push(String(vars.last_user_input));
  if (vars?.staff?.last_inbound_text) texts.push(String(vars.staff.last_inbound_text));
  if (body?.input?.text) texts.push(String(body.input.text));

  const msgs = body?.whatsapp_context?.messages || [];
  for (const m of [...msgs].reverse().slice(0, 10)) {
    if (m?.direction === "inbound") {
      const t = typeof m.text === "string" ? m.text : m.text?.body || m.kapso?.content || "";
      if (t) texts.push(String(t));
    }
  }
  return texts.join("\n").toLowerCase();
}

function computeCrmProbability(vars = {}, body = {}) {
  const combinedText = extractLastCustomerTexts(vars, body);
  const quote = vars?.quote || {};
  const orderDraft = vars?.order_draft || {};
  const commercialLines = orderDraft.commercial?.lines || quote.lines || [];
  const quantity = Number(quote.quantity || orderDraft.commercial?.quantity || 0);

  // 1. Cierre inminente / intención de pago (95% - 100%)
  const isPaymentIntent =
    /\b(d[oó]nde\s+pago|d[aá]tos?\s+de\s+pago|n[uú]mero\s+de\s+cuenta|nequi|bancolombia|hacer\s+el\s+abono|para\s+consignar|c[oó]mo\s+cierro|d[oó]nde\s+consigno|pagar|link\s+de\s+pago|cu[eé]nta\s+bancaria)\b/i.test(
      combinedText
    );

  const isStaffConfirmed =
    quote.formal_quote_requested === true ||
    quote.status === "presupuesto_draft" ||
    orderDraft.status === "confirmed";

  if (isPaymentIntent) return 98;
  if (isStaffConfirmed && quantity >= 6) return 95;

  // 2. Alta Intención (75% - 85%)
  const isHighIntentText =
    /\b(me\s+parece\s+bien|listo|quiero\s+formalizar|hacer\s+el\s+pedido|hag[aá]moslo|estoy\s+seguro|confirmo\s+el\s+pedido|aprobado|empecemos)\b/i.test(
      combinedText
    );

  const hasProductAndQty = quantity >= 6 && (quote.product_text || commercialLines.length > 0);

  if (isHighIntentText && hasProductAndQty) return 85;
  if (hasProductAndQty && (quote.formal_quote_requested || isHighIntentText)) return 80;
  if (hasProductAndQty) return 75;

  // 3. Intención Media / En Evaluación (40% - 50%)
  const isEvaluatingText =
    /\b(lo\b.*\bpensar|preguntar\b.*\bequipo|preguntar\b.*\bgrupo|esperando\b.*\bconfirmaci[oó]n|ma[nñ]ana\b.*\baviso|consultando|voy\s+a\s+ver|les\s+aviso|d[eé]jame\s+revisar)\b/i.test(
      combinedText
    );

  if (isEvaluatingText) return 50;

  // 4. Intención Inicial / Cotizando (30% - 40%)
  if (quantity > 0 || quote.product_text) return 40;

  // 5. Consulta general / exploratoria (20%)
  return 20;
}

module.exports = {
  computeCrmProbability,
};
