/**
 * Primera estimación comercial del pedido staff.
 * Fuentes (prioridad qty): comercial ya resuelto → lista (detail) → conversación → quote.
 * El estimado es provisional hasta que el presupuesto/SO lo refine.
 */

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function conversationBlob(vars = {}) {
  return [
    vars?.intent?.raw_text,
    vars?.intent?.text,
    vars?.last_user_input,
    vars?.last_user_text,
    vars?.staff_lane_reply,
    vars?.staff?.lane_reply,
    vars?.staff?.last_user_text,
    vars?.staff?.last_inbound_text,
    vars?.context?.last_user_text,
    vars?.quote?.notes,
    vars?.quote?.product_text,
  ]
    .map((t) => compact(t))
    .filter(Boolean)
    .join("\n");
}

function detailRows(orderDraft = {}) {
  const detail = orderDraft.detail || {};
  if (Array.isArray(detail.rows) && detail.rows.length) return detail.rows;
  if (Array.isArray(detail.people) && detail.people.length) {
    return detail.people.map((person) => {
      const identity = person.identity || {};
      const primary = (person.components || [])[0] || {};
      return {
        nombre: identity.print_name || identity.display_name || "",
        numero: identity.number || "",
        talla: primary.size || "",
        camiseta: Boolean(primary.camiseta || person.camiseta),
        uniforme: person.uniforme !== false && !primary.camiseta,
        product_text: primary.product_text || person.product_text || "",
        cantidad: Number(primary.quantity || person.quantity || 1) || 1,
      };
    });
  }
  return [];
}

function rowUnitQty(row = {}) {
  return Math.max(1, Number(row.cantidad || row.quantity || row.qty || 1) || 1);
}

function productHintFromRows(rows = []) {
  let camiseta = 0;
  let uniforme = 0;
  const texts = new Map();
  for (const row of rows) {
    const q = rowUnitQty(row);
    const text = compact(row.product_text || row.product_base || "");
    if (text) texts.set(text, (texts.get(text) || 0) + q);
    if (row.camiseta && !row.uniforme) camiseta += q;
    else if (row.uniforme === true || (row.uniforme !== false && !row.camiseta && /uniforme/i.test(text))) {
      uniforme += q;
    } else if (/camiseta/i.test(text)) camiseta += q;
    else if (row.camiseta) camiseta += q;
  }
  let bestText = "";
  let bestN = 0;
  for (const [t, n] of texts) {
    if (n > bestN) {
      bestText = t;
      bestN = n;
    }
  }
  if (bestText) {
    return {
      product_text: bestText,
      category: /uniforme/i.test(bestText)
        ? "uniforme"
        : /camiseta/i.test(bestText)
          ? "camiseta"
          : null,
    };
  }
  if (uniforme >= camiseta && uniforme > 0) {
    return { product_text: "Uniforme de Fútbol", category: "uniforme" };
  }
  if (camiseta > 0) {
    return { product_text: "Camiseta deportiva dry-fit", category: "camiseta" };
  }
  return { product_text: "", category: null };
}

function parseConversationEstimate(blob) {
  const text = compact(blob);
  if (!text) return null;

  const patterns = [
    /(\d{1,4})\s*(?:u(?:nidades?)?|und\.?)?\s*(uniformes?(?:\s+de\s+[A-Za-zÁÉÍÓÚáéíóúñÑ]+)?|camisetas?|conjuntos?|sudaderas?|chaquetas?)/i,
    /(uniformes?(?:\s+de\s+[A-Za-zÁÉÍÓÚáéíóúñÑ]+)?|camisetas?|conjuntos?)\s*(?:de\s+)?(?:f[uú]tbol|futbol|baloncesto|dry[\s-]?fit)?\s*[:=x×]?\s*(\d{1,4})\b/i,
    /(?:estimado|aprox(?:imadamente)?|m[aá]s\s+o\s+menos|unos?|unas?|ser[ií]an?|serian|serán|seran)\s+(\d{1,4})\s*(uniformes?|camisetas?|conjuntos?|u(?:nidades?)?)?/i,
    /pedido\s+de\s+(\d{1,4})\b/i,
    /\b(\d{1,4})\s*u(?:nidades?)?\b/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    let qty = 0;
    let productHint = "";
    if (m[2] && /^\d+$/.test(m[1])) {
      qty = Number(m[1]);
      productHint = compact(m[2]);
    } else if (m[2] && /^\d+$/.test(m[2])) {
      qty = Number(m[2]);
      productHint = compact(m[1]);
    } else {
      qty = Number(m[1]);
      productHint = compact(m[2] || "");
    }
    if (!(qty >= 1 && qty <= 5000)) continue;

    let product_text = "";
    let category = null;
    if (/uniforme/i.test(productHint) || /uniforme/i.test(text)) {
      product_text = /baloncesto/i.test(text)
        ? "Uniforme de baloncesto"
        : "Uniforme de Fútbol";
      category = "uniforme";
    } else if (/camiseta/i.test(productHint) || /camiseta/i.test(text)) {
      product_text = "Camiseta deportiva dry-fit";
      category = "camiseta";
    } else if (/chaqueta/i.test(productHint)) {
      product_text = "Chaqueta Rompevientos";
      category = "otros";
    } else if (/sudadera/i.test(productHint)) {
      product_text = "Sudadera";
      category = "otros";
    }

    return {
      quantity: qty,
      product_text,
      category,
      source: "conversation",
      confidence: product_text ? "medium" : "low",
      provisional: true,
    };
  }
  return null;
}

function commercialSnapshot(vars = {}) {
  const draft = vars.order_draft || {};
  const quote = vars.quote || {};
  const lines = [];
  if (Array.isArray(draft.commercial?.resolved_lines)) {
    for (const line of draft.commercial.resolved_lines) lines.push(line);
  }
  if (!lines.length && Array.isArray(draft.commercial?.lines)) {
    for (const line of draft.commercial.lines) lines.push(line);
  }
  const qty = lines.reduce(
    (sum, line) => sum + Math.max(0, Number(line.quantity || line.product_uom_qty || 0) || 0),
    0
  );
  const first = lines[0] || null;
  const unit = Number(first?.unit_cop || first?.unit_price || quote.unit_cop || 0) || null;
  return {
    lines,
    quantity: qty || Math.max(0, Number(quote.quantity || 0) || 0),
    product_text: compact(
      first?.product_text || first?.product_base || first?.name || quote.product_text || ""
    ),
    category: compact(first?.category || "").toLowerCase() || null,
    unit_cop: unit,
    source: lines.length ? "commercial" : quote.quantity ? "quote" : null,
  };
}

/**
 * @returns {{
 *   quantity: number,
 *   product_text: string,
 *   category: string|null,
 *   source: string,
 *   provisional: boolean,
 *   confidence: string,
 *   unit_cop: number|null,
 *   amount_estimated: number|null,
 *   detail_quantity: number,
 *   conversation_quantity: number|null,
 * } | null}
 */
export function inferOrderEstimate(vars = {}) {
  const draft = vars.order_draft || {};
  const quote = vars.quote || {};
  const rows = detailRows(draft);
  const detailQty = rows.reduce((sum, row) => sum + rowUnitQty(row), 0);
  const detailHint = productHintFromRows(rows);
  const conv = parseConversationEstimate(conversationBlob(vars));
  const commercial = commercialSnapshot(vars);

  let quantity = 0;
  let product_text = "";
  let category = null;
  let source = "";
  let confidence = "low";
  let provisional = true;
  let unit_cop = commercial.unit_cop;

  // Qty: prefer stronger evidence; bump commercial when lista/conversación es mayor.
  if (detailQty > 0 && detailQty >= (commercial.quantity || 0)) {
    quantity = detailQty;
    source = commercial.quantity > 0 && commercial.quantity < detailQty
      ? "list_detail_bump"
      : "list_detail";
    confidence = "high";
    provisional = true;
  } else if (commercial.quantity > 0) {
    quantity = commercial.quantity;
    source = commercial.source || "commercial";
    confidence = source === "commercial" ? "high" : "medium";
    provisional = source !== "commercial";
  } else if (conv?.quantity) {
    quantity = conv.quantity;
    source = "conversation";
    confidence = conv.confidence || "medium";
    provisional = true;
  } else if (Number(quote.quantity || 0) > 0) {
    quantity = Number(quote.quantity);
    source = "quote";
    confidence = "medium";
    provisional = true;
  }

  if (!quantity) return null;

  // Si conversación aporta qty mayor que comercial/quote sin lista, úsala.
  if (!detailQty && conv?.quantity && conv.quantity > quantity) {
    quantity = conv.quantity;
    source = "conversation";
    confidence = conv.confidence || "medium";
    provisional = true;
  }

  product_text =
    commercial.product_text ||
    detailHint.product_text ||
    conv?.product_text ||
    compact(quote.product_text) ||
    "";
  category =
    commercial.category ||
    detailHint.category ||
    conv?.category ||
    (/uniforme/i.test(product_text) ? "uniforme" : /camiseta/i.test(product_text) ? "camiseta" : null);

  if (!product_text) {
    // Último recurso solo si hay qty clara de conversación/lista sin tipar producto.
    product_text = /camiseta/i.test(conversationBlob(vars))
      ? "Camiseta deportiva dry-fit"
      : "Uniforme de Fútbol";
    category = /camiseta/i.test(product_text) ? "camiseta" : "uniforme";
    confidence = "low";
  }

  const amount =
    unit_cop && quantity ? Math.round(Number(unit_cop) * Number(quantity)) : null;

  return {
    quantity,
    product_text,
    category,
    source,
    provisional,
    confidence,
    unit_cop,
    amount_estimated: amount,
    detail_quantity: detailQty,
    conversation_quantity: conv?.quantity || null,
    schema_version: "life_order_estimate_v1",
  };
}

/**
 * Aplica el estimado a líneas resueltas (crea o sube qty de una sola línea).
 */
export function applyEstimateToResolvedLines(vars = {}, resolvedLines = [], buildResolvedLineFn) {
  const build =
    buildResolvedLineFn ||
    ((input, index) => ({
      line_id: `rl_est_${index + 1}`,
      product_text: compact(input.product_text || ""),
      product_base: compact(input.product_base || input.product_text || ""),
      product_tmpl_id: null,
      product_variant_id: Number(input.product_variant_id || 0) || null,
      attributes: input.attributes || {},
      quantity: Math.max(0, Number(input.quantity || 0)),
      unit_cop: Number(input.unit_cop || 0) || null,
      confidence: compact(input.confidence || "medium"),
      category: compact(input.category || "").toLowerCase() || null,
      comments: "",
    }));

  const estimate = inferOrderEstimate(vars);
  const resolved = Array.isArray(resolvedLines) ? [...resolvedLines] : [];
  if (!estimate) {
    return { resolved_lines: resolved, estimate: null, changed: false };
  }

  if (!resolved.length) {
    return {
      resolved_lines: [
        build(
          {
            product_text: estimate.product_text,
            quantity: estimate.quantity,
            category: estimate.category,
            unit_cop: estimate.unit_cop,
            confidence: estimate.confidence,
          },
          0
        ),
      ],
      estimate,
      changed: true,
    };
  }

  if (resolved.length === 1 && estimate.quantity > Number(resolved[0].quantity || 0)) {
    const bumped = {
      ...resolved[0],
      quantity: estimate.quantity,
      confidence:
        String(resolved[0].confidence || "") === "high"
          ? "high"
          : estimate.confidence || resolved[0].confidence || "medium",
    };
    if (!compact(bumped.product_text) && estimate.product_text) {
      bumped.product_text = estimate.product_text;
      bumped.product_base = estimate.product_text;
    }
    if (!bumped.category && estimate.category) bumped.category = estimate.category;
    return {
      resolved_lines: [bumped],
      estimate: { ...estimate, provisional: true },
      changed: true,
    };
  }

  return { resolved_lines: resolved, estimate, changed: false };
}

export function parseConversationEstimateForTests(blob) {
  return parseConversationEstimate(blob);
}
