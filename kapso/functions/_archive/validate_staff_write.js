// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: validate-staff-write  id: 4061a9e7-fce9-4301-81e7-bd2e47da3da4
// ultimo deploy: 2026-07-30T16:18:10-04:00  status: deployed
// motivo: validación de subida legacy CONFIRMO SUBIR (camino retirado)
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

/**
 * validate_staff_write — gate de confianza para carril staff.
 * ready → ok | needs_confirmation → needs_confirmation | blocked → blocked
 *
 * write_mode opportunity_only | sale_order (CRM-first jul 2026).
 * NOTE: evaluateStaffWriteReadiness alineada con lib/staff_order_contract.js.
 *
 * Estimado: si faltan líneas o la qty comercial es baja, se infiere de la lista
 * (detail) o de la conversación → payload provisional que el SO puede refinar.
 */

function conversationBlobForEstimate(vars = {}) {
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

function detailRowsForEstimate(orderDraft = {}) {
  const detail = orderDraft.detail || {};
  if (Array.isArray(detail.rows) && detail.rows.length) return detail.rows;
  if (Array.isArray(detail.people) && detail.people.length) {
    return detail.people.map((person) => {
      const identity = person.identity || {};
      const primary = (person.components || [])[0] || {};
      return {
        nombre: identity.print_name || identity.display_name || "",
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
    else if (row.uniforme === true) uniforme += q;
    else if (/camiseta/i.test(text)) camiseta += q;
    else if (/uniforme/i.test(text)) uniforme += q;
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
    /(\d{1,4})\s*u(?:nidades?)?\b/i,
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

function inferOrderEstimate(vars = {}) {
  const draft = vars.order_draft || {};
  const quote = vars.quote || {};
  const rows = detailRowsForEstimate(draft);
  const detailQty = rows.reduce((sum, row) => sum + rowUnitQty(row), 0);
  const detailHint = productHintFromRows(rows);
  const conv = parseConversationEstimate(conversationBlobForEstimate(vars));
  const resolvedSrc = Array.isArray(draft.commercial?.resolved_lines)
    ? draft.commercial.resolved_lines
    : Array.isArray(draft.commercial?.lines)
      ? draft.commercial.lines
      : [];
  const commercialQty = resolvedSrc.reduce(
    (sum, line) => sum + Math.max(0, Number(line.quantity || 0) || 0),
    0
  );
  const first = resolvedSrc[0] || null;
  const commercialText = compact(
    first?.product_text || first?.product_base || first?.name || quote.product_text || ""
  );
  const unit_cop =
    Number(first?.unit_cop || first?.unit_price || quote.unit_cop || 0) || null;

  let quantity = 0;
  let source = "";
  let confidence = "low";
  let provisional = true;

  if (detailQty > 0 && detailQty >= commercialQty) {
    quantity = detailQty;
    source = commercialQty > 0 && commercialQty < detailQty ? "list_detail_bump" : "list_detail";
    confidence = "high";
  } else if (commercialQty > 0) {
    quantity = commercialQty;
    source = "commercial";
    confidence = "high";
    provisional = false;
  } else if (conv?.quantity) {
    quantity = conv.quantity;
    source = "conversation";
    confidence = conv.confidence || "medium";
  } else if (Number(quote.quantity || 0) > 0) {
    quantity = Number(quote.quantity);
    source = "quote";
    confidence = "medium";
  }

  if (!detailQty && conv?.quantity && conv.quantity > quantity) {
    quantity = conv.quantity;
    source = "conversation";
    confidence = conv.confidence || "medium";
    provisional = true;
  }

  if (!quantity) return null;

  let product_text =
    commercialText ||
    detailHint.product_text ||
    conv?.product_text ||
    compact(quote.product_text) ||
    "";
  let category =
    compact(first?.category || "").toLowerCase() ||
    detailHint.category ||
    conv?.category ||
    (/uniforme/i.test(product_text) ? "uniforme" : /camiseta/i.test(product_text) ? "camiseta" : null);

  if (!product_text) {
    const blob = conversationBlobForEstimate(vars);
    product_text = /camiseta/i.test(blob)
      ? "Camiseta deportiva dry-fit"
      : "Uniforme de Fútbol";
    category = /camiseta/i.test(product_text) ? "camiseta" : "uniforme";
    confidence = "low";
  }

  return {
    quantity,
    product_text,
    category,
    source,
    provisional,
    confidence,
    unit_cop,
    amount_estimated:
      unit_cop && quantity ? Math.round(Number(unit_cop) * Number(quantity)) : null,
    detail_quantity: detailQty,
    conversation_quantity: conv?.quantity || null,
    schema_version: "life_order_estimate_v1",
  };
}

function applyEstimateToResolved(vars, resolved) {
  const estimate = inferOrderEstimate(vars);
  const lines = Array.isArray(resolved) ? [...resolved] : [];
  if (!estimate) return { resolved_lines: lines, estimate: null, changed: false };

  if (!lines.length) {
    return {
      resolved_lines: [
        buildResolvedLine(
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

  if (lines.length === 1 && estimate.quantity > Number(lines[0].quantity || 0)) {
    const bumped = {
      ...lines[0],
      quantity: estimate.quantity,
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

  return { resolved_lines: lines, estimate, changed: false };
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const inboxSilent = vars?.staff?.upload_source === "inbox_silent";
  if (vars?.user?.role !== "staff" && !inboxSilent) {
    return blocked("Solo staff autorizado puede registrar pedidos.", now);
  }

  const writeMode = resolveWriteMode(vars);
  const readiness =
    writeMode === "opportunity_only"
      ? evaluateOpportunityReadiness(vars)
      : evaluateStaffWriteReadiness(vars);
  const orderDraft = vars.order_draft || {};

  if (readiness.status === "blocked") {
    return blocked(readiness.message || "Pedido incompleto.", now, readiness);
  }

  if (readiness.status === "needs_staff_confirmation") {
    return needsConfirmation(readiness, now, orderDraft);
  }

  const cross = readiness.cross_check;
  const needsReconcile = cross && !cross.ok;
  return ok(now, readiness, orderDraft, needsReconcile, writeMode);
}

function resolveWriteMode(vars = {}) {
  // Presupuesto intent gana sobre mode CRM stale (opportunity_only en order_draft.write).
  if (hasHazPresupuesto(vars) || hasConfirmoPresupuesto(vars)) return "sale_order";
  const staffMode = String(vars?.staff?.write_mode || "")
    .trim()
    .toLowerCase();
  if (staffMode === "sale_order") return "sale_order";
  if (staffMode === "opportunity_only") return "opportunity_only";
  const draftMode = String(vars?.order_draft?.write?.mode || "")
    .trim()
    .toLowerCase();
  if (draftMode === "sale_order") return "sale_order";
  if (vars?.user?.role === "staff") return "opportunity_only";
  return "sale_order";
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Quita prefijo Odoo «Oportunidad de X» → X */
function stripOppPrefix(name) {
  return compact(name).replace(/^oportunidad\s+de\s+/i, "").trim();
}

/**
 * Nombre del pedido/cliente para CRM.
 * Prioridad: quote → draft → sesión → opp CRM ya ligada → partner.
 * Si ya hay lead.id / crm.opportunity_id, el nombre de esa opp basta (no bloquear).
 */
function resolveStaffCustomerDisplayName(vars = {}) {
  const quote = vars.quote || {};
  const draft = vars.order_draft || {};
  const session = vars.order_session || {};
  const lead = vars.lead || {};
  const crm = vars.crm || {};

  const candidates = [
    quote.customer_display_name,
    quote.order_or_team_name_for_billing,
    vars["quote.customer_display_name"],
    vars["quote.order_or_team_name_for_billing"],
    draft.customer_display_name,
    session.display_name,
    stripOppPrefix(lead.name),
    stripOppPrefix(crm.opportunity_name),
    crm.partner_name,
  ];
  for (const c of candidates) {
    const n = compact(c);
    if (n && !/^cliente life$/i.test(n) && !/^cliente whatsapp/i.test(n)) return n;
  }
  return "";
}

function hasBoundCrmOpportunity(vars = {}) {
  return Boolean(
    Number(vars?.lead?.id || 0) ||
      Number(vars?.crm?.opportunity_id || 0) ||
      Number(vars?.order_draft?.write?.odoo_lead_id || 0)
  );
}

function evaluateOpportunityReadiness(vars = {}) {
  const orderDraft = vars.order_draft || {};
  const quote = vars.quote || {};
  let customer = resolveStaffCustomerDisplayName(vars);
  const boundOpp = hasBoundCrmOpportunity(vars);

  // Opp ya creada/ligada: no bloquear por nombre — usar el de la opp si hace falta.
  if (!customer && boundOpp) {
    customer =
      stripOppPrefix(vars.lead?.name) ||
      stripOppPrefix(vars.crm?.opportunity_name) ||
      "Pedido staff";
  }

  if (!customer || /^cliente life$/i.test(customer)) {
    return {
      status: "blocked",
      code: "no_customer",
      message: "Falta el nombre del cliente para crear la oportunidad CRM.",
      fingerprint: null,
      resolved_lines: [],
      cross_check: null,
      write_mode: "opportunity_only",
    };
  }

  let resolved = Array.isArray(orderDraft.commercial?.resolved_lines)
    ? orderDraft.commercial.resolved_lines.map((l, i) => buildResolvedLine(l, i))
    : [];
  if (!resolved.length && Array.isArray(orderDraft.commercial?.lines)) {
    resolved = orderDraft.commercial.lines.map((l, i) => buildResolvedLine(l, i));
  }
  if (!resolved.length && String(quote.product_text || "").trim()) {
    resolved = [
      buildResolvedLine(
        {
          product_text: quote.product_text,
          quantity: quote.quantity,
          product_variant_id: quote.odoo_product_id,
          confidence: quote.match_confidence || "medium",
          attributes: quote.product_attributes,
          category: /uniforme/i.test(quote.product_text) ? "uniforme" : null,
        },
        0
      ),
    ];
  }

  // Inferir estimado desde lista o conversación si faltan líneas / qty baja.
  const applied = applyEstimateToResolved(vars, resolved);
  resolved = applied.resolved_lines;
  const estimate = applied.estimate;

  if (!resolved.length) {
    return {
      status: "blocked",
      code: "no_lines",
      message:
        "Para la oportunidad hace falta un estimado (ej. 20 uniformes de futbol), o envía la lista/Excel para inferirlo.",
      fingerprint: null,
      resolved_lines: [],
      cross_check: null,
      write_mode: "opportunity_only",
      estimate: null,
    };
  }

  const fingerprint = stableFingerprint({
    mode: "opportunity_only",
    customer,
    resolved_lines: resolved.map((l) => ({
      product_text: l.product_text,
      quantity: l.quantity,
    })),
  });

  return {
    status: "ready",
    code: "opportunity_ready",
    message: null,
    fingerprint,
    resolved_lines: resolved,
    cross_check: null,
    write_mode: "opportunity_only",
    customer_display_name: customer,
    estimate,
  };
}

/** Excepción mín. 6: solo diseño / 1 uniforme de muestra (explícito). */
function isDesignExplorationOrder(vars = {}, resolvedLines = []) {
  const quote = vars.quote || {};
  const draft = vars.order_draft || {};
  const kind = String(
    quote.order_kind || draft.commercial?.mode || draft.mode || quote.status || ""
  )
    .trim()
    .toLowerCase();
  if (
    /dise[nñ]o[_ ]?exploraci|exploraci[oó]n[_ ]?dise[nñ]o|solo[_ ]?dise[nñ]o|design[_ ]?exploration|muestra[_ ]?dise[nñ]o|esperando_aprobaci[oó]n_dise[nñ]o/.test(
      kind
    )
  ) {
    return true;
  }
  const blob = [
    quote.notes,
    quote.status,
    draft.notes,
    vars.staff?.last_inbound_text,
    vars.staff_lane_reply,
    vars.intent?.raw_text,
    vars.last_user_input,
  ]
    .map((t) => String(t || "").trim())
    .join("\n");
  if (
    /\b(solo\s+dise[nñ]o|explor(ar|aci[oó]n)\s+(el\s+)?dise[nñ]o|muestra\s+(de\s+)?dise[nñ]o|1\s+uniforme\s+(de\s+)?(muestra|dise[nñ]o)|uniforme\s+de\s+muestra)\b/i.test(
      blob
    )
  ) {
    return true;
  }
  const lines = Array.isArray(resolvedLines) ? resolvedLines : [];
  const isDesignLine = (l) => {
    const role = String(l.commercial_role || "").toLowerCase();
    const text = String(l.product_text || l.product_base || l.name || "");
    return role === "design" || /^dise[nñ]o\b/i.test(text) || /dise[nñ]o especial/i.test(text);
  };
  const commercial = lines.filter((l) => !isDesignLine(l) && Number(l.quantity || 0) > 0);
  return commercial.length === 0 && lines.some(isDesignLine);
}

function evaluateStaffWriteReadiness(vars = {}) {
  const orderDraft = vars.order_draft || {};
  const quote = vars.quote || {};
  const staff = vars.staff || {};

  let resolved = Array.isArray(orderDraft.commercial?.resolved_lines)
    ? orderDraft.commercial.resolved_lines.map((l, i) => buildResolvedLine(l, i))
    : [];

  if (!resolved.length && Array.isArray(orderDraft.commercial?.lines)) {
    resolved = orderDraft.commercial.lines.map((l, i) => buildResolvedLine(l, i));
  }

  if (!resolved.length && String(quote.product_text || "").trim()) {
    resolved = [
      buildResolvedLine(
        {
          product_text: quote.product_text,
          quantity: quote.quantity,
          product_variant_id: quote.odoo_product_id,
          confidence: quote.match_confidence || "",
          attributes: quote.product_attributes,
          category: /uniforme/i.test(quote.product_text) ? "uniforme" : null,
        },
        0
      ),
    ];
  }

  const applied = applyEstimateToResolved(vars, resolved);
  resolved = applied.resolved_lines;
  const estimate = applied.estimate;

  if (!resolved.length) {
    return {
      status: "blocked",
      code: "no_lines",
      message:
        "Pedido incompleto: sin lineas comerciales. Envía estimado (ej. 20 camisetas) o la lista/Excel.",
      fingerprint: null,
      resolved_lines: [],
      cross_check: null,
      estimate: null,
    };
  }

  const baseUniformQty = resolved
    .filter((l) => l.category === "uniforme" || /uniforme/i.test(l.product_text || ""))
    .reduce((s, l) => s + Number(l.quantity || 0), 0);
  const designExploration = isDesignExplorationOrder(vars, resolved);
  if (baseUniformQty > 0 && baseUniformQty < 6 && !designExploration) {
    return {
      status: "blocked",
      code: "min_uniform",
      message: "Pedido incompleto: minimo 6 uniformes del mismo diseno.",
      fingerprint: null,
      resolved_lines: resolved,
      cross_check: null,
    };
  }

  if (baseUniformQty === 0 && !designExploration) {
    const below = resolved.find((l) => Number(l.quantity || 0) < 6);
    if (below) {
      return {
        status: "blocked",
        code: "min_standalone",
        message: `Pedido minimo 6 unidades de ${below.product_base || below.product_text}.`,
        fingerprint: null,
        resolved_lines: resolved,
        cross_check: null,
      };
    }
  }

  const fingerprint = stableFingerprint({
    resolved_lines: resolved,
    detail: orderDraft.detail,
    partner_key:
      quote.customer_wa_id ||
      quote.customer_display_name ||
      quote.order_or_team_name_for_billing ||
      "",
  });

  const unresolved = resolved.filter((l) => !Number(l.product_variant_id || 0));
  const ambiguous = resolved.filter((l) =>
    ["low", "none", "medium"].includes(String(l.confidence || ""))
  );
  const parseStatus = String(orderDraft.detail?.parse_status || "");
  const hasBlockers = Boolean(orderDraft.blockers?.length);
  const hasDetailWarnings = Boolean(orderDraft.detail?.warnings?.length);
  const needsReviewStatus = parseStatus === "needs_review";
  // "partial" solo pide CONFIRMO si además hay ambigüedad comercial o warnings.
  // Listas FORMATO LIFE suelen marcar partial y aun así resolver high+variant.
  const hasWarnings = hasBlockers || hasDetailWarnings || needsReviewStatus;

  const confirmoText = hasHazPresupuesto(vars) || hasConfirmoPresupuesto(vars) || hasConfirmoSubir(vars);
  const confirmed =
    (String(staff.confirmation_fingerprint || "").trim() &&
      String(staff.confirmation_fingerprint).trim() === fingerprint) ||
    (confirmoText && Boolean(fingerprint));

  // Presupuesto requiere intent explícito (salvo fingerprint ya seteado).
  if (!confirmed && !hasHazPresupuesto(vars) && !hasConfirmoPresupuesto(vars) && !hasConfirmoSubir(vars)) {
    const peopleCount = Array.isArray(orderDraft.detail?.rows)
      ? orderDraft.detail.rows.length
      : Array.isArray(orderDraft.detail?.people)
        ? orderDraft.detail.people.length
        : 0;
    const hasRefs = Boolean(
      orderDraft.attachments?.length ||
        orderDraft.detail?.attachments?.length ||
        orderDraft.evidence?.length ||
        vars?.staff?.has_order_attachments
    );
    if (peopleCount < 1 || !hasRefs) {
      return {
        status: "blocked",
        code: "presupuesto_incomplete",
        message:
          "Para presupuesto hace falta lista completa y referencias/adjuntos. Sigue refinando la oportunidad CRM; cuando esté listo escribe HAZ PRESUPUESTO.",
        fingerprint,
        resolved_lines: resolved,
        cross_check: null,
        write_mode: "sale_order",
        estimate,
      };
    }
    return {
      status: "needs_staff_confirmation",
      code: "needs_presupuesto_intent",
      message:
        "Lista y referencias listas. Responde HAZ PRESUPUESTO para crear el borrador SO ligado a la oportunidad.",
      fingerprint,
      resolved_lines: resolved,
      cross_check: null,
      write_mode: "sale_order",
      estimate,
    };
  }

  // Solo pedir confirmación extra si hubo match ambiguo, warnings, o variantes parciales
  const compiledAmbiguity =
    ambiguous.length > 0 ||
    (unresolved.length > 0 &&
      resolved.some((l) => String(l.confidence || "") === "high"));

  const allResolvedHigh =
    resolved.length > 0 &&
    unresolved.length === 0 &&
    resolved.every((l) => String(l.confidence || "") === "high");

  if ((compiledAmbiguity || hasWarnings || (parseStatus === "partial" && !allResolvedHigh)) && !confirmed) {
    const summary = resolved
      .map(
        (l) =>
          `• ${l.product_base || l.product_text} × ${l.quantity}` +
          (l.product_variant_id ? "" : " (sin variante)") +
          (l.confidence && l.confidence !== "high" ? ` [${l.confidence}]` : "")
      )
      .join("\n");
    return {
      status: "needs_staff_confirmation",
      code: "needs_confirmation",
      message: `Hay ambigüedad u organización parcial de los datos. Resumen:\n${summary}\nResponde HAZ PRESUPUESTO (o CONFIRMO PRESUPUESTO) para crear el borrador.`,
      fingerprint,
      resolved_lines: resolved,
      cross_check: null,
      write_mode: "sale_order",
    };
  }

  if (confirmed && unresolved.length) {
    return {
      status: "blocked",
      code: "unresolved_variant",
      message: `Falta variante Odoo exacta para: ${unresolved.map((l) => l.product_text).join(", ")}`,
      fingerprint,
      resolved_lines: resolved,
      cross_check: null,
    };
  }
  const cross = crossCheckPeopleVsLines({
    detail: orderDraft.detail,
    resolvedLines: resolved,
  });

  return {
    status: "ready",
    code: "pedido_ready",
    message: null,
    fingerprint,
    resolved_lines: resolved,
    cross_check: cross,
    estimate,
  };
}

/** Confirmación natural de staff para escribir Odoo (CRM/SO). */
function hasStaffWriteConfirmation(vars = {}) {
  return staffReplyMatches(
    vars,
    /\bCONFIRMO\s+SUBIR\b|\bCONFIRMO\s+PRESUPUESTO\b|\b(HAZ|HAS|HACE|CREA|CREAR)(?:\s+\w+){0,3}\s+PRESUPUESTO\b|\bconfirmo\b[\s,]*y?\s*(?:sube|subir|crea|crear|haz|has)\b|\bconfirmo\b[\s,]+(?:los?\s+)?\d{1,4}\s*(?:uniformes?|camisetas?|unidades?)|\bsube\s+(?:los?\s+)?(?:archivos?|adjuntos?|pedido|lista|\d+)/i
  );
}

/** CONFIRMO SUBIR — legacy; preferir HAZ PRESUPUESTO / confirmo y sube. */
function hasConfirmoSubir(vars = {}) {
  return hasStaffWriteConfirmation(vars);
}

function hasHazPresupuesto(vars = {}) {
  // Acepta "HAZ PRESUPUESTO", "has el presupuesto", "crear el presupuesto borrador".
  return staffReplyMatches(
    vars,
    /\b(HAZ|HAS|HACE|CREA|CREAR)(?:\s+\w+){0,3}\s+PRESUPUESTO\b/i
  );
}

function hasConfirmoPresupuesto(vars = {}) {
  return staffReplyMatches(vars, /\bCONFIRMO\s+PRESUPUESTO\b/i);
}

function staffReplyMatches(vars = {}, re) {
  const staff = vars.staff || {};
  const context = vars.context || {};
  const intent = vars.intent || {};
  const chunks = [
    vars.staff_lane_reply,
    staff.lane_reply,
    staff.last_user_text,
    staff.last_inbound_text,
    context.last_user_text,
    context.last_inbound_text,
    intent.raw_text,
    intent.text,
    vars.last_user_input,
    vars.last_user_text,
    vars.last_inbound_text,
    vars.message,
    vars.body,
  ];
  return chunks.some((t) => re.test(String(t || "")));
}

function splitProductDisplayName(displayName) {
  const raw = compact(displayName);
  if (!raw) return { product_base: "", embedded_attrs: {} };
  const m = raw.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (!m) return { product_base: raw, embedded_attrs: {} };
  return { product_base: compact(m[1]), embedded_attrs: {} };
}

function buildResolvedLine(input = {}, index = 0) {
  const productText = compact(input.product_text || input.name || "");
  const split = splitProductDisplayName(input.display_name || productText);
  const qty = Math.max(0, Number(input.quantity || input.product_uom_qty || 0));
  const confidence = compact(input.confidence || input.match_confidence || "");
  return {
    line_id:
      compact(input.line_id) ||
      `rl_${index + 1}_${String(input.product_variant_id || input.odoo_product_id || productText)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .slice(0, 40)}`,
    product_text: productText || split.product_base,
    product_base: compact(input.product_base) || split.product_base || productText,
    product_tmpl_id: Number(input.product_tmpl_id || 0) || null,
    product_variant_id:
      Number(input.product_variant_id || input.odoo_product_id || input.product_id || 0) || null,
    attributes: input.attributes || input.product_attributes || {},
    quantity: qty,
    unit_cop: Number(input.unit_cop || input.unit_price || 0) || null,
    confidence,
    category: compact(input.category || "").toLowerCase() || null,
    comments: compact(input.comments || input.variant_notes || ""),
  };
}

function peopleForSpreadsheet(detail = {}) {
  if (Array.isArray(detail.people) && detail.people.length) {
    return detail.people.map((person, i) => {
      const identity = person.identity || {};
      const primary = (person.components || [])[0] || {};
      return {
        person_id: person.person_id || `p${i + 1}`,
        nombre: compact(identity.print_name || identity.display_name || ""),
        numero: compact(identity.number || ""),
        talla: compact(primary.size || ""),
        resolved_line_id: compact(primary.resolved_line_id || person.resolved_line_id || ""),
        product_line_key: compact(primary.product_line_key || person.product_line_key || ""),
      };
    });
  }
  return (detail.rows || []).map((row, i) => ({
    person_id: `r${i + 1}`,
    nombre: compact(row.nombre || ""),
    numero: compact(row.numero || ""),
    talla: compact(row.talla || ""),
    resolved_line_id: compact(row.resolved_line_id || ""),
    product_line_key: compact(row.product_line_key || ""),
  }));
}

function crossCheckPeopleVsLines({ detail = {}, resolvedLines = [] } = {}) {
  const people = peopleForSpreadsheet(detail);
  const productLines = (resolvedLines || []).filter(
    (line) =>
      Number(line.quantity || 0) > 0 &&
      !/dise[nñ]o/i.test(line.product_base || line.product_text || "")
  );
  const totalQty = productLines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  const personCount = people.length;
  const mismatches = [];
  if (productLines.length && personCount && personCount !== totalQty) {
    mismatches.push({
      code: "qty_people_vs_lines",
      message: `Personas (${personCount}) != lineas (${totalQty})`,
    });
  }
  return {
    status: mismatches.length ? "mismatch" : personCount || totalQty ? "complete" : "empty",
    ok: mismatches.length === 0,
    person_count: personCount,
    line_qty: totalQty,
    mismatches,
  };
}

function stableFingerprint(payload = {}) {
  const lines = (payload.resolved_lines || [])
    .map((l) => ({
      p: Number(l.product_variant_id || 0) || String(l.product_text || ""),
      q: Number(l.quantity || 0),
    }))
    .sort((a, b) => String(a.p).localeCompare(String(b.p)));
  const people = peopleForSpreadsheet(payload.detail || {})
    .map((p) => `${p.numero}|${p.nombre}|${p.talla}`)
    .sort();
  return JSON.stringify({ lines, people, partner: String(payload.partner_key || "") });
}

function ok(now, readiness, orderDraft, needsReconcile, writeMode = "sale_order") {
  const customerName = compact(readiness.customer_display_name);
  const estimate = readiness.estimate || null;
  const qtyFromLines = (readiness.resolved_lines || []).reduce(
    (sum, line) => sum + Number(line.quantity || 0),
    0
  );
  const quotePatch = {};
  if (customerName) quotePatch.customer_display_name = customerName;
  if (estimate?.quantity || qtyFromLines) {
    quotePatch.quantity = Number(estimate?.quantity || qtyFromLines) || undefined;
  }
  if (estimate?.product_text) {
    quotePatch.product_text = estimate.product_text;
  }
  if (estimate) {
    quotePatch.estimate = estimate;
  }
  return new Response(
    JSON.stringify({
      vars: {
        quote: Object.keys(quotePatch).length ? quotePatch : undefined,
        staff: {
          write_status: "ok",
          write_code: readiness.code || "pedido_ready",
          write_blocked_reason: null,
          write_mode: writeMode || readiness.write_mode || "sale_order",
          registration_type: "pedido",
          confirmation_fingerprint: readiness.fingerprint || null,
        },
        order_draft: {
          ...orderDraft,
          customer_display_name:
            customerName || orderDraft.customer_display_name || undefined,
          commercial: {
            ...(orderDraft.commercial || {}),
            resolved_lines: readiness.resolved_lines,
            estimate: estimate || orderDraft.commercial?.estimate || null,
            provisional: Boolean(estimate?.provisional),
          },
          write: {
            status: needsReconcile ? "needs_human_reconcile" : "ready",
            code: readiness.code,
            fingerprint: readiness.fingerprint,
            mode: writeMode || readiness.write_mode || "sale_order",
          },
          spreadsheet: {
            ...(orderDraft.spreadsheet || {}),
            status: readiness.cross_check?.status || orderDraft.spreadsheet?.status || "empty",
            cross_check: readiness.cross_check,
          },
        },
        service: {
          last_call_name: "validate_staff_write",
          last_call_status: "ready",
          last_call_at: now,
          routed_registration_type: "pedido",
          fallback_message: needsReconcile
            ? "SO se creara pero hay descuadre personas vs cantidades; revisar Formulario."
            : estimate?.provisional
              ? `Estimado inicial ${estimate.quantity} × ${estimate.product_text} (fuente: ${estimate.source}); se refinará en el presupuesto.`
              : null,
        },
      },
      status: "ready",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

function needsConfirmation(readiness, now, orderDraft) {
  const estimate = readiness.estimate || null;
  const quotePatch = {};
  if (estimate?.quantity) quotePatch.quantity = estimate.quantity;
  if (estimate?.product_text) quotePatch.product_text = estimate.product_text;
  if (estimate) quotePatch.estimate = estimate;
  return new Response(
    JSON.stringify({
      vars: {
        quote: Object.keys(quotePatch).length ? quotePatch : undefined,
        staff: {
          write_status: "needs_confirmation",
          write_code: readiness.code,
          write_blocked_reason: readiness.message,
          registration_type: "pedido",
        },
        order_draft: {
          ...orderDraft,
          commercial: {
            ...(orderDraft.commercial || {}),
            resolved_lines: readiness.resolved_lines,
            estimate: estimate || orderDraft.commercial?.estimate || null,
            provisional: Boolean(estimate?.provisional),
          },
          write: {
            status: "needs_staff_confirmation",
            code: readiness.code,
            fingerprint: readiness.fingerprint,
          },
        },
        service: {
          last_call_name: "validate_staff_write",
          last_call_status: "needs_confirmation",
          last_call_at: now,
          routed_registration_type: "pedido",
          fallback_message: readiness.message,
        },
      },
      status: "needs_confirmation",
      message: readiness.message,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

function blocked(message, now, readiness = null) {
  return new Response(
    JSON.stringify({
      vars: {
        staff: {
          write_status: "blocked",
          write_code: readiness?.code || "blocked",
          write_blocked_reason: message,
          registration_type: "pedido",
        },
        order_draft: readiness
          ? {
              write: {
                status: "blocked",
                code: readiness.code,
                fingerprint: readiness.fingerprint,
              },
              commercial: {
                resolved_lines: readiness.resolved_lines || [],
              },
            }
          : undefined,
        service: {
          last_call_name: "validate_staff_write",
          last_call_status: "blocked",
          last_call_at: now,
          routed_registration_type: "pedido",
          fallback_message: message,
        },
      },
      status: "blocked",
      message,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
