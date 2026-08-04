/**
 * Gate: ¿crear oportunidad CRM desde interés WhatsApp?
 * Sí: aceptación / abono / pedido con payload útil.
 * No: "voy a pensar", "consulto con el equipo", soft close.
 */

function compact(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

const THINKING_RE =
  /\b(voy\s+a\s+(pensar|consultarlo|pasar\s+el\s+dato)|lo\s+voy\s+a\s+pensar|consulto\s+con(\s+el)?\s+equipo|mañana\s+te\s+(digo|doy\s+raz[oó]n)|lo\s+consulto|d[eé]jame\s+consultar|lo\s+pienso|ya\s+les\s+confirmo)\b/i;

const SOFT_CLOSE_RE =
  /\b(si\s+m[aá]s\s+adelante|cuando\s+(quiera|gust[eé]|decidan)|quedo\s+atento\s+si\s+m[aá]s\s+adelante|no\s+gracias)\b/i;

/** Aceptación / abono / cierre comercial (Emmanuelle: Dale + número para abono). */
const ACCEPTANCE_RE =
  /\b(dale|listo(\s+gracias)?|deseo\s+hacer\s+el\s+pedido|quiero\s+(hacer\s+)?el\s+pedido|s[ií](,|\s)+(por\s+favor|adelante|confirmo)|confirmamos|n[uú]mero\s+para\s+(el\s+)?abono|c[oó]mo\s+(pago|abono)|te\s+mando\s+el|enviar([ée]|e)?\s+el\s+50|hagamos|vamos\s+(con|a\s+pedir)|adelante|interes_confirmado|esperando_abono)\b/i;

/**
 * @param {object} opts
 * @param {object} opts.quote
 * @param {string} [opts.note]
 * @param {string} [opts.lastCustomerText]
 */
export function shouldSeedCrmOpportunity(opts = {}) {
  const quote = opts.quote && typeof opts.quote === "object" ? opts.quote : {};
  const note = compact(opts.note);
  const last = compact(opts.lastCustomerText);
  const blob = `${note} ${last} ${compact(quote.notes)} ${compact(quote.status)}`.toLowerCase();

  if (THINKING_RE.test(blob) || SOFT_CLOSE_RE.test(blob)) {
    return {
      ok: false,
      reason: "thinking_or_consulting",
      message_es: "Cliente pensará/consultará — no crear oportunidad aún.",
    };
  }

  const qty = Number(quote.quantity);
  const hasQty = Number.isFinite(qty) && qty >= 6;
  const hasProduct = Boolean(compact(quote.product_text));
  const hasLines =
    Array.isArray(quote.lines) &&
    quote.lines.some((l) => compact(l?.product_text) || Number(l?.quantity) > 0);
  const hasList =
    /lista|nombres|tallas|formato\s*life/i.test(compact(quote.notes)) ||
    Boolean(quote.detail);
  const hasPrice = Number(quote.unit_cop) > 0 || Number(quote.total_cop) > 0;
  const hasMedia = Array.isArray(quote.media_refs) && quote.media_refs.length > 0;
  const acceptance = ACCEPTANCE_RE.test(blob);
  const statusInterest = /interes_confirmado|esperando_abono|pedido_confirmado/i.test(
    compact(quote.status)
  );

  const payloadOk =
    (hasProduct && hasQty) ||
    hasLines ||
    hasList ||
    (hasProduct && hasPrice && (hasQty || hasMedia));

  // Aceptación clara + producto/precio/qty parcial (cubre “Dale” + abono con quote previo)
  const softPayloadOk =
    (acceptance || statusInterest) &&
    (hasProduct || hasQty || hasPrice || hasLines || hasList);

  if (!payloadOk && !softPayloadOk) {
    return {
      ok: false,
      reason: "insufficient_payload",
      message_es: "Falta producto+cantidad (≥6) o lista/cotización suficiente.",
    };
  }

  return {
    ok: true,
    reason: acceptance || statusInterest ? "acceptance_with_payload" : "interest_with_payload",
  };
}

export function buildOrderSummaryFromQuote(quote = {}) {
  const q = quote || {};
  const product = compact(q.product_text) || "pedido";
  const qty = Number(q.quantity);
  if (Number.isFinite(qty) && qty > 0) return `${qty} × ${product}`.slice(0, 120);
  if (Array.isArray(q.lines) && q.lines[0]) {
    const l = q.lines[0];
    const lq = Number(l.quantity);
    const lp = compact(l.product_text) || product;
    if (Number.isFinite(lq) && lq > 0) return `${lq} × ${lp}`.slice(0, 120);
  }
  return product.slice(0, 120);
}

export { compact, digits, THINKING_RE, SOFT_CLOSE_RE, ACCEPTANCE_RE };
