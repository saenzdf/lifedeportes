// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: odoo-create-lead-and-so  id: 8a7b731d-480c-4abc-8a72-f965856d7515
// ultimo deploy: 2026-09-03T16:06:06-04:00  status: deployed
// motivo: subida CRM/SO legacy (ahora la hace Hermes)
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

// <<COMMERCIAL_RULES_START>>
/**
 * Búsqueda de res.partner por teléfono WhatsApp (Odoo 19 prod).
 * Usar phone_sanitized / phone_mobile_search; phone visible suele tener espacios.
 */

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeWaPhone(raw) {
  const digits = digitsOnly(raw);
  if (!digits) {
    return { e164Plus: null, e164Digits: null, local10: null, raw: String(raw ?? "").trim() };
  }

  let national = digits;
  if (digits.startsWith("57") && digits.length >= 12) {
    national = digits.slice(-10);
  } else if (digits.length >= 10) {
    national = digits.slice(-10);
  } else {
    return { e164Plus: null, e164Digits: null, local10: null, raw: String(raw ?? "").trim() };
  }

  return {
    e164Plus: `+57${national}`,
    e164Digits: `57${national}`,
    local10: national,
    raw: String(raw ?? "").trim(),
  };
}

const ACTIVE_PARTNER = ["active", "=", true];

// <<CRM_PROBABILITY_HELPER_START>>
function computeCrmProbabilityInline(vars = {}, body = {}) {
  const input = body?.input || {};
  const msgs = body?.whatsapp_context?.messages || [];
  const texts = [
    vars?.last_user_input,
    vars?.staff?.last_inbound_text,
    input?.text,
    ...([...msgs].reverse().slice(0, 10).map((m) => (m?.direction === "inbound" ? m.text?.body || m.content || "" : "")))
  ].filter(Boolean).join("\n").toLowerCase();

  const quote = vars?.quote || {};
  const orderDraft = vars?.order_draft || {};
  const commercialLines = orderDraft.commercial?.lines || quote.lines || [];
  const quantity = Number(quote.quantity || orderDraft.commercial?.quantity || 0);

  const isPaymentIntent = /\b(d[oó]nde\s+pago|d[aá]tos?\s+de\s+pago|n[uú]mero\s+de\s+cuenta|nequi|bancolombia|hacer\s+el\s+abono|para\s+consignar|c[oó]mo\s+cierro|d[oó]nde\s+consigno|pagar|link\s+de\s+pago|cu[eé]nta\s+bancaria)\b/i.test(texts);

  if (isPaymentIntent) return 98;
  if ((quote.formal_quote_requested || quote.status === "presupuesto_draft" || orderDraft.status === "confirmed") && quantity >= 6) return 95;

  const isHighIntent = /\b(me\s+parece\s+bien|listo|quiero\s+formalizar|hacer\s+el\s+pedido|hag[aá]moslo|estoy\s+seguro|confirmo\s+el\s+pedido|aprobado|empecemos)\b/i.test(texts);
  if (isHighIntent && quantity >= 6) return 85;
  if (quantity >= 6 && (quote.product_text || commercialLines.length > 0)) return 75;

  const isEvaluating = /\b(lo\b.*\bpensar|preguntar\b.*\bequipo|preguntar\b.*\bgrupo|esperando\b.*\bconfirmaci[oó]n|ma[nñ]ana\b.*\baviso|consultando|voy\s+a\s+ver|les\s+aviso)\b/i.test(texts);
  if (isEvaluating) return 50;

  if (quantity > 0 || quote.product_text) return 40;
  return 20;
}
// <<CRM_PROBABILITY_HELPER_END>>

// <<SIZE_SURCHARGES_HELPER_START>>
function computeSizeSurchargesInline(rows = []) {
  const detailRows = Array.isArray(rows) ? rows : [];
  let count2xl = 0;
  let count3xlPlus = 0;

  for (const row of detailRows) {
    const size = String(row?.talla || row?.size || row?.TALLA || "").replace(/\s+/g, "").toUpperCase();
    if (!size) continue;
    if (/^(2XL|XXL|2-XL|XX-L)$/.test(size) || /^2XL\b/.test(size) || /^XXL\b/.test(size)) {
      count2xl += 1;
    } else if (/^(3XL|XXXL|4XL|XXXXL|5XL|6XL|3-XL|4-XL|5-XL)$/.test(size) || /^[3-9]XL\b/.test(size) || /^X{3,}L\b/.test(size)) {
      count3xlPlus += 1;
    }
  }

  const surcharges = [];
  if (count2xl > 0) {
    surcharges.push({
      product_id: 1805,
      product_text: "Incrementos de precio: a partir de la 2xl:",
      name: "Incrementos de precio: a partir de la 2xl:",
      quantity: count2xl,
      unit_price: 7000,
    });
  }
  if (count3xlPlus > 0) {
    surcharges.push({
      product_id: 1806,
      product_text: "Incrementos de precio: a partir de la 3xl",
      name: "Incrementos de precio: a partir de la 3xl",
      quantity: count3xlPlus,
      unit_price: 10000,
    });
  }
  return { count2xl, count3xlPlus, surcharges };
}
// <<SIZE_SURCHARGES_HELPER_END>>


function partnerSearchDomains(normalized) {
  if (!normalized?.e164Plus) return [];
  const { e164Plus, e164Digits, local10 } = normalized;
  return [
    { strategy: "phone_sanitized", domain: [ACTIVE_PARTNER, ["phone_sanitized", "=", e164Plus]] },
    { strategy: "phone_mobile_search_plus", domain: [ACTIVE_PARTNER, ["phone_mobile_search", "=", e164Plus]] },
    { strategy: "phone_mobile_search_digits", domain: [ACTIVE_PARTNER, ["phone_mobile_search", "=", e164Digits]] },
    { strategy: "phone_exact_digits", domain: [ACTIVE_PARTNER, ["phone", "=", e164Digits]] },
    { strategy: "phone_ilike_local10", domain: [ACTIVE_PARTNER, ["phone", "ilike", local10]] },
  ];
}

function mergePartnerCandidates(existing, rows) {
  const seen = new Set(existing.map((row) => row.id));
  const merged = [...existing];
  for (const row of rows || []) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

function pickPartnerByLatestOrder(candidates, orders) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const orderList = Array.isArray(orders) ? orders : [];
  for (const order of orderList) {
    const partnerId = Array.isArray(order?.partner_id) ? order.partner_id[0] : order?.partner_id;
    const hit = candidates.find((candidate) => candidate.id === partnerId);
    if (hit) return hit;
  }

  return [...candidates].sort((a, b) => a.id - b.id)[0];
}

/**
 * @param {(model: string, method: string, args: unknown[], kw?: object) => Promise<unknown>} executeKw
 */
async function findPartnerByWaPhone(executeKw, rawPhone, options = {}) {
  const normalized = normalizeWaPhone(rawPhone);
  if (!normalized.e164Plus) {
    return {
      partner: null,
      normalized,
      match_strategy: null,
      ambiguous: false,
      candidates: [],
    };
  }

  const fields = options.fields || ["id", "name", "phone", "phone_sanitized"];
  let candidates = [];
  let match_strategy = null;

  for (const { strategy, domain } of partnerSearchDomains(normalized)) {
    const rows = await executeKw("res.partner", "search_read", [domain], {
      fields,
      limit: options.limit || 10,
    });
    const before = candidates.length;
    candidates = mergePartnerCandidates(candidates, rows);
    if (candidates.length === 1 && before === 0) {
      match_strategy = strategy;
      return {
        partner: candidates[0],
        normalized,
        match_strategy,
        ambiguous: false,
        candidates: summarizeCandidates(candidates),
      };
    }
    if (candidates.length > 0 && !match_strategy) {
      match_strategy = strategy;
    }
  }

  if (candidates.length === 0) {
    return {
      partner: null,
      normalized,
      match_strategy: null,
      ambiguous: false,
      candidates: [],
    };
  }

  if (candidates.length === 1) {
    return {
      partner: candidates[0],
      normalized,
      match_strategy,
      ambiguous: false,
      candidates: summarizeCandidates(candidates),
    };
  }

  const ids = candidates.map((candidate) => candidate.id);
  const saleOrders = await executeKw(
    "sale.order",
    "search_read",
    [[["partner_id", "in", ids]]],
    {
      fields: ["id", "name", "partner_id", "date_order", "state"],
      order: "date_order desc, id desc",
      limit: 50,
    }
  );

  const partner = pickPartnerByLatestOrder(candidates, saleOrders);
  return {
    partner,
    normalized,
    match_strategy: "disambiguate_latest_order",
    ambiguous: true,
    candidates: summarizeCandidates(candidates),
    chosen_partner_id: partner?.id || null,
  };
}

function summarizeCandidates(candidates) {
  return (candidates || []).map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    phone: candidate.phone || null,
    phone_sanitized: candidate.phone_sanitized || null,
  }));
}

function partnerCreateVals(displayName, normalized, extra = {}) {
  return {
    name: displayName,
    phone: normalized?.e164Plus || false,
    comment: extra.comment || false,
  };
}

function nameSearchTerms(rawName) {
  const name = String(rawName ?? "").trim();
  if (!name) return [];
  const terms = [name];
  const preseas = name.match(/preseas\s*#?\s*(\d+)/i);
  if (preseas) {
    terms.push(`PRESEAS ${preseas[1]}`);
    terms.push(`PRESEAS #${preseas[1]}`);
    terms.push("PRESEAS");
  }
  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
}

/**
 * @param {(model: string, method: string, args: unknown[], kw?: object) => Promise<unknown>} executeKw
 */
async function findPartnerByName(executeKw, rawName, options = {}) {
  const terms = nameSearchTerms(rawName);
  if (!terms.length) {
    return {
      partner: null,
      match_strategy: null,
      ambiguous: false,
      candidates: [],
    };
  }

  const fields = options.fields || ["id", "name", "phone", "phone_sanitized"];
  let candidates = [];
  let match_strategy = null;

  for (const term of terms) {
    const rows = await executeKw(
      "res.partner",
      "search_read",
      [[ACTIVE_PARTNER, ["name", "ilike", term]]],
      { fields, limit: options.limit || 10 }
    );
    const before = candidates.length;
    candidates = mergePartnerCandidates(candidates, rows);
    if (candidates.length === 1 && before === 0) {
      match_strategy = `name_ilike:${term}`;
      return {
        partner: candidates[0],
        match_strategy,
        ambiguous: false,
        candidates: summarizeCandidates(candidates),
      };
    }
    if (candidates.length > 0 && !match_strategy) {
      match_strategy = `name_ilike:${term}`;
    }
  }

  if (candidates.length === 0) {
    return {
      partner: null,
      match_strategy: null,
      ambiguous: false,
      candidates: [],
    };
  }

  if (candidates.length === 1) {
    return {
      partner: candidates[0],
      match_strategy,
      ambiguous: false,
      candidates: summarizeCandidates(candidates),
    };
  }

  const ids = candidates.map((candidate) => candidate.id);
  const saleOrders = await executeKw(
    "sale.order",
    "search_read",
    [[["partner_id", "in", ids]]],
    {
      fields: ["id", "name", "partner_id", "date_order", "state"],
      order: "date_order desc, id desc",
      limit: 50,
    }
  );

  const partner = pickPartnerByLatestOrder(candidates, saleOrders);
  return {
    partner,
    match_strategy: "disambiguate_latest_order_by_name",
    ambiguous: true,
    candidates: summarizeCandidates(candidates),
    chosen_partner_id: partner?.id || null,
  };
}


const UNIFORM_BASE_MIN_QTY = 6;

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/dry-fit/g, "dry fit")
    .replace(/[.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferCommercialRoleFromLine(line) {
  if (line?.commercial_role) return line.commercial_role;
  const category = String(line?.category || "").toLowerCase();
  const name = String(line?.name || "").toLowerCase();
  if (name.includes("diseno") || name.includes("diseño")) return "design";
  if (category === "uniforme") return "base_uniform";
  if (["camiseta", "pantaloneta", "medias", "otros"].includes(category)) return "extra";
  return "extra";
}

function normalizeCommercialLine(line) {
  return {
    category: String(line?.category || "").toLowerCase(),
    commercial_role: inferCommercialRoleFromLine(line),
    quantity: Math.max(0, Number(line?.quantity || 0)),
    name: String(line?.name || ""),
    product_text: String(line?.product_text || line?.name || ""),
  };
}

function validateCommercialOrder({
  lines,
  uniformBaseMinQty = UNIFORM_BASE_MIN_QTY,
  allowDesignExploration = false,
}) {
  const normalized = (lines || [])
    .map(normalizeCommercialLine)
    .filter((line) => line.commercial_role !== "design" && line.quantity > 0);

  // Solo líneas de diseño (sin comercial) = exploración OK
  const raw = (lines || []).map(normalizeCommercialLine);
  const onlyDesign =
    raw.some((l) => l.commercial_role === "design" && l.quantity > 0) &&
    normalized.length === 0;
  if (onlyDesign || allowDesignExploration) {
    const sampleQty = normalized.reduce((s, l) => s + l.quantity, 0);
    if (onlyDesign || (allowDesignExploration && sampleQty <= 1)) {
      return {
        ok: true,
        code: "DESIGN_EXPLORATION",
        message_es: null,
        base_uniform_qty: sampleQty,
        extras_qty: 0,
        design_exploration: true,
      };
    }
  }

  let baseUniformQty = 0;
  let extrasQty = 0;
  for (const line of normalized) {
    if (line.commercial_role === "base_uniform") {
      baseUniformQty += line.quantity;
      continue;
    }
    if (line.commercial_role === "extra") {
      extrasQty += line.quantity;
    }
  }

  if (baseUniformQty === 0 && extrasQty === 0) {
    return {
      ok: false,
      code: "NO_COMMERCIAL_LINES",
      message_es: "El pedido no tiene líneas comerciales.",
      base_uniform_qty: 0,
      extras_qty: 0,
    };
  }

  if (baseUniformQty === 0 && extrasQty > 0) {
    const belowMinimum = normalized.find((line) => line.quantity < uniformBaseMinQty);
    if (belowMinimum) {
      return {
        ok: false,
        code: "STANDALONE_BELOW_MINIMUM",
        message_es: `El pedido mínimo es ${uniformBaseMinQty} unidades del mismo producto/diseño. ${belowMinimum.name || belowMinimum.product_text} tiene ${belowMinimum.quantity}.`,
        base_uniform_qty: 0,
        extras_qty: extrasQty,
      };
    }
    return {
      ok: true,
      code: null,
      message_es: null,
      base_uniform_qty: 0,
      extras_qty: extrasQty,
    };
  }

  if (baseUniformQty > 0 && baseUniformQty < uniformBaseMinQty) {
    return {
      ok: false,
      code: "BASE_BELOW_MINIMUM",
      message_es: `Sumerce, el pedido mínimo es ${uniformBaseMinQty} uniformes completos por diseño. Con ${baseUniformQty} no alcanzamos; ¿los hacemos en ${uniformBaseMinQty}?`,
      base_uniform_qty: baseUniformQty,
      extras_qty: extrasQty,
    };
  }

  return {
    ok: true,
    code: null,
    message_es: null,
    base_uniform_qty: baseUniformQty,
    extras_qty: extrasQty,
  };
}

function resolveCatalogProduct(catalogCache, productText) {
  const products = catalogCache?.products || [];
  const needle = normalizeText(productText);
  if (!needle) return null;
  const exact = products.find((p) => normalizeText(p.name) === needle);
  if (exact) return exact;
  return (
    products.find((p) => {
      const name = normalizeText(p.name);
      return name.includes(needle) || needle.includes(name);
    }) || null
  );
}

function buildCommercialLineFromInput(inputLine, catalogCache) {
  const productText = String(inputLine?.product_text || inputLine?.name || "").trim();
  const quantity = Math.max(1, Number(inputLine?.quantity || 1));
  const matched = resolveCatalogProduct(catalogCache, productText);
  if (matched) {
    return {
      category: matched.category,
      commercial_role: matched.commercial_role || inferCommercialRoleFromLine(matched),
      quantity,
      name: matched.name,
      product_text: productText || matched.name,
      odoo_product_id: matched.odoo_id || null,
      unit_cop: matched.list_price_cop,
    };
  }
  const category = String(inputLine?.category || "").toLowerCase() || null;
  const name = productText || String(inputLine?.name || "");
  return {
    category,
    commercial_role: inferCommercialRoleFromLine({ category, name }),
    quantity,
    name,
    product_text: productText || name,
    odoo_product_id: inputLine?.odoo_product_id || null,
    unit_cop: Number(inputLine?.unit_cop || inputLine?.unit_price || 0) || null,
  };
}

function buildOrderLinesFromDraft(draftPayload, matchedProduct, catalogCache) {
  const lines = [];
  const mainQty = Math.max(1, Number(draftPayload?.quantity || 1));
  const mainText = String(draftPayload?.product_text || draftPayload?.matched_product_name || "").trim();
  if (mainText || matchedProduct) {
    lines.push(
      buildCommercialLineFromInput(
        {
          product_text: mainText || matchedProduct?.name,
          quantity: mainQty,
          category: matchedProduct?.category,
          name: matchedProduct?.name || mainText,
          odoo_product_id: draftPayload?.odoo_product_id || matchedProduct?.odoo_id,
          unit_cop: draftPayload?.unit_cop || matchedProduct?.list_price_cop,
        },
        catalogCache
      )
    );
  }

  const extraSources = [];
  if (Array.isArray(draftPayload?.extra_lines)) extraSources.push(...draftPayload.extra_lines);
  if (Array.isArray(draftPayload?.rows)) {
    for (const row of draftPayload.rows) {
      extraSources.push({
        product_text: row.name || row.product_text,
        quantity: row.quantity || row.product_uom_qty,
        odoo_product_id: row.product_id || row.odoo_product_id,
        unit_cop: row.unit_price ?? row.price_unit,
        category: row.category,
      });
    }
  }

  for (const extra of extraSources) {
    const built = buildCommercialLineFromInput(extra, catalogCache);
    const duplicateMain =
      lines.length === 1 &&
      built.name &&
      lines[0].name &&
      built.name.toLowerCase() === lines[0].name.toLowerCase();
    if (!duplicateMain) lines.push(built);
  }

  return lines;
}

function buildDraftRowsFromLines(lines) {
  return (lines || [])
    .filter((line) => line.commercial_role !== "design")
    .map((line) => ({
      name: line.name,
      product_text: line.product_text || line.name,
      quantity: line.quantity,
      product_id: line.odoo_product_id || null,
      category: line.category,
      commercial_role: line.commercial_role,
      unit_price: line.unit_cop ?? 0,
      price_unit: line.unit_cop ?? 0,
    }));
}

function getUniformBaseMinQty(catalogCache) {
  return Number(catalogCache?.commercial_rules?.uniform_base_min_qty || UNIFORM_BASE_MIN_QTY);
}
// <<COMMERCIAL_RULES_END>>

// <<BUILD_ODOO_ORDER_NOTE_START>>
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Quita prefijo CRM «Oportunidad de X» → X */
function stripOppPrefix(name) {
  return compact(name).replace(/^oportunidad\s+de\s+/i, "").trim();
}

function toDetailRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const nombre = compact(raw.nombre || raw.name || raw.nombre_uniforme || "");
  const numero = compact(raw.numero || raw.number || raw.dorsal || "");
  const talla = compact(raw.talla || raw.size || "");
  if (!nombre && !numero && !talla && !raw.nombre_vacio_impresion) return null;
  let grupo = compact(raw.grupo || raw.genero || "").toLowerCase();
  if (/fem|mujer/.test(grupo)) grupo = "femenino";
  else if (/masc|hombre/.test(grupo)) grupo = "masculino";
  else if (!grupo) grupo = "general";
  const comentario = compact(raw.comentario || "");
  let rol = compact(raw.rol || raw.role || raw.variante || "");
  if (!rol && comentario) rol = comentario;
  else if (comentario && rol && !rol.includes(comentario)) rol = rol + " · " + comentario;
  return {
    nombre,
    numero,
    talla,
    grupo,
    rol,
    manga: compact(raw.manga || ""),
    arquero: Boolean(raw.arquero) || /arquer/i.test(rol + comentario),
    camiseta: Boolean(raw.camiseta),
    uniforme: raw.uniforme !== false && !raw.camiseta,
    comentario,
    nombre_vacio_impresion: Boolean(raw.nombre_vacio_impresion),
  };
}

function normalizeMangaGroup(manga) {
  const m = compact(manga).toLowerCase();
  const hasLarga = /larga/.test(m);
  const hasCorta = /corta|sisa/.test(m);
  if (hasLarga && hasCorta) return "mixta";
  if (hasLarga) return "larga";
  if (hasCorta) return "corta";
  return "otra";
}

/** Unidades por tipo de manga desde cantidad / «2 LARGA+1 CORTA». */
function unitPartsForRow(raw) {
  const row = toDetailRow(raw) || raw;
  if (Array.isArray(row?.manga_parts) && row.manga_parts.length) {
    return row.manga_parts.map((p) => ({
      manga: compact(p.manga).toLowerCase() || "otra",
      qty: Math.max(1, Number(p.qty) || 1),
    }));
  }
  const qty = Math.max(1, Number(row?.cantidad || raw?.cantidad || 1) || 1);
  const g = normalizeMangaGroup(raw?.manga || row?.manga);
  if (g === "mixta") return [{ manga: "mixta", qty }];
  return [{ manga: g === "otra" ? "otra" : g, qty }];
}

/** Quita manga duplicada del rol cuando la tabla ya va agrupada por manga. */
function stripMangaFromRol(rolVariante) {
  return compact(rolVariante)
    .split(" · ")
    .filter(
      (p) =>
        p &&
        !/^(corta|larga|manga\s*cort|manga\s*larg|sisa)$/i.test(p.trim()) &&
        !/^manga\s/i.test(p) &&
        !/^\d+\s*LARGA(\s*\+\s*\d+\s*CORTA)?$/i.test(p.trim()) &&
        !/^\d+\s*CORTA$/i.test(p.trim())
    )
    .join(" · ");
}

/** Quita etiqueta de producto cuando el título de tabla ya dice Uniforme/Camiseta. */
function stripProductFromRol(rolVariante) {
  return compact(rolVariante)
    .split(" · ")
    .filter((p) => p && !/^(uniforme|camiseta|conjunto)$/i.test(p.trim()))
    .join(" · ");
}

/**
 * Tipo de prenda para agrupar tablas: uniforme (conjunto) | camiseta | pantaloneta | otro.
 */
function productKindFromRow(raw) {
  const row = toDetailRow(raw) || raw || {};
  if (row.pantaloneta || raw?.pantaloneta) return "pantaloneta";
  if (row.camiseta || raw?.camiseta) return "camiseta";
  if (row.uniforme === false && !row.camiseta) return "otro";
  if (row.uniforme || raw?.uniforme) return "uniforme";
  const rol = compact(row.rol || raw?.rol || "");
  if (/pantaloneta|short/i.test(rol)) return "pantaloneta";
  if (/camiseta/i.test(rol)) return "camiseta";
  if (/uniforme|conjunto/i.test(rol)) return "uniforme";
  return "uniforme";
}

const PRODUCT_LABEL = {
  uniforme: "Uniforme (conjunto)",
  camiseta: "Camiseta",
  pantaloneta: "Pantaloneta",
  otro: "Otro",
};

const PRODUCT_ORDER = ["uniforme", "camiseta", "pantaloneta", "otro"];
const MANGA_ORDER = ["corta", "larga", "mixta", "otra"];

function countVariantSummary(rows) {
  const summary = {
    manga_corta: 0,
    manga_larga: 0,
    arquero: 0,
    uniforme_corta: 0,
    uniforme_larga: 0,
    camiseta_corta: 0,
    camiseta_larga: 0,
    pantaloneta: 0,
    total: 0,
    filas: 0,
  };
  for (const raw of rows || []) {
    const row = normalizeDetailRow(raw);
    if (!row) continue;
    summary.filas += 1;
    const parts = unitPartsForRow(raw);
    const rowQty = parts.reduce((s, p) => s + p.qty, 0);
    summary.total += rowQty;
    if (raw.pantaloneta) {
      summary.pantaloneta += rowQty;
      continue;
    }
    const isArquero = raw.arquero || /arquer/i.test(row.rol_variante);
    if (isArquero) summary.arquero += 1;
    // Preferir flags del parser (X Uniforme/Camiseta). No inferir «camiseta» solo porque
    // el comentario liste prendas («Camiseta, Pantaloneta, Pantalon…»).
    const isCamiseta = Boolean(raw.camiseta);
    const isUniforme = Boolean(raw.uniforme) || (!isCamiseta && raw.uniforme !== false);
    const mascArqueroUniforme =
      isArquero && row.grupo === "masculino" && raw.uniforme !== false && !raw.camiseta;

    for (const part of parts) {
      const manga = part.manga === "mixta" ? "otra" : part.manga;
      const q = part.qty;
      if (manga === "larga") summary.manga_larga += q;
      else if (manga === "corta") summary.manga_corta += q;

      if (mascArqueroUniforme) {
        if (manga === "larga") summary.uniforme_larga += q;
        else if (manga === "corta") summary.uniforme_corta += q;
        continue;
      }
      if (isArquero) {
        if (manga === "larga") summary.camiseta_larga += q;
        else if (manga === "corta") summary.camiseta_corta += q;
        continue;
      }
      if (isCamiseta) {
        if (manga === "larga") summary.camiseta_larga += q;
        else if (manga === "corta") summary.camiseta_corta += q;
      } else if (isUniforme) {
        if (manga === "larga") summary.uniforme_larga += q;
        else if (manga === "corta") summary.uniforme_corta += q;
      }
    }
  }
  return summary;
}

function buildVariantSummaryHtml(rows) {
  const s = countVariantSummary(rows);
  if (!s.total) return "";
  const items = [];
  if (s.uniforme_corta) items.push(`<li><strong>Uniforme manga corta:</strong> ${s.uniforme_corta} u.</li>`);
  if (s.uniforme_larga) items.push(`<li><strong>Uniforme manga larga:</strong> ${s.uniforme_larga} u.</li>`);
  if (s.camiseta_corta) items.push(`<li><strong>Camiseta manga corta:</strong> ${s.camiseta_corta} u.</li>`);
  if (s.camiseta_larga) items.push(`<li><strong>Camiseta manga larga:</strong> ${s.camiseta_larga} u.</li>`);
  if (s.pantaloneta) {
    items.push(`<li><strong>Pantaloneta / short:</strong> ${s.pantaloneta} u. <em>(solo pantaloneta, ver comentario en lista)</em></li>`);
  }
  if (s.arquero) {
    items.push(
      `<li><strong>Arquero:</strong> ${s.arquero} u. <em>(comentario en lista; mismo precio camiseta/uniforme, sin cargo adicional)</em></li>`
    );
  }
  if (!items.length) return "";
  return `<h2>Resumen por producto y manga</h2>
<ul>
  ${items.join("\n  ")}
</ul>`;
}

function isNoiseCommentFrag(frag) {
  const f = compact(frag);
  if (!f) return true;
  if (/^(campo|camiseta|uniforme|pantaloneta|conjunto|producto)$/i.test(f)) return true;
  if (/^solo\s*pantaloneta$/i.test(f)) return true;
  if (/^familia\s/i.test(f)) return true;
  if (/^×\d+$/i.test(f)) return true;
  return false;
}

/** Comentario de fila para la tabla: Arquero solo si viene del Excel; sin inventar «Campo». */
function buildRowComment(canonical) {
  const parts = [];
  if (canonical.arquero) parts.push("Arquero");

  const comentario = compact(canonical.comentario);
  if (comentario) {
    for (const frag of comentario.split(" · ").map((s) => s.trim()).filter(Boolean)) {
      if (isNoiseCommentFrag(frag)) continue;
      if (/arquer|porter/i.test(frag) && canonical.arquero) continue;
      if (parts.some((p) => p.toLowerCase() === frag.toLowerCase())) continue;
      parts.push(frag);
    }
  }

  // No copiar rol genérico (Campo / Camiseta / Uniforme) a la tabla.
  const rol = compact(canonical.rol);
  if (rol) {
    for (const frag of rol.split(" · ").map((s) => s.trim()).filter(Boolean)) {
      if (isNoiseCommentFrag(frag)) continue;
      if (/arquer|porter/i.test(frag)) {
        if (!canonical.arquero && !parts.some((p) => /arquer/i.test(p))) parts.push("Arquero");
        continue;
      }
      if (parts.some((p) => p.toLowerCase() === frag.toLowerCase())) continue;
      parts.push(frag);
    }
  }

  if (canonical.nombre_vacio_impresion && !compact(canonical.nombre)) {
    parts.push("sin nombre en uniforme");
  }
  return parts.join(" · ");
}

function normalizeDetailRow(row) {
  if (!row || typeof row !== "object") return null;
  const canonical = toDetailRow(row);
  if (!canonical) return null;
  const nombre = compact(canonical.nombre);
  const numero = compact(canonical.numero);
  const talla = compact(canonical.talla);
  const manga = compact(canonical.manga);
  const cantidad = Math.max(1, Number(canonical.cantidad || 1) || 1);
  const grupoNorm = canonical.grupo || "general";
  const comentario = buildRowComment(canonical);

  return {
    numero: numero || "",
    nombre,
    talla: talla || "",
    cantidad,
    manga,
    comentario,
    // legacy alias: solo para family/product column paths
    rol_variante: comentario,
    grupo: grupoNorm,
    arquero: Boolean(canonical.arquero),
  };
}

function buildDetailTableHtml(title, rows, opts = {}) {
  if (!rows.length) return "";
  const showProduct = Boolean(opts.productColumnLabel);
  const colProduct = opts.productColumnLabel || "Producto";
  const showQty = opts.showCantidad || rows.some((r) => Number(r.cantidad || 1) > 1);
  // Comentario solo si hay algo real (arquero / nota Excel); nunca columna Rol con «Campo».
  const hasComment = !showProduct && rows.some((r) => compact(r.comentario));

  const body = rows
    .map((row, idx) => {
      const bg = idx % 2 ? ' style="background-color:#f9f9f9;"' : "";
      const qtyCell = showQty
        ? `<td style="text-align:center; padding: 8px;">${escapeHtml(String(row.cantidad || 1))}</td>`
        : "";
      const productCell = showProduct
        ? `<td style="padding: 8px;">${escapeHtml(row.rol_variante || "—")}</td>`
        : "";
      const commentCell = hasComment
        ? `<td style="padding: 8px;">${escapeHtml(compact(row.comentario) || "")}</td>`
        : "";
      return `<tr${bg}><td style="text-align:center; padding: 8px;">${escapeHtml(row.numero || "—")}</td><td style="padding: 8px;">${escapeHtml(row.nombre || "—")}</td><td style="text-align:center; padding: 8px;">${escapeHtml(row.talla || "—")}</td>${qtyCell}${productCell}${commentCell}</tr>`;
    })
    .join("\n    ");

  const qtyHead = showQty
    ? `<th style="text-align:center; padding: 8px;">Cant.</th>`
    : "";
  const productHead = showProduct
    ? `<th style="text-align:left; padding: 8px;">${escapeHtml(colProduct)}</th>`
    : "";
  const commentHead = hasComment
    ? `<th style="text-align:left; padding: 8px;">Comentario</th>`
    : "";

  return `<h2>${escapeHtml(title)}</h2>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">
      <th style="text-align:center; padding: 8px;">N°</th>
      <th style="text-align:left; padding: 8px;">Nombre</th>
      <th style="text-align:center; padding: 8px;">Talla</th>
      ${qtyHead}
      ${productHead}
      ${commentHead}
    </tr>
  </thead>
  <tbody>
    ${body}
  </tbody>
</table>`;
}

function groupDetailRows(rows) {
  const groups = { masculino: [], femenino: [], general: [] };
  for (const raw of rows) {
    const row = normalizeDetailRow(raw);
    if (!row) continue;
    const key = groups[row.grupo] ? row.grupo : "general";
    groups[key].push({ raw, row });
  }
  return groups;
}

function genderProductMangaTitle(genderLabel, productKind, mangaKey) {
  const who = genderLabel === "Masculino" ? "jugadores" : genderLabel === "Femenino" ? "jugadoras" : "detalle";
  const product = PRODUCT_LABEL[productKind] || PRODUCT_LABEL.otro;
  const mangaLabel =
    mangaKey === "corta"
      ? "Manga corta"
      : mangaKey === "larga"
        ? "Manga larga"
        : mangaKey === "mixta"
          ? "Manga mixta"
          : mangaKey === "otra"
            ? null
            : mangaKey;
  if (mangaLabel) return `Lista de ${who} (${genderLabel}) — ${product} · ${mangaLabel}`;
  return `Lista de ${who} (${genderLabel}) — ${product}`;
}

/**
 * Expande una fila a entradas de tabla por (producto × manga × qty).
 * «2 LARGA+1 CORTA» → una fila en manga larga (cant 2) y otra en corta (cant 1).
 */
function expandItemsForProductMangaTables(items) {
  const out = [];
  for (const { raw, row } of items) {
    const product = productKindFromRow(raw);
    const parts = unitPartsForRow(raw);
    const comentario = compact(row.comentario);
    for (const part of parts) {
      let mangaKey = part.manga === "mixta" ? "mixta" : part.manga;
      if (!MANGA_ORDER.includes(mangaKey)) mangaKey = "otra";
      out.push({
        product,
        mangaKey,
        row: {
          ...row,
          cantidad: part.qty,
          manga: part.manga,
          comentario,
          rol_variante: comentario,
        },
      });
    }
  }
  return out;
}

function buildGroupedGenderTables(genderLabel, items) {
  const parts = [];
  const expanded = expandItemsForProductMangaTables(items);
  const showCantidad = expanded.some((e) => Number(e.row.cantidad || 1) > 1);

  const buckets = new Map(); // `${product}|${manga}` → rows
  for (const e of expanded) {
    const key = `${e.product}|${e.mangaKey}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(e.row);
  }

  for (const product of PRODUCT_ORDER) {
    for (const mangaKey of MANGA_ORDER) {
      const rows = buckets.get(`${product}|${mangaKey}`);
      if (!rows?.length) continue;
      parts.push(
        buildDetailTableHtml(genderProductMangaTitle(genderLabel, product, mangaKey), rows, {
          showCantidad,
        })
      );
    }
  }
  return parts;
}

function buildGroupedDetailTables(rows) {
  const groups = groupDetailRows(rows);
  const parts = [];
  if (groups.masculino.length) {
    parts.push(...buildGroupedGenderTables("Masculino", groups.masculino));
  }
  if (groups.femenino.length) {
    parts.push(...buildGroupedGenderTables("Femenino", groups.femenino));
  }
  if (groups.general.length) {
    parts.push(buildDetailTableHtml("Lista de detalle", groups.general.map((x) => x.row)));
  }
  return parts;
}

/** Extrae etiqueta de familia desde comentario «Familia NOMBRE». */
function extractFamilyKey(raw) {
  const c = compact(raw?.comentario || "");
  const m = c.match(/^familia\s+(.+)$/i);
  if (m) return compact(m[1]);
  return "";
}

/** Filas Word Día de la Familia: mayoría con comentario Familia X. */
function isFamilyDayListRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  let withFam = 0;
  for (const r of rows) {
    if (extractFamilyKey(r)) withFam += 1;
  }
  return withFam >= Math.max(2, Math.floor(rows.length * 0.5));
}

function familyProductLabel(raw) {
  const rol = compact(raw?.rol || "");
  if (/uniforme\s*ni[nñ]os/i.test(rol)) return "Uniforme niños";
  if (/camiseta\s*caballero/i.test(rol)) return "Camiseta caballero";
  if (/camiseta\s*dama/i.test(rol)) return "Camiseta dama";
  if (raw?.uniforme && raw?.grupo === "masculino") return "Uniforme niños";
  if (raw?.camiseta && raw?.grupo === "femenino") return "Camiseta dama";
  if (raw?.camiseta && raw?.grupo === "masculino") return "Camiseta caballero";
  return (
    stripMangaFromRol(rol)
      .split(" · ")
      .filter((p) => p && !/^familia\s/i.test(p))
      .join(" · ") || "—"
  );
}

function normalizeFamilyDayTableRow(raw) {
  const canonical = toDetailRow(raw);
  if (!canonical) return null;
  return {
    numero: compact(canonical.numero) || "—",
    nombre: compact(canonical.nombre),
    talla: compact(canonical.talla) || "—",
    rol_variante: familyProductLabel(raw),
  };
}

function buildFamilyDayProductSummary(rows) {
  let uniforme = 0;
  let dama = 0;
  let caballero = 0;
  for (const raw of rows || []) {
    const label = familyProductLabel(raw);
    if (/uniforme/i.test(label)) uniforme += 1;
    else if (/caballero/i.test(label)) caballero += 1;
    else if (/dama/i.test(label)) dama += 1;
  }
  const items = [];
  if (uniforme) items.push(`<li><strong>Uniforme niños:</strong> ${uniforme} u.</li>`);
  if (dama) items.push(`<li><strong>Camiseta dama:</strong> ${dama} u.</li>`);
  if (caballero) items.push(`<li><strong>Camiseta caballero:</strong> ${caballero} u.</li>`);
  if (!items.length) return "";
  return `<h2>Resumen por producto</h2>
<ul>
  ${items.join("\n  ")}
</ul>`;
}

function buildFamilyGroupedTables(rows) {
  const order = [];
  const byFamily = new Map();
  for (const raw of rows || []) {
    const key = extractFamilyKey(raw) || "Sin familia";
    if (!byFamily.has(key)) {
      byFamily.set(key, []);
      order.push(key);
    }
    const row = normalizeFamilyDayTableRow(raw);
    if (row) byFamily.get(key).push(row);
  }
  const parts = [];
  for (const key of order) {
    const famRows = byFamily.get(key);
    if (!famRows?.length) continue;
    const title = key === "Sin familia" ? key : `Familia ${key}`;
    parts.push(
      buildDetailTableHtml(title, famRows, { productColumnLabel: "Producto" })
    );
  }
  return parts;
}

function buildCommercialSummaryHtml(lines) {
  if (!Array.isArray(lines) || !lines.length) return "";
  const items = lines
    .map((line) => {
      const qty = Number(line.quantity || line.qty || line.product_uom_qty || 0);
      const label = compact(
        line.label || line.name || line.product_text || line.description
      );
      if (!label || !qty) return null;
      return `<li><strong>${escapeHtml(label)} (${qty} u.):</strong> ${escapeHtml(
        compact(line.variant_notes || line.variant || "")
      )}</li>`;
    })
    .filter(Boolean);
  if (!items.length) return "";
  return `<h2>Resumen de uniformes</h2>
<ul>
  ${items.join("\n  ")}
</ul>`;
}

/**
 * Espejo fiel de una grilla Excel → HTML (formato no reconocido / mirror_v1).
 * No reinterpreta a Life: mismas columnas y celdas que la fuente.
 */
function trimGrid(grid) {
  if (!Array.isArray(grid) || !grid.length) return [];
  let maxCol = 0;
  let lastRow = -1;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    let rowHas = false;
    for (let c = 0; c < row.length; c++) {
      if (compact(row[c])) {
        rowHas = true;
        if (c > maxCol) maxCol = c;
      }
    }
    if (rowHas) lastRow = r;
  }
  if (lastRow < 0) return [];
  return grid.slice(0, lastRow + 1).map((row) => {
    const out = [];
    for (let c = 0; c <= maxCol; c++) out.push(row?.[c] ?? "");
    return out;
  });
}

function buildExcelMirrorHtml(grid, opts = {}) {
  const trimmed = trimGrid(grid);
  if (!trimmed.length) return "";
  const sheet = compact(opts.sheetName);
  const title =
    compact(opts.title) ||
    (sheet
      ? `Lista (espejo Excel — pestaña ${sheet})`
      : "Lista (espejo Excel — formato no reconocido)");
  const header = trimmed[0] || [];
  const bodyRows = trimmed.slice(1);
  const th = header
    .map(
      (h) =>
        `<th style="text-align:left; padding: 8px;">${escapeHtml(compact(h) || "—")}</th>`
    )
    .join("");
  const body = bodyRows
    .map((row, idx) => {
      const bg = idx % 2 ? ' style="background-color:#f9f9f9;"' : "";
      const cells = header
        .map((_, c) => `<td style="padding: 8px;">${escapeHtml(compact(row[c]))}</td>`)
        .join("");
      return `<tr${bg}>${cells}</tr>`;
    })
    .join("\n    ");
  return `<h2>${escapeHtml(title)}</h2>
<p><em>Tabla igual al Excel (mismas columnas). Si hay chaquetas, busos o camisas, suelen ir en COMENTARIO / TALLA.</em></p>
<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%; border: 1px solid #ddd; font-family: sans-serif;">
  <thead>
    <tr style="background-color:#f2f2f2;">${th}</tr>
  </thead>
  <tbody>
    ${body}
  </tbody>
</table>`;
}

/**
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.commercialSummaryHtml] — HTML ya armado o vacío
 * @param {Array} [opts.commercialLines]
 * @param {Array} [opts.detailRows]
 * @param {string} [opts.projectName]
 * @param {string[]} [opts.blockers]
 * @param {string[]} [opts.referenceFiles]
 * @param {string} [opts.listLayout] — `family_day_docx_v1` | `mirror_v1` | `formato_life_v1`
 * @param {string} [opts.detailLayout] — alias de listLayout
 * @param {string} [opts.designNotes]
 * @param {string} [opts.mirrorHtml] — HTML espejo prearmado
 * @param {Array<Array>} [opts.mirrorGrid] — grilla Excel cruda
 * @param {string} [opts.sheetName]
 */
function buildOdooOrderNoteHtml(opts = {}) {
  const title = stripOppPrefix(compact(opts.title) || "Pedido") || "Pedido";
  const parts = [`<h1>${escapeHtml(title)}</h1>`];

  const summary =
    compact(opts.commercialSummaryHtml) ||
    buildCommercialSummaryHtml(opts.commercialLines || []);
  if (summary) parts.push(summary);

  if (Array.isArray(opts.blockers) && opts.blockers.length) {
    parts.push(
      `<h2>Bloqueadores (confirmar)</h2>
<ul>
  ${opts.blockers.map((b) => `<li>${escapeHtml(b)}</li>`).join("\n  ")}
</ul>`
    );
  }

  const detailRows = opts.detailRows || [];
  const listLayout = compact(opts.listLayout || opts.detailLayout || "");
  const mirrorHtml =
    compact(opts.mirrorHtml) ||
    (opts.mirrorGrid?.length
      ? buildExcelMirrorHtml(opts.mirrorGrid, {
          sheetName: opts.sheetName,
          title: opts.mirrorTitle,
        })
      : "");
  const preferMirror =
    Boolean(mirrorHtml) &&
    (/^mirror/i.test(listLayout) ||
      listLayout === "generic" ||
      opts.useMirror === true ||
      !detailRows.length);

  if (preferMirror) {
    parts.push(mirrorHtml);
  } else {
    const useFamilyGrouping =
      listLayout === "family_day_docx_v1" || isFamilyDayListRows(detailRows);

    const groups = groupDetailRows(detailRows);

    if (useFamilyGrouping) {
      const famSummary = buildFamilyDayProductSummary(detailRows);
      if (famSummary) parts.push(famSummary);
      const familyTables = buildFamilyGroupedTables(detailRows);
      if (familyTables.length) parts.push(...familyTables);
    } else {
      const variantSummary = buildVariantSummaryHtml(detailRows);
      if (variantSummary) parts.push(variantSummary);

      const groupedTables = buildGroupedDetailTables(detailRows);
      if (groupedTables.length) {
        parts.push(...groupedTables);
      } else {
        if (groups.masculino.length) {
          parts.push(
            buildDetailTableHtml(
              "Lista de jugadores (Masculino)",
              groups.masculino.map((x) => x.row)
            )
          );
        }
        if (groups.femenino.length) {
          parts.push(
            buildDetailTableHtml(
              "Lista de jugadoras (Femenino)",
              groups.femenino.map((x) => x.row)
            )
          );
        }
        if (groups.general.length) {
          parts.push(
            buildDetailTableHtml(
              "Lista de detalle",
              groups.general.map((x) => x.row)
            )
          );
        }
      }
    }
  }

  if (compact(opts.designNotes)) {
    parts.push(`<p>${escapeHtml(opts.designNotes)}</p>`);
  }

  if (Array.isArray(opts.referenceFiles) && opts.referenceFiles.length) {
    parts.push(
      `<h2>Archivos de referencia</h2>
<ul>
  ${opts.referenceFiles.map((f) => `<li>${escapeHtml(f)}</li>`).join("\n  ")}
</ul>`
    );
  }

  if (compact(opts.projectName)) {
    parts.push(`<p>Proyecto: ${escapeHtml(opts.projectName)}</p>`);
  }

  return parts.join("\n\n<hr>\n\n");
}

function resolveOrderNoteHtml(vars = {}, draftPayload = {}) {
  const orderDraft = vars.order_draft || {};
  const prebuilt = compact(
    orderDraft.notes_for_odoo || draftPayload.order_note_html || vars.quote?.order_note_html
  );
  // Solo respetar prebuilt si ya trae tablas de lista / espejo (no atajos E2E narrativos).
  const looksLikeLista =
    /<table[\s>]/i.test(prebuilt) ||
    /Lista de jugador/i.test(prebuilt) ||
    /espejo Excel/i.test(prebuilt) ||
    /Resumen por variante/i.test(prebuilt);
  if (prebuilt.length > 80 && prebuilt.includes("<") && looksLikeLista) return prebuilt;

  const detailRows =
    orderDraft.detail?.rows ||
    orderDraft.detail_rows ||
    vars.order_details?.lines ||
    draftPayload.detail_rows ||
    [];

  const commercialLines =
    orderDraft.commercial?.lines ||
    draftPayload.rows ||
    draftPayload.commercial_lines ||
    (draftPayload.product_text
      ? [
          {
            name: draftPayload.product_text,
            quantity: draftPayload.quantity,
            variant_notes: [
              draftPayload.variant,
              draftPayload.material,
              Object.values(draftPayload.product_attributes || {}).join(", "),
            ]
              .filter(Boolean)
              .join(" · "),
          },
        ]
      : []);

  const title =
    stripOppPrefix(
      compact(orderDraft.title) ||
        compact(draftPayload.order_or_team_name_for_billing) ||
        compact(vars.quote?.order_or_team_name_for_billing) ||
        compact(vars.quote?.customer_display_name) ||
        compact(vars.lead?.name) ||
        compact(vars.crm?.opportunity_name) ||
        ""
    ) || "Pedido";

  const listLayout =
    orderDraft.detail?.excel_layout ||
    orderDraft.detail?.layout ||
    draftPayload.detail_layout ||
    null;

  return buildOdooOrderNoteHtml({
    title,
    commercialLines,
    detailRows,
    listLayout,
    mirrorHtml: orderDraft.detail?.mirror_html || draftPayload.mirror_html || null,
    mirrorGrid: orderDraft.detail?.mirror_grid || draftPayload.mirror_grid || null,
    sheetName: orderDraft.detail?.sheet_name || draftPayload.sheet_name || null,
    projectName:
      orderDraft.project?.name ||
      vars.user?.odoo_project_name ||
      null,
    blockers: orderDraft.blockers || [],
    referenceFiles: orderDraft.reference_files || [],
    designNotes: orderDraft.design_notes || null,
  });
}
// <<BUILD_ODOO_ORDER_NOTE_END>>

// <<ODOO_ATTACH_START>>
function guessAttachmentMime(filename, mimeType) {
  const mime = String(mimeType ?? "").trim();
  if (mime) return mime;
  const name = String(filename ?? "").toLowerCase();
  if (name.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (name.endsWith(".xls")) return "application/vnd.ms-excel";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpeg") || name.endsWith(".jpg")) return "image/jpeg";
  return "application/octet-stream";
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function attachOrderDraftFiles(executeKw, orderId, attachments, resModel = "sale.order") {
  const list = Array.isArray(attachments) ? attachments : [];
  const uploaded = [];
  const errors = [];
  for (const att of list) {
    const url = String(att?.url ?? "").trim();
    if (!url.startsWith("http")) continue;
    const name = String(att?.filename ?? "adjunto").trim() || "adjunto";
    try {
      const existing = await executeKw("ir.attachment", "search", [
        [
          ["res_model", "=", resModel],
          ["res_id", "=", orderId],
          ["name", "=", name],
        ],
      ], { limit: 1 });
      if (Array.isArray(existing) && existing.length) {
        uploaded.push({ name, skipped: true, id: existing[0], res_model: resModel });
        continue;
      }
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`download_failed:${resp.status}`);
      const bytes = new Uint8Array(await resp.arrayBuffer());
      // Odoo 19: `datas` = base64; `raw` espera binario — usar datas por XML-RPC/JSON.
      const attId = await executeKw("ir.attachment", "create", [
        {
          name,
          res_model: resModel,
          res_id: orderId,
          type: "binary",
          mimetype: guessAttachmentMime(name, att?.mime_type),
          datas: bytesToBase64(bytes),
        },
      ]);
      uploaded.push({ name, id: attId, role: att?.role || null, res_model: resModel });
    } catch (err) {
      errors.push({ name, error: String(err?.message || err), res_model: resModel });
    }
  }
  return { uploaded, errors };
}

/** Junta adjuntos de order_draft, media_refs y URLs Kapso en vars/texto del hilo. */
function collectOrderAttachments(vars = {}) {
  const out = [];
  const seen = new Set();
  const push = (att = {}) => {
    const url = String(att.url || "").trim();
    if (!url.startsWith("http")) return;
    const filename =
      String(att.filename || att.name || "").trim() ||
      url.split("/").pop()?.split("?")[0] ||
      "adjunto";
    const key = `${url}|${filename}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      url,
      filename,
      mime_type: att.mime_type || att.mimetype || null,
      role: att.role || "design_reference",
    });
  };

  for (const att of vars?.order_draft?.attachments || []) push(att);
  for (const att of vars?.order_draft?.detail?.attachments || []) push(att);
  for (const ref of vars?.quote?.media_refs || []) {
    push({
      url: ref.url || ref.file_url,
      filename: ref.filename || ref.name,
      mime_type: ref.mime_type,
      role: ref.role || "design_reference",
    });
  }

  const blobs = [
    vars?.last_user_input,
    vars?.last_user_text,
    vars?.staff?.lane_reply,
    vars?.staff?.last_user_text,
    vars?.intent?.raw_text,
    JSON.stringify(vars?.order_draft?.attachments || []),
  ]
    .map((t) => String(t || ""))
    .join("\n");

  const urlRe =
    /https:\/\/app\.kapso\.ai\/rails\/active_storage\/blobs\/redirect\/[^\s"'<>]+/gi;
  let m;
  while ((m = urlRe.exec(blobs))) {
    const url = m[0].replace(/[),.;]+$/, "");
    const filename = url.split("/").pop() || "kapso-media.jpeg";
    const role = /lista|talla|excel|xlsx|csv/i.test(filename)
      ? "detail_list"
      : "design_reference";
    push({ url, filename, role });
  }

  return out;
}
// <<ODOO_ATTACH_END>>

function stableOrderFingerprint(vars, draftPayload, commercialLines, now) {
  const attachments = Array.isArray(vars?.order_draft?.attachments)
    ? vars.order_draft.attachments.map((item) => String(item?.filename || item?.url || "")).sort()
    : [];
  const lines = (commercialLines || [])
    .map((line) => ({
      product: Number(line.odoo_product_id || line.product_id || 0) || String(line.product_text || line.name || ""),
      quantity: Number(line.quantity || 0),
      variant: String(line.variant_notes || ""),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify({
    day: String(draftPayload?.built_at || now).slice(0, 10),
    staff_wa_id: String(vars?.user?.wa_id || ""),
    customer: String(
      draftPayload?.customer_display_name ||
        draftPayload?.order_or_team_name_for_billing ||
        vars?.quote?.customer_display_name ||
        ""
    )
      .trim()
      .toLowerCase(),
    lines,
    attachments,
  });
}

async function buildOrderIdempotencyKey(vars, draftPayload, commercialLines, now) {
  const fingerprint = stableOrderFingerprint(vars, draftPayload, commercialLines, now);
  const bytes = new TextEncoder().encode(fingerprint);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `KAPSO:${hex.slice(0, 32)}`;
}

/** Extrae nombre de cliente del hilo staff cuando quote.* no viene anidado. */
function orderDraftCustomerHint(vars = {}) {
  const draftName = String(vars?.order_draft?.customer_display_name || "").trim();
  if (draftName) return draftName;
  const blobs = [
    vars?.intent?.raw_text,
    vars?.last_user_input,
    vars?.staff_lane_reply,
    vars?.context?.agent_last_message,
  ]
    .map((t) => String(t || ""))
    .join("\n");
  const m =
    blobs.match(/Cliente(?:\s+nuevo)?\s*:\s*\*?\*?([^*\n.]{2,80})/i) ||
    blobs.match(/Cliente\s+([A-ZÁÉÍÓÚÑ0-9][^\n.]{1,60})/i) ||
    blobs.match(/Marker:[^\n]*\bC\d+\b[^\n]*·\s*([^\n]+)/i);
  if (!m) return "";
  return String(m[1] || "")
    .replace(/\*\*/g, "")
    .replace(/\(historia\)|\(nuevo\)/gi, "")
    .trim()
    .slice(0, 80);
}

/** LIFE_DOSSIER_v1 — pedido vivo multi-semana (inline; odoo_create es bundle monolítico). */
function buildLifeDossierPlainInline(quote = {}, meta = {}) {
  const compact = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
  const money = (n) => {
    const v = Number(n || 0);
    if (!v) return null;
    return `$${Math.round(v).toLocaleString("es-CO")}`;
  };
  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  // Teléfono NUNCA en description — solo campo phone / partner.
  const out = [
    "LIFE_DOSSIER_v1",
    `cliente: ${compact(meta.customer_name || quote.customer_display_name) || "—"}`,
    `estado: ${compact(quote.status) || "cotizando"}`,
    `revision: ${Number(quote.revision || 1) || 1}`,
    `updated_at: ${compact(quote.updated_at) || new Date().toISOString()}`,
    `qty: ${quote.quantity ?? "—"}`,
  ];
  if (lines.length) {
    out.push("opciones:");
    for (const l of lines) {
      const unit = money(l.unit_cop);
      const total = money(l.total_cop);
      const priceBit =
        unit && total ? `${unit} → ${total}` : unit || total || "sin precio";
      out.push(
        `  - ${compact(l.product_text) || "producto"}${l.quantity != null ? ` x${l.quantity}` : ""}: ${priceBit}`
      );
    }
  } else if (compact(quote.product_text)) {
    out.push("opciones:");
    const unit = money(quote.unit_cop);
    const total = money(quote.total_cop);
    const priceBit =
      unit && total ? `${unit} → ${total}` : unit || total || "sin precio";
    out.push(
      `  - ${compact(quote.product_text)}${quote.quantity != null ? ` x${quote.quantity}` : ""}: ${priceBit}`
    );
  }
  const v = quote.variants || {};
  const variantBits = [v.material, v.collar, v.sleeves, v.sport].filter((x) => compact(x));
  if (variantBits.length) out.push(`variantes: ${variantBits.join(", ")}`);
  if (compact(quote.notes)) out.push(`personalizacion: ${compact(quote.notes)}`);
  const media = Array.isArray(quote.media_refs) ? quote.media_refs : [];
  if (media.length) {
    out.push("media:");
    for (const m of media.slice(0, 8)) {
      out.push(`  - [${compact(m.role) || "design"}] ${compact(m.summary || m.url) || "ref"}`);
    }
  }
  return out.join("\n");
}

/**
 * Brief comercial corto para crm.lead.description (sin tablas de lista).
 * La lista HTML va solo a sale.order.note / project.task.description.
 */
function resolveCrmOpportunityBrief(vars = {}, draftPayload = {}, _orderNoteHtml = "") {
  const quote = vars.quote || {};
  const draft = vars.order_draft || {};
  const estimate = quote.estimate || draft.commercial?.estimate || null;
  const customer =
    stripOppPrefix(
      compact(
        draftPayload.customer_display_name ||
          quote.customer_display_name ||
          draft.customer_display_name ||
          vars["quote.customer_display_name"] ||
          ""
      )
    ) || "Cliente";

  const lines = [];
  const resolved =
    (Array.isArray(draft.commercial?.resolved_lines) && draft.commercial.resolved_lines) ||
    (Array.isArray(draftPayload.resolved_lines) && draftPayload.resolved_lines) ||
    (Array.isArray(draftPayload.rows) && draftPayload.rows) ||
    [];
  for (const line of resolved) {
    const name = compact(line.product_text || line.product_base || line.name || line.label || "");
    const qty = Math.max(0, Number(line.quantity || line.product_uom_qty || 0) || 0);
    if (!name || !qty) continue;
    const unit = Number(line.unit_cop || line.unit_price || line.price_unit || 0) || null;
    lines.push({ name, qty, unit });
  }
  if (!lines.length && (estimate?.quantity || quote.quantity || draftPayload.quantity)) {
    lines.push({
      name: compact(
        estimate?.product_text || quote.product_text || draftPayload.product_text || "Pedido"
      ),
      qty: Math.max(
        1,
        Number(estimate?.quantity || quote.quantity || draftPayload.quantity || 1) || 1
      ),
      unit: Number(estimate?.unit_cop || quote.unit_cop || draftPayload.unit_cop || 0) || null,
    });
  }

  const parts = [`<p><strong>${escapeHtml(customer)}</strong></p>`];
  if (lines.length) {
    parts.push("<ul>");
    for (const line of lines) {
      const price =
        line.unit && line.qty
          ? ` · ~$${Math.round(line.unit * line.qty).toLocaleString("es-CO")}`
          : line.unit
            ? ` · $${Math.round(line.unit).toLocaleString("es-CO")} c/u`
            : "";
      parts.push(
        `<li>${escapeHtml(line.name)} × ${line.qty}${escapeHtml(price)}</li>`
      );
    }
    parts.push("</ul>");
  }
  if (estimate?.provisional || estimate?.source) {
    parts.push(
      `<p><em>Estimado inicial${estimate.source ? ` (${escapeHtml(String(estimate.source))})` : ""} — se refina en presupuesto.</em></p>`
    );
  }
  const notes = compact(quote.notes || draftPayload.customer_notes || draft.notes || "");
  if (notes) parts.push(`<p>${escapeHtml(notes)}</p>`);
  return parts.join("\n");
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const executionContext = body?.execution_context || {};
  const vars = executionContext.vars || {};
  const now = new Date().toISOString();

  const draftPayload = input.draft_payload || vars?.quote?.draft_payload || null;
  const isStaffUploader = vars?.user?.role === "staff";
  const staffUserId = vars?.user?.odoo_user_id || vars?.user?.user_id || undefined;
  const writeMode = resolveStaffWriteMode(input, vars);
  const customerWaId = String(
    input.customer_wa_id ||
      draftPayload?.customer_wa_id ||
      vars?.quote?.customer_wa_id ||
      (!isStaffUploader ? vars?.user?.wa_id : "") ||
      ""
  ).trim();
  const ODOO_URL = env.ODOO_URL;
  const ODOO_DB = env.ODOO_DB;
  const ODOO_USERNAME = env.ODOO_USERNAME;
  const ODOO_PASSWORD = env.ODOO_PASSWORD;
  const designProductId =
    Number(
      draftPayload?.design_product_id ||
        vars?.quote?.design_product_id ||
        env?.LIFE_DESIGN_PRODUCT_ID ||
        0
    ) || null;

  if (!draftPayload) {
    return jsonError(
      400,
      "Missing draft_payload; call build_quote_payload first.",
      now,
      "Todavia no tengo el borrador del pedido; vamos cerrando detalles para armarlo."
    );
  }
  if (writeMode !== "opportunity_only" && !designProductId) {
    return jsonError(
      400,
      "Missing design_product_id (required for mandatory design line).",
      now,
      "No pude crear la cotizacion porque falta configurar el producto Diseno."
    );
  }
  if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
    return jsonError(
      500,
      "Missing Odoo credentials in function secrets.",
      now,
      "No pude conectar con Odoo en este momento. Lo escalo para continuarlo sin frenarte."
    );
  }

  const orderDraftEarly = vars?.order_draft || {};
  const resolvedFromDraft = Array.isArray(orderDraftEarly.commercial?.resolved_lines)
    ? orderDraftEarly.commercial.resolved_lines
    : Array.isArray(draftPayload.resolved_lines)
      ? draftPayload.resolved_lines
      : [];
  // Lista de jugadores gana sobre qty exploratoria del quote (ej. qty=1 vs 15 filas).
  const detailQty = Math.max(
    0,
    Number(orderDraftEarly?.lifecycle?.detail_quantity || 0) ||
      (Array.isArray(orderDraftEarly?.detail?.rows)
        ? orderDraftEarly.detail.rows.length
        : 0) ||
      (Array.isArray(draftPayload?.detail_rows) ? draftPayload.detail_rows.length : 0) ||
      0
  );
  if (resolvedFromDraft.length) {
    const resolvedRows = resolvedFromDraft
      .filter((line) => Number(line.product_variant_id || line.odoo_product_id || 0) > 0)
      .map((line) => {
        let quantity = Math.max(1, Number(line.quantity || 1));
        if (
          detailQty > quantity &&
          resolvedFromDraft.length === 1 &&
          /uniforme|camiseta/i.test(
            String(line.product_text || line.product_base || line.name || "")
          )
        ) {
          quantity = detailQty;
        }
        return {
          product_id: Number(line.product_variant_id || line.odoo_product_id),
          name: line.product_base || line.product_text || line.name,
          product_text: line.product_text || line.product_base || line.name,
          quantity,
          unit_price: Number(line.unit_cop || line.unit_price || 0),
          category: line.category || null,
          commercial_role: line.commercial_role || null,
          line_id: line.line_id || null,
          attributes: line.attributes || {},
          comments: line.comments || "",
        };
      });
    if (resolvedRows.length) {
      draftPayload.rows = resolvedRows;
      draftPayload.resolved_lines = resolvedFromDraft.map((line, idx) => ({
        ...line,
        quantity: resolvedRows[idx]?.quantity ?? line.quantity,
      }));
      if (detailQty > 0) {
        draftPayload.quantity = Math.max(Number(draftPayload.quantity || 0), detailQty);
      }
    }
  }

  const commercialLines = buildOrderLinesFromDraft(draftPayload, null, null);
  const designExplorationFlag = (() => {
    const kind = String(
      vars?.quote?.order_kind ||
        vars?.order_draft?.commercial?.mode ||
        vars?.quote?.status ||
        ""
    ).toLowerCase();
    if (
      /dise[nñ]o[_ ]?exploraci|solo[_ ]?dise[nñ]o|design[_ ]?exploration|muestra[_ ]?dise[nñ]o|esperando_aprobaci[oó]n_dise[nñ]o/.test(
        kind
      )
    ) {
      return true;
    }
    const blob = [
      vars?.quote?.notes,
      vars?.staff?.last_inbound_text,
      vars?.intent?.raw_text,
      vars?.staff_lane_reply,
    ]
      .map((t) => String(t || ""))
      .join("\n");
    return /\b(solo\s+dise[nñ]o|explor(ar|aci[oó]n)\s+(el\s+)?dise[nñ]o|muestra\s+(de\s+)?dise[nñ]o|1\s+uniforme\s+(de\s+)?(muestra|dise[nñ]o)|uniforme\s+de\s+muestra)\b/i.test(
      blob
    );
  })();
  const commercialValidation = validateCommercialOrder({
    lines: commercialLines,
    uniformBaseMinQty: UNIFORM_BASE_MIN_QTY,
    allowDesignExploration: designExplorationFlag,
  });
  // CRM-first: opportunity_only no debe morir por qty exploratoria; SO sí exige mínimo
  // salvo exploración de diseño (solo diseño / 1 uniforme de muestra).
  if (!commercialValidation.ok && writeMode !== "opportunity_only") {
    return jsonError(
      422,
      `Commercial validation failed: ${commercialValidation.code}`,
      now,
      commercialValidation.message_es
    );
  }

  const rpc = async (service, method, args) => {
    const resp = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { service, method, args },
      }),
    });
    const json = await resp.json();
    if (json?.error) {
      const detail =
        json.error?.data?.message ||
        json.error?.data?.debug ||
        json.error?.message ||
        "Odoo RPC error";
      throw new Error(String(detail).slice(0, 500));
    }
    return json.result;
  };

  const executeKw = async (uid, model, method, positionalArgs = [], kw = {}) =>
    rpc("object", "execute_kw", [ODOO_DB, uid, ODOO_PASSWORD, model, method, positionalArgs, kw]);

  try {
    const uid = await rpc("common", "authenticate", [
      ODOO_DB,
      ODOO_USERNAME,
      ODOO_PASSWORD,
      {},
    ]);
    if (!uid) {
      throw new Error("Odoo authentication failed");
    }

    const idempotencyKey =
      String(input.idempotency_key || draftPayload.idempotency_key || "").trim() ||
      (await buildOrderIdempotencyKey(
        vars,
        draftPayload,
        commercialLines,
        now
      ));

    // Retomar SO existente: (1) order_id explícito / vars.order / corrección staff,
    // (2) idempotency client_order_ref. Solo draft|sent.
    const resumeOrderId =
      Number(
        input.order_id ||
          vars?.order_correction?.target_order_id ||
          vars?.order?.id ||
          vars?.order_draft?.write?.odoo_order_id ||
          0
      ) || 0;
    let existingOrder = null;
    if (resumeOrderId) {
      const byId = await executeKw(
        uid,
        "sale.order",
        "search_read",
        [[["id", "=", resumeOrderId], ["state", "in", ["draft", "sent"]]]],
        {
          fields: ["id", "name", "state", "amount_total", "partner_id", "opportunity_id"],
          limit: 1,
        }
      );
      existingOrder = Array.isArray(byId) ? byId[0] : null;
    }
    if (!existingOrder && idempotencyKey) {
      const existingOrders = await executeKw(
        uid,
        "sale.order",
        "search_read",
        [[["client_order_ref", "=", idempotencyKey], ["state", "in", ["draft", "sent"]]]],
        {
          fields: ["id", "name", "state", "amount_total", "partner_id", "opportunity_id"],
          limit: 1,
        }
      );
      existingOrder = Array.isArray(existingOrders) ? existingOrders[0] : null;
    }
    let orderId = existingOrder?.id || null;
    let leadId =
      Number(
        input.lead_id ||
          input.opportunity_id ||
          vars?.lead?.id ||
          vars?.crm?.opportunity_id ||
          0
      ) ||
      (existingOrder?.opportunity_id
        ? Array.isArray(existingOrder.opportunity_id)
          ? existingOrder.opportunity_id[0]
          : existingOrder.opportunity_id
        : null);
    let partnerId = existingOrder?.partner_id
      ? Array.isArray(existingOrder.partner_id)
        ? existingOrder.partner_id[0]
        : existingOrder.partner_id
      : null;
    const resumed = Boolean(orderId);

    const customerDisplayName =
      stripOppPrefix(
        String(draftPayload.customer_display_name || "").trim() ||
          String(draftPayload.order_or_team_name_for_billing || "").trim() ||
          String(vars?.quote?.customer_display_name || "").trim() ||
          String(vars?.quote?.order_or_team_name_for_billing || "").trim() ||
          // Kapso a veces guarda claves planas (bug de save_variable del agente)
          String(vars?.["quote.customer_display_name"] || "").trim() ||
          String(vars?.["quote.order_or_team_name_for_billing"] || "").trim() ||
          String(orderDraftCustomerHint(vars) || "").trim() ||
          String(vars?.lead?.name || "").trim() ||
          String(vars?.crm?.opportunity_name || "").trim() ||
          (!isStaffUploader ? String(vars?.user?.name || "").trim() : "") ||
          ""
      ) ||
      (customerWaId ? `Cliente WhatsApp ${customerWaId}` : "Cliente Life");
    const billingIsThirdParty = Boolean(draftPayload.billing_is_third_party);
    const orderOrTeamNameForBilling =
      stripOppPrefix(String(draftPayload.order_or_team_name_for_billing || "").trim()) ||
      null;
    const productText = String(draftPayload.product_text || "").trim();
    const quantity = Math.max(1, Number(draftPayload.quantity || 1));
    const orderDraft = vars?.order_draft || {};
    const lifecycle = orderDraft?.lifecycle || {};
    const isPartialDraft = lifecycle?.state === "draft_partial";
    const crossCheck = orderDraft?.spreadsheet?.cross_check || null;
    const needsReview =
      isPartialDraft ||
      vars?.staff?.input_route?.mode === "agent_normalize" ||
      orderDraft?.detail?.parse_status === "partial" ||
      orderDraft?.detail?.parse_status === "needs_review" ||
      Boolean(orderDraft?.blockers?.length) ||
      Boolean(orderDraft?.detail?.warnings?.length) ||
      (crossCheck && crossCheck.ok === false) ||
      orderDraft?.write?.status === "needs_human_reconcile";

    const odooExecuteKw = (model, method, positionalArgs = [], kw = {}) =>
      executeKw(uid, model, method, positionalArgs, kw);

    if (!partnerId) {
      if (customerWaId) {
        const partnerLookup = await findPartnerByWaPhone(odooExecuteKw, customerWaId, {
          fields: ["id", "name", "phone", "phone_sanitized"],
        });
        partnerId = partnerLookup?.partner?.id || null;
      }
      if (!partnerId && customerDisplayName && customerDisplayName !== "Cliente Life") {
        const nameLookup = await findPartnerByName(odooExecuteKw, customerDisplayName, {
          fields: ["id", "name", "phone", "phone_sanitized"],
        });
        partnerId = nameLookup?.partner?.id || null;
      }
      if (!partnerId) {
        const normalizedWa = normalizeWaPhone(customerWaId);
        partnerId = await executeKw(uid, "res.partner", "create", [
          partnerCreateVals(customerDisplayName, normalizedWa.e164Plus ? normalizedWa : null, {
            comment: draftPayload.customer_notes || false,
          }),
        ]);
      }
    }

    const leadName = stripOppPrefix(customerDisplayName) || customerDisplayName;
    let orderNoteHtml =
      String(draftPayload.order_note_html || "").trim() ||
      resolveOrderNoteHtml(vars, draftPayload);
    if (isPartialDraft) {
      const pending = Array.isArray(lifecycle.missing_fields)
        ? lifecycle.missing_fields.join(", ")
        : "datos por completar";
      orderNoteHtml = `<p><strong>BORRADOR PARCIAL — NO CONFIRMAR:</strong> faltan ${pending}. El pedido comercial puede continuar acumulando información, pero no debe confirmarse ni liberarse a producción.</p>\n${orderNoteHtml}`;
    } else if (needsReview) {
      orderNoteHtml = `<p><strong>REVISAR BORRADOR:</strong> ingreso agentico, organización parcial de los datos o descuadre lista↔cantidades. Validar líneas y Formulario antes de confirmar.</p>\n${orderNoteHtml}`;
    }

    // CRM description = brief comercial. Lista organizada → solo sale.order.note (abajo).
    const crmBrief = resolveCrmOpportunityBrief(vars, draftPayload, orderNoteHtml);

    if (!leadId) {
      // Retomar opp manual (Canal Ventas): partner, nombre "Oportunidad de X", o teléfono
      const teamKey = String(leadName || "")
        .replace(/^oportunidad\s+de\s+/i, "")
        .trim();
      const phoneDigits = String(customerWaId || "").replace(/\D/g, "");
      const local10 = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : "";

      if (partnerId) {
        const byPartner = await executeKw(
          uid,
          "crm.lead",
          "search_read",
          [
            [
              ["partner_id", "=", partnerId],
              ["type", "=", "opportunity"],
              ["active", "=", true],
              ["won_status", "=", "pending"],
            ],
          ],
          { fields: ["id", "name", "description"], limit: 5, order: "id desc" }
        );
        if (Array.isArray(byPartner) && byPartner.length) {
          const exactName = byPartner.find(
            (r) =>
              String(r.name || "").toLowerCase() === String(leadName || "").toLowerCase() ||
              String(r.name || "")
                .replace(/^oportunidad\s+de\s+/i, "")
                .toLowerCase() === teamKey.toLowerCase()
          );
          leadId = (exactName || byPartner[0]).id;
        }
      }

      if (!leadId && teamKey) {
        const byName = await executeKw(
          uid,
          "crm.lead",
          "search_read",
          [
            [
              ["type", "=", "opportunity"],
              ["active", "=", true],
              ["won_status", "=", "pending"],
              "|",
              ["name", "ilike", teamKey],
              ["name", "ilike", `Oportunidad de ${teamKey}`],
            ],
          ],
          { fields: ["id", "name", "description"], limit: 5, order: "id desc" }
        );
        leadId = Array.isArray(byName) && byName.length ? byName[0].id : null;
      }
      if (!leadId && local10) {
        const byPhone = await executeKw(
          uid,
          "crm.lead",
          "search_read",
          [
            [
              ["phone", "ilike", local10],
              ["type", "=", "opportunity"],
              ["active", "=", true],
              ["won_status", "=", "pending"],
            ],
          ],
          { fields: ["id", "description"], limit: 1, order: "id desc" }
        );
        leadId = byPhone?.[0]?.id || null;
      }
      if (!leadId && teamKey) {
        const byName = await executeKw(
          uid,
          "crm.lead",
          "search_read",
          [
            [
              ["name", "ilike", teamKey],
              ["type", "=", "opportunity"],
              ["active", "=", true],
              ["won_status", "=", "pending"],
            ],
          ],
          { fields: ["id", "description"], limit: 1, order: "id desc" }
        );
        leadId = byName?.[0]?.id || null;
      }
      if (leadId && crmBrief) {
        const cur = await executeKw(
          uid,
          "crm.lead",
          "search_read",
          [[["id", "=", leadId]]],
          { fields: ["description"], limit: 1 }
        );
        const curDesc = String(cur?.[0]?.description || "");
        if (!curDesc.trim() || curDesc === "False") {
          const leadWriteVals = { description: crmBrief };
          if (crmProbability != null) leadWriteVals.probability = crmProbability;
          if (staffUserId) leadWriteVals.user_id = staffUserId;
          await executeKw(uid, "crm.lead", "write", [[leadId], leadWriteVals]);
        }
      }
    }
    if (!leadId) {
      // Evitar duplicar lead: buscar por partner + nombre reciente (exacto legado)
      const existingLeads = await executeKw(
        uid,
        "crm.lead",
        "search_read",
        [[["partner_id", "=", partnerId], ["name", "=", leadName]]],
        { fields: ["id", "description"], limit: 1, order: "id desc" }
      );
      leadId = existingLeads?.[0]?.id || null;
      if (leadId && crmBrief) {
        const curDesc = String(existingLeads[0].description || "");
        if (!curDesc.trim() || curDesc === "False") {
          const leadWriteVals = { description: crmBrief };
          if (crmProbability != null) leadWriteVals.probability = crmProbability;
          if (staffUserId) leadWriteVals.user_id = staffUserId;
          await executeKw(uid, "crm.lead", "write", [[leadId], leadWriteVals]);
        }
      }
    }
    if (!leadId) {
      const leadCreateVals = {
        name: leadName,
        partner_id: partnerId,
        contact_name: customerDisplayName,
        phone: customerWaId || false,
        description: crmBrief || false,
        type: "opportunity",
        probability: crmProbability,
      };
      if (staffUserId) leadCreateVals.user_id = staffUserId;
      leadId = await executeKw(uid, "crm.lead", "create", [leadCreateVals]);
    }
    // Si ya había lead: no sobrescribir description con HTML de lista.
    // (Corrección/lista solo toca sale.order.note + task.description.)

    const leadUrl = `${String(ODOO_URL).replace(/\/$/, "")}/odoo/crm/${leadId}`;
    const amountEstimated = commercialLines.reduce(
      (sum, line) =>
        sum + Math.max(1, Number(line.quantity || 1)) * Number(line.unit_price || line.unit_cop || 0),
      0
    );

    // Staff etapa 1: solo oportunidad CRM (sin sale.order).
    // Pedido vivo multi-semana: descripción lleva LIFE_DOSSIER_v1 (+ nota operativa).
    if (writeMode === "opportunity_only") {
      const dossierQuote = {
        ...(vars.quote || {}),
        product_text:
          vars.quote?.product_text ||
          commercialLines[0]?.label ||
          commercialLines[0]?.name ||
          null,
        quantity:
          vars.quote?.quantity ||
          commercialLines.reduce((s, l) => s + Math.max(1, Number(l.quantity || 1)), 0) ||
          null,
        unit_cop: vars.quote?.unit_cop || commercialLines[0]?.unit_price || null,
        total_cop: vars.quote?.total_cop || amountEstimated || null,
        lines:
          vars.quote?.lines ||
          commercialLines.map((l) => ({
            product_text: l.label || l.name || l.product_text,
            quantity: l.quantity,
            unit_cop: l.unit_price || l.unit_cop,
            total_cop:
              Math.max(1, Number(l.quantity || 1)) *
              Number(l.unit_price || l.unit_cop || 0),
          })),
        variants: vars.quote?.variants || {},
        notes: vars.quote?.notes || draftPayload.customer_notes || null,
        media_refs: vars.quote?.media_refs || [],
        status: vars.quote?.status || "cotizando",
        revision: vars.quote?.revision || 1,
      };
      const dossierPlain = buildLifeDossierPlainInline(dossierQuote, {
        customer_name: customerDisplayName,
        customer_phone: customerWaId,
      }).replace(/^\s*telefono\s*:.*$/gim, "").replace(/\n{3,}/g, "\n\n").trim();
      const dossierHtml = `<pre>${String(dossierPlain).replace(/</g, "&lt;")}</pre>`;
      // opportunity_only: brief CRM + dossier. Nunca volcar lista Excel a description.
      // Teléfono solo en campo phone — no en description.
      let opportunityDescription = String(crmBrief || "")
        .replace(/^\s*telefono\s*:.*$/gim, "")
        .replace(/\sphone=\d+/gi, "")
        .trim();
      if (String(opportunityDescription).includes("LIFE_DOSSIER_v1")) {
        opportunityDescription = String(opportunityDescription)
          .replace(/<pre>[\s\S]*?LIFE_DOSSIER_v1[\s\S]*?<\/pre>/i, dossierHtml)
          .replace(/LIFE_DOSSIER_v1[\s\S]*?(?=\n\n|$)/, dossierPlain);
        if (!String(opportunityDescription).includes("LIFE_DOSSIER_v1")) {
          opportunityDescription = `${opportunityDescription}\n\n${dossierHtml}`;
        }
      } else if (opportunityDescription) {
        opportunityDescription = `${opportunityDescription}\n\n${dossierHtml}`;
      } else {
        opportunityDescription = dossierHtml;
      }
      await executeKw(uid, "crm.lead", "write", [
        [leadId],
        { description: opportunityDescription },
      ]);

      const leadAttachments = collectOrderAttachments(vars);
      let leadAttachmentUpload = { uploaded: [], errors: [] };
      if (leadAttachments.length) {
        const odooKwLead = (model, method, positionalArgs = [], kw = {}) =>
          executeKw(uid, model, method, positionalArgs, kw);
        leadAttachmentUpload = await attachOrderDraftFiles(
          odooKwLead,
          leadId,
          leadAttachments,
          "crm.lead"
        );
        const uploadedIds = (leadAttachmentUpload.uploaded || [])
          .map((u) => u.id)
          .filter(Boolean);
        if (uploadedIds.length) {
          try {
            await executeKw(uid, "crm.lead", "message_post", [[leadId]], {
              body: "<p>Adjuntos staff (lista / referencias de diseño).</p>",
              attachment_ids: uploadedIds,
              message_type: "comment",
            });
          } catch (_) {
            /* chatter opcional */
          }
        }
      }

      return new Response(
        JSON.stringify({
          vars: {
            lead: {
              id: leadId,
              name: leadName,
              url: leadUrl,
            },
            order_draft: {
              ...(orderDraft || {}),
              ...(vars.order_draft || {}),
              attachments: leadAttachments.length
                ? leadAttachments
                : vars.order_draft?.attachments || orderDraft?.attachments || [],
              write: {
                status: "opportunity_only",
                code: leadId ? "lead_upserted" : "lead_created",
                mode: "opportunity_only",
              },
            },
            staff: {
              ...(vars.staff || {}),
              write_mode: "opportunity_only",
              write_status: "ready",
              write_code: "opportunity_created",
              attachments_uploaded: leadAttachmentUpload.uploaded.length,
              attachments_errors: leadAttachmentUpload.errors,
            },
            quote: {
              ...(vars.quote || {}),
              ...dossierQuote,
              customer_display_name: customerDisplayName,
              amount_estimated: amountEstimated,
              dossier_text: dossierPlain,
            },
            crm: {
              opportunity_id: leadId,
              opportunity_name: leadName,
            },
            service: {
              last_call_name: "activar_cotizacion_odoo",
              last_call_status: "ready",
              last_call_at: now,
              fallback_message: null,
              write_mode: "opportunity_only",
            },
          },
          status: "ready",
          message: "Oportunidad CRM creada/actualizada con LIFE_DOSSIER_v1 (sin presupuesto SO).",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const orderVals = {
      partner_id: partnerId,
      opportunity_id: leadId,
      note: orderNoteHtml || draftPayload.customer_notes || "",
      client_order_ref: idempotencyKey,
    };
    const kapsoProjectId = Number(env.LIFE_KAPSO_PROJECT_ID || 12) || 12;
    if (!isStaffUploader) {
      orderVals.project_id = kapsoProjectId;
    } else if (vars.user?.odoo_project_id) {
      const desc = String(vars.lead?.description || draftPayload?.dossier_text || "");
      orderVals.project_id = /kapso:/i.test(desc)
        ? kapsoProjectId
        : Number(vars.user.odoo_project_id);
    }
    if (staffUserId) orderVals.user_id = staffUserId;

    // Plantilla venta → Calculadora Formulario pedido Life (fórmulas Odoo nativas).
    const quoteTemplateId = await resolveSaleOrderTemplateId(executeKw, uid);
    if (quoteTemplateId) {
      orderVals.sale_order_template_id = quoteTemplateId;
    }
    // Solo setear campo Studio si hay valor; en test puede no existir.
    if (billingIsThirdParty && orderOrTeamNameForBilling) {
      orderVals.x_studio_nombre_de_pedido = orderOrTeamNameForBilling;
    }
    if (!orderId) {
      orderId = await executeKw(uid, "sale.order", "create", [orderVals]);
    } else {
      await executeKw(uid, "sale.order", "write", [[orderId], orderVals]);
    }
    // Hard rule: nunca action_confirm — SO queda en draft; operaria confirma en Odoo.

    const rows = Array.isArray(draftPayload.rows) ? draftPayload.rows : [];
    const existingLines = await executeKw(
      uid,
      "sale.order.line",
      "search_read",
      [[["order_id", "=", orderId]]],
      { fields: ["id", "product_id", "product_uom_qty", "name"], limit: 80 }
    );
    const hasDesignLine =
      (existingLines || []).some((l) => Number(l.product_id?.[0] || 0) === designProductId) ||
      rows.some((row) => Number(row?.product_id || 0) === designProductId);

    if (!hasDesignLine) {
      await executeKw(uid, "sale.order.line", "create", [
        {
          order_id: orderId,
          product_id: designProductId,
          name: "Diseño",
          product_uom_qty: 1,
          price_unit: 0,
        },
      ]);
    }

    for (const row of rows) {
      const productId = Number(row?.product_id || 0);
      if (!productId) continue;
      const matchExisting = (existingLines || []).find(
        (l) => Number(l.product_id?.[0] || 0) === productId
      );
      const qty = Math.max(1, Number(row.quantity || row.product_uom_qty || 1));
      const price = Number(row.unit_price ?? row.price_unit ?? 0);
      if (matchExisting?.id) {
        await executeKw(uid, "sale.order.line", "write", [
          [matchExisting.id],
          {
            product_uom_qty: qty,
            price_unit: price,
            name: row.name || matchExisting.name || false,
          },
        ]);
      } else {
        await executeKw(uid, "sale.order.line", "create", [
          {
            order_id: orderId,
            product_id: productId,
            name: row.name || false,
            product_uom_qty: qty,
            price_unit: price,
          },
        ]);
      }
    }

    // Sobrecostos de precio por tamaño (2XL +$7.000, 3XL+ +$10.000)
    const detailRowsForSurcharges =
      orderDraft.detail?.rows || orderDraft.detail_rows || vars.order_details?.lines || rows || [];
    const sizeSurchargeData = computeSizeSurchargesInline(detailRowsForSurcharges);
    for (const surcharge of sizeSurchargeData.surcharges) {
      const matchExisting = (existingLines || []).find(
        (l) => Number(l.product_id?.[0] || 0) === surcharge.product_id
      );
      if (matchExisting?.id) {
        await executeKw(uid, "sale.order.line", "write", [
          [matchExisting.id],
          {
            product_uom_qty: surcharge.quantity,
            price_unit: surcharge.unit_price,
            name: surcharge.name,
          },
        ]);
      } else {
        await executeKw(uid, "sale.order.line", "create", [
          {
            order_id: orderId,
            product_id: surcharge.product_id,
            name: surcharge.name,
            product_uom_qty: surcharge.quantity,
            price_unit: surcharge.unit_price,
          },
        ]);
      }
    }

    // Solo fallback ilike si NO hay resolved_lines ni rows con product_id
    const hasResolvedIds =
      rows.some((r) => Number(r.product_id || 0) > 0) ||
      (Array.isArray(draftPayload.resolved_lines) &&
        draftPayload.resolved_lines.some(
          (l) => Number(l.product_variant_id || l.odoo_product_id || 0) > 0
        ));
    if (!hasResolvedIds && !rows.length && productText) {
      const match = await executeKw(
        uid,
        "product.template",
        "search_read",
        [[["name", "ilike", productText], ["sale_ok", "=", true]]],
        { fields: ["id", "name", "list_price"], limit: 1 }
      );
      const first = Array.isArray(match) ? match[0] : null;
      if (first?.id) {
        const variantIds = await executeKw(
          uid,
          "product.product",
          "search_read",
          [[["product_tmpl_id", "=", first.id]]],
          { fields: ["id"], limit: 1 }
        );
        const variant = Array.isArray(variantIds) ? variantIds[0] : null;
        if (variant?.id) {
          await executeKw(uid, "sale.order.line", "create", [
            {
              order_id: orderId,
              product_id: variant.id,
              name: first.name,
              product_uom_qty: quantity,
              price_unit: Number(first.list_price || 0),
            },
          ]);
        }
      }
    }

    if (orderNoteHtml) {
      const tasks = await executeKw(
        uid,
        "project.task",
        "search_read",
        [[["sale_order_id", "=", orderId]]],
        { fields: ["id"], limit: 1 }
      );
      if (Array.isArray(tasks) && tasks[0]?.id) {
        await executeKw(uid, "project.task", "write", [
          [tasks[0].id],
          { description: orderNoteHtml },
        ]);
      }
    }

    const orderDraftForAttach = vars?.order_draft || {};
    const attachmentsToUpload = collectOrderAttachments(vars);
    let attachmentUpload = { uploaded: [], errors: [] };
    if (attachmentsToUpload.length) {
      attachmentUpload = await attachOrderDraftFiles(
        (model, method, positionalArgs = [], kw = {}) =>
          executeKw(uid, model, method, positionalArgs, kw),
        orderId,
        attachmentsToUpload,
        "sale.order"
      );
      const uploadedIds = (attachmentUpload.uploaded || [])
        .map((u) => u.id)
        .filter(Boolean);
      if (uploadedIds.length) {
        try {
          await executeKw(uid, "sale.order", "message_post", [[orderId]], {
            body: "<p>Adjuntos staff (lista / referencias de diseño).</p>",
            attachment_ids: uploadedIds,
            message_type: "comment",
          });
        } catch (_) {
          /* chatter opcional */
        }
      }
      // También en la oportunidad ligada
      if (leadId) {
        await attachOrderDraftFiles(
          (model, method, positionalArgs = [], kw = {}) =>
            executeKw(uid, model, method, positionalArgs, kw),
          leadId,
          attachmentsToUpload,
          "crm.lead"
        );
      }
    }

    // Formulario Life spreadsheet: crear/actualizar y llenar personas + atributos
    let spreadsheetResult = { id: null, url: null, filled: 0, status: "empty" };
    try {
      const odooKw = (model, method, positionalArgs = [], kw = {}) =>
        executeKw(uid, model, method, positionalArgs, kw);
      spreadsheetResult = await upsertSaleOrderSpreadsheet(odooKw, {
        orderId,
        odooUrl: ODOO_URL,
        detail: orderDraftForAttach.detail || {},
        resolvedLines:
          draftPayload.resolved_lines ||
          orderDraftForAttach.commercial?.resolved_lines ||
          [],
        fingerprint: orderDraftForAttach.write?.fingerprint || null,
        // Default both: Odoo no llena celdas desde payload solo; Kapso escribe C–F/H–M.
        fillMode: String(env?.FORMULARIO_FILL_MODE || "both").toLowerCase(),
      });
    } catch (sheetErr) {
      spreadsheetResult = {
        id: null,
        url: null,
        filled: 0,
        status: "error",
        error: String(sheetErr?.message || sheetErr),
      };
    }

    const orderData = await executeKw(uid, "sale.order", "read", [[orderId]], {
      fields: ["name", "state", "amount_total", "partner_id"],
    });
    const order = Array.isArray(orderData) ? orderData[0] : {};
    const quotePdfUrl = `${ODOO_URL}/report/pdf/sale.report_saleorder/${orderId}`;
    const amountTotal = Number(order?.amount_total || 0);
    const initialPaymentAmount = Math.round(amountTotal * 0.5);
    const needsReconcile =
      needsReview ||
      spreadsheetResult.status === "mismatch" ||
      (crossCheck && crossCheck.ok === false);

    return new Response(
      JSON.stringify({
        vars: {
          lead: {
            id: leadId,
            name: leadName,
            url: `${String(ODOO_URL).replace(/\/$/, "")}/odoo/crm/${leadId}`,
          },
          order: {
            id: orderId,
            name: order?.name || null,
            status: order?.state || "draft",
            amount_total: amountTotal,
            initial_payment_amount: initialPaymentAmount,
            customer_confirmed: false,
            customer_wa_id: customerWaId || null,
            quote_pdf_url: quotePdfUrl,
            needs_review: needsReconcile,
            needs_human_reconcile: needsReconcile,
            idempotency_key: idempotencyKey,
            deduplicated: resumed,
            spreadsheet_id: spreadsheetResult.id,
            spreadsheet_url: spreadsheetResult.url,
            lifecycle_state: lifecycle.state || "draft_ready_for_review",
          },
          order_draft: {
            lifecycle: {
              ...lifecycle,
              odoo_order_id: orderId,
              state: lifecycle.state || "draft_ready_for_review",
              updated_at: now,
            },
            spreadsheet: {
              id: spreadsheetResult.id,
              url: spreadsheetResult.url,
              status: spreadsheetResult.status,
              filled: spreadsheetResult.filled,
              cross_check: crossCheck,
            },
            write: {
              status: needsReconcile ? "needs_human_reconcile" : "ready",
              code: resumed ? "resumed" : "created",
            },
          },
          quote: {
            formal_quote_requested: Boolean(draftPayload.formal_quote_requested),
            formal_quote_created_at: now,
            pdf_url: quotePdfUrl,
          },
          service: {
            last_call_name: "activar_cotizacion_odoo",
            last_call_status: "ready",
            last_call_at: now,
            fallback_message: isPartialDraft
              ? "Borrador parcial creado; completar los campos pendientes antes de confirmar en Odoo."
              : needsReconcile
                ? "Borrador creado; revisar descuadre lista vs cantidades en Formulario Life."
                : null,
            attachments_uploaded: attachmentUpload.uploaded.length,
            attachments_errors: attachmentUpload.errors,
            spreadsheet_filled: spreadsheetResult.filled,
          },
        },
        status: "ready",
        message: resumed
          ? "Cotizacion BORRADOR reanudada/actualizada en Odoo (sin duplicar)."
          : "Lead y cotizacion BORRADOR creados en Odoo (confirmar manualmente). Linea Diseno a costo 0.",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return jsonError(
      502,
      `Odoo create flow failed: ${String(error?.message || error)}`,
      now,
      "No pude completar la cotizacion en Odoo en este intento. Lo escalo para seguimiento inmediato."
    );
  }
}

function jsonError(statusCode, message, now, fallbackMessage) {
  return new Response(
    JSON.stringify({
      vars: {
        service: {
          last_call_name: "activar_cotizacion_odoo",
          last_call_status: "error",
          last_call_at: now,
          fallback_message: fallbackMessage,
        },
      },
      status: "error",
      message,
    }),
    { status: statusCode, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * opportunity_only | sale_order
 * Staff CRM-first: default opportunity_only unless HAZ PRESUPUESTO / write_mode sale_order.
 */
function resolveStaffWriteMode(input = {}, vars = {}) {
  const chunks = [
    vars.staff_lane_reply,
    vars?.staff?.lane_reply,
    vars?.staff?.last_user_text,
    vars?.intent?.raw_text,
    vars?.intent?.text,
    vars?.last_user_input,
    vars?.last_user_text,
  ]
    .map((t) => String(t || ""))
    .join("\n");
  // Intent de presupuesto gana sobre opportunity_only stale del CRM.
  if (
    /\b(HAZ|HAS|HACE|CREA|CREAR)(?:\s+\w+){0,3}\s+PRESUPUESTO\b/i.test(chunks) ||
    /\bCONFIRMO\s+PRESUPUESTO\b/i.test(chunks)
  ) {
    return "sale_order";
  }

  const staffMode = String(input.write_mode || vars?.staff?.write_mode || "")
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

/** --- Formulario Life spreadsheet helpers (inline) --- */
/** String plano como Plantilla venta — {content} rompe Owl en Calculadora. */
function sheetCell(content) {
  return content == null ? "" : String(content);
}

function findSheetByName(snapshot, nameRe) {
  return (snapshot?.sheets || []).find((s) => nameRe.test(String(s?.name || ""))) || null;
}

function buildMinimalFormularioSnapshot() {
  return {
    version: "18.3.1",
    sheets: [
      {
        id: "formulario",
        name: "Formulario Life (Aprobación nombres, tallas y numero)",
        colNumber: 16,
        rowNumber: 200,
        cells: {
          A1: sheetCell("Idx"),
          B1: sheetCell("Producto"),
          C1: sheetCell("Nombre en camiseta"),
          D1: sheetCell("Numero en camiseta"),
          E1: sheetCell("Talla uniforme"),
        },
      },
      {
        id: "pedido",
        name: "Pedido",
        colNumber: 16,
        rowNumber: 80,
        cells: {
          A1: sheetCell("Producto"),
          B1: sheetCell("Cantidad"),
          I1: sheetCell("Producto base"),
          J1: sheetCell("Cuello"),
          K1: sheetCell("Largo Manga"),
        },
      },
    ],
    lists: {},
    settings: { locale: { code: "es_ES" } },
  };
}

function peopleRowsFromDetail(detail = {}) {
  if (Array.isArray(detail.people) && detail.people.length) {
    return detail.people.map((person, i) => {
      const identity = person.identity || {};
      const primary = (person.components || [])[0] || {};
      const comments = [
        String(person.comments || "").trim(),
        String(primary.comment || "").trim(),
        primary.goalkeeper ? "Arquero" : "",
        String(primary.sleeve || primary.manga || "").trim(),
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        nombre: String(identity.print_name || identity.display_name || "").trim(),
        numero: String(identity.number || "").trim(),
        talla: String(primary.size || "").trim(),
        color_medias: String(person.color_medias || primary.color_medias || "").trim(),
        comentarios: comments,
        resolved_line_id: String(primary.resolved_line_id || person.resolved_line_id || "").trim(),
        product_line_key: String(primary.product_line_key || person.product_line_key || "").trim(),
      };
    });
  }
  return (detail.rows || []).map((row) => ({
    nombre: String(row.nombre || "").trim(),
    numero: String(row.numero || "").trim(),
    talla: String(row.talla || "").trim(),
    color_medias: String(row.color_medias || row.medias || "").trim(),
    comentarios: [row.comentario || row.rol || "", row.arquero ? "Arquero" : "", row.manga || ""]
      .filter(Boolean)
      .join(" · "),
    resolved_line_id: String(row.resolved_line_id || "").trim(),
    product_line_key: String(row.product_line_key || "").trim(),
  }));
}

function applyFormularioFill(snapshot, { detail, resolvedLines, orderLines }) {
  const clone = JSON.parse(JSON.stringify(snapshot || buildMinimalFormularioSnapshot()));
  const pedido = findSheetByName(clone, /^(pedido|productos del pedido)$/i) || clone.sheets[1];
  const form = findSheetByName(clone, /formulario|aprobaci/i) || clone.sheets[0];
  // NO renombrar "Pedido" si hay fórmulas XLOOKUP/ODOO.LIST que referencian Pedido!…
  const snapshotText = JSON.stringify(clone);
  const nativePedidoRefs = /Pedido!/i.test(snapshotText) || /ODOO\.LIST/i.test(snapshotText);
  if (
    !nativePedidoRefs &&
    pedido &&
    /^pedido$/i.test(String(pedido.name || ""))
  ) {
    pedido.name = "Productos del pedido";
  }

  const productLines = (resolvedLines || []).filter(
    (l) =>
      Number(l.quantity || 0) > 0 &&
      !/dise[nñ]o/i.test(l.product_base || l.product_text || l.name || "")
  );

  function isFormula(val) {
    const c = val && typeof val === "object" ? String(val.content || "") : String(val || "");
    return c.trim().startsWith("=");
  }
  function setHdr(sheet, addr, label) {
    sheet.cells = sheet.cells || {};
    const cur = sheet.cells[addr];
    const text = cur && typeof cur === "object" ? String(cur.content || "") : String(cur || "");
    if (!text || !isFormula(cur)) sheet.cells[addr] = sheetCell(label);
  }
  function cellText(val) {
    if (val == null) return "";
    return String(typeof val === "object" ? val.content ?? "" : val).replace(/\s+/g, " ").trim();
  }
  function pedidoList(col, from = 2, to = 40) {
    const out = [];
    if (!pedido?.cells) return out;
    for (let r = from; r <= to; r++) {
      const v = cellText(pedido.cells[`${col}${r}`]);
      if (v) out.push(v);
    }
    return out;
  }
  function normTalla(raw) {
    const allowed = pedidoList("G");
    const token = cellText(raw).replace(/^tallas?\s*:?\s*/i, "").toUpperCase();
    if (!token) return "";
    const hit =
      allowed.find((a) => cellText(a) === cellText(raw)) ||
      allowed.find(
        (a) => cellText(a).replace(/^tallas?\s*:?\s*/i, "").toUpperCase() === token
      );
    if (hit) return hit;
    if (/^(XXXL|XXL|XL|S|M|L)$/i.test(token)) return `Tallas: ${token}`;
    if (/^\d{1,2}$/.test(token)) return ` Tallas: ${token}`;
    return cellText(raw);
  }
  function normColor(raw) {
    const allowed = pedidoList("H");
    const token = cellText(raw);
    if (!token) return "";
    const hit = allowed.find((a) => cellText(a).toLowerCase() === token.toLowerCase());
    if (hit) return hit;
    const aliases = {
      negro: "Negro",
      blanco: "Blanco",
      azul: "Azul",
      verde: "Verde",
      rojo: "Rojo",
      naranja: "Naranja",
    };
    const mapped = aliases[token.toLowerCase()];
    if (mapped) {
      return allowed.find((a) => cellText(a).toLowerCase() === mapped.toLowerCase()) || mapped;
    }
    return "";
  }
  if (Array.isArray(form?.dataValidationRules)) {
    for (const rule of form.dataValidationRules) {
      const ranges = rule.ranges || [];
      if (ranges.some((r) => /^E/i.test(r))) {
        rule.ranges = ["E2:E"];
        if (rule.criterion?.values) rule.criterion.values = ["Pedido!G2:G"];
      }
      if (ranges.some((r) => /^F/i.test(r))) {
        rule.ranges = ["F2:F"];
        if (rule.criterion?.values) rule.criterion.values = ["Pedido!H2:H"];
      }
    }
  }
  function decompose(displayName, attributes, comments) {
    const raw = String(displayName || "").trim();
    const withTrail = raw.match(/^(.+?)\s*\(([^)]+)\)\s*(.*)$/);
    const product_base = withTrail ? withTrail[1].trim() : raw;
    const attrs = { ...(attributes || {}) };
    const otros = [];
    const commentParts = [];
    const principalKeys = new Set(["cuello", "manga", "genero", "deporte"]);
    const otrosLabels = {
      tela: "Tela",
      medias: "Medias",
      tipo_pantalon: "Pantaloneta",
      forro: "Forro",
    };
    if (withTrail) {
      for (const part of withTrail[2].split(",")) {
        const token = part.trim();
        if (!token) continue;
        const lower = token.toLowerCase();
        if (/cuello|polo|redondo|\bv\b/.test(lower)) attrs.cuello = attrs.cuello || token;
        else if (/dry|dumonti|hidrotec|lluvia|tela/.test(lower)) attrs.tela = attrs.tela || token;
        else if (/manga|sisa|ranglan|china|corta|larga/.test(lower) && !/media/.test(lower)) {
          attrs.manga = attrs.manga || token;
        } else if (/media/.test(lower)) attrs.medias = attrs.medias || token;
        else if (/pantalon|lycra|short|mariposa/.test(lower)) {
          attrs.tipo_pantalon = attrs.tipo_pantalon || token;
        } else if (/forro/.test(lower)) attrs.forro = attrs.forro || token;
        else commentParts.push(token);
      }
    }
    const principal = {};
    for (const [key, val] of Object.entries(attrs)) {
      if (!val) continue;
      if (principalKeys.has(key)) principal[key] = val;
      else if (otrosLabels[key]) otros.push(`${otrosLabels[key]}: ${val}`);
      else if (key !== "extra") commentParts.push(`${key}: ${val}`);
    }
    if (comments) commentParts.unshift(String(comments).trim());
    return {
      product_base,
      attributes: principal,
      otros_atributos: [...new Set(otros)].join(" · "),
      comments: [...new Set(commentParts.filter(Boolean))].join(" · "),
    };
  }

  // Plantilla venta nativa: no expandir tablas ni escribir G–M / I–O (rompe Calculadora).
  const nativeFormulario =
    /Pedido!/i.test(snapshotText) && /XLOOKUP|SEQUENCE|ODOO\.LIST/i.test(snapshotText);

  // Productos del pedido: NO tocar A–F ni G–H. Kapso I–O (solo legacy).
  if (pedido && !nativeFormulario) {
    pedido.cells = pedido.cells || {};
    setHdr(pedido, "I1", "Producto base");
    setHdr(pedido, "J1", "Cuello");
    setHdr(pedido, "K1", "Largo Manga");
    setHdr(pedido, "L1", "Género");
    setHdr(pedido, "M1", "Deportes");
    setHdr(pedido, "N1", "Otros atributos");
    setHdr(pedido, "O1", "Comentario");
    if (Array.isArray(pedido.tables) && pedido.tables[0]) {
      pedido.tables[0] = { ...pedido.tables[0], range: "A1:O80" };
    }
    const plan =
      Array.isArray(orderLines) && orderLines.length
        ? orderLines.map((ol) => {
            const name = String(ol.name || ol.product_id?.[1] || "").trim();
            if (/dise[nñ]o/i.test(name)) {
              return { display_name: name, attributes: {}, comments: "" };
            }
            const match =
              productLines.find(
                (rl) =>
                  Number(rl.product_variant_id || 0) ===
                    Number(ol.product_id?.[0] || ol.product_id || 0) ||
                  String(rl.product_text || "") === name
              ) || null;
            return {
              display_name: name,
              attributes: match?.attributes || {},
              comments: match?.comments || "",
            };
          })
        : productLines.map((l) => ({
            display_name: l.product_text || l.product_base,
            attributes: l.attributes || {},
            comments: l.comments || "",
          }));
    plan.forEach((entry, i) => {
      const row = i + 2;
      const d = decompose(entry.display_name, entry.attributes, entry.comments);
      const a = d.attributes;
      pedido.cells[`I${row}`] = sheetCell(d.product_base);
      pedido.cells[`J${row}`] = sheetCell(a.cuello || "");
      pedido.cells[`K${row}`] = sheetCell(a.manga || "");
      pedido.cells[`L${row}`] = sheetCell(a.genero || "");
      pedido.cells[`M${row}`] = sheetCell(a.deporte || "");
      pedido.cells[`N${row}`] = sheetCell(d.otros_atributos || "");
      pedido.cells[`O${row}`] = sheetCell(d.comments || "");
    });
  }

  let filled = 0;
  if (form) {
    form.cells = form.cells || {};
    const people = peopleRowsFromDetail(detail);

    if (nativeFormulario) {
      // C–E persona + F–K attrs + L color_medias. No tocar A–B ni expandir tablas.
      
      // Homogeneizar estilos de cabecera de la E a la L
      if (form.styles) {
        const headerStyleId = form.styles['C1'] || form.styles['E1:F1'] || 4;
        form.styles['C1'] = headerStyleId;
        form.styles['D1'] = form.styles['D1'] || 5;
        form.styles['E1:L1'] = headerStyleId;
        if (form.styles['E1:F1']) delete form.styles['E1:F1'];
      }

      // Homogeneizar bordes
      if (form.borders) {
        if (form.borders['B1:F1']) {
          form.borders['B1:L1'] = form.borders['B1:F1'];
          delete form.borders['B1:F1'];
        } else if (!form.borders['B1:L1']) {
          form.borders['B1:L1'] = 1;
        }
      }

      // Limpiar celdas en el rango C-L fila >= 2
      for (const addr of Object.keys(form.cells)) {
        const m = addr.match(/^([C-L])(\d+)$/);
        if (m && Number(m[2]) >= 2) delete form.cells[addr];
      }

      people.forEach((person, i) => {
        const row = i + 2;
        const nombre = String(person.nombre || "").trim();
        const numero = String(person.numero || "").trim();
        const talla = normTalla(person.talla || "");
        const color = normColor(person.color_medias || "");
        if (nombre) form.cells[`C${row}`] = nombre;
        if (numero) form.cells[`D${row}`] = numero;
        if (talla) form.cells[`E${row}`] = talla;
        if (color) form.cells[`L${row}`] = color; // Color medias en columna L
        filled += 1;
      });
    } else {
      setHdr(form, "C1", "Nombre en camiseta");
      setHdr(form, "D1", "Numero en camiseta");
      setHdr(form, "E1", "Talla uniforme");
      setHdr(form, "F1", "Cuello");
      setHdr(form, "G1", "Largo Manga");
      setHdr(form, "H1", "Género");
      setHdr(form, "I1", "Deportes");
      setHdr(form, "J1", "Otros atributos");
      setHdr(form, "K1", "Comentario");
      setHdr(form, "L1", "Color medias");
      if (Array.isArray(form.tables) && form.tables[0]) {
        form.tables[0] = { ...form.tables[0], range: "A1:L200" };
      }
      for (const addr of Object.keys(form.cells)) {
        const m = addr.match(/^([C-L])(\d+)$/);
        if (m && Number(m[2]) >= 2) delete form.cells[addr];
      }
      const defaultLine = productLines[0] || null;
      const defaultDecomp = defaultLine
        ? decompose(
            defaultLine.product_text || defaultLine.product_base,
            defaultLine.attributes || {},
            defaultLine.comments || ""
          )
        : null;

      if (people.length) {
        people.forEach((person, i) => {
          const row = i + 2;
          const line =
            productLines.find(
              (l) =>
                l.line_id === person.resolved_line_id ||
                l.line_id === person.product_line_key ||
                l.product_text === person.product_line_key
            ) || defaultLine;
          const d = line
            ? decompose(
                line.product_text || line.product_base,
                line.attributes || {},
                [line.comments, person.comentarios].filter(Boolean).join(" · ")
              )
            : defaultDecomp || {
                product_base: "",
                attributes: {},
                otros_atributos: "",
                comments: person.comentarios || "",
              };
          const a = d.attributes || {};
          form.cells[`C${row}`] = sheetCell(person.nombre);
          form.cells[`D${row}`] = sheetCell(person.numero);
          form.cells[`E${row}`] = sheetCell(normTalla(person.talla));
          form.cells[`F${row}`] = sheetCell(a.cuello || "");
          form.cells[`G${row}`] = sheetCell(a.manga || "");
          form.cells[`H${row}`] = sheetCell(a.genero || "");
          form.cells[`I${row}`] = sheetCell(a.deporte || "");
          form.cells[`J${row}`] = sheetCell(d.otros_atributos || "");
          form.cells[`K${row}`] = sheetCell(d.comments || "");
          form.cells[`L${row}`] = sheetCell(normColor(person.color_medias || ""));
          filled += 1;
        });
      } else if (defaultDecomp) {
        const qty = productLines.reduce((s, l) => s + Number(l.quantity || 0), 0);
        const a = defaultDecomp.attributes || {};
        for (let i = 0; i < qty; i++) {
          const row = i + 2;
          form.cells[`F${row}`] = sheetCell(a.cuello || "");
          form.cells[`G${row}`] = sheetCell(a.manga || "");
          form.cells[`H${row}`] = sheetCell(a.genero || "");
          form.cells[`I${row}`] = sheetCell(a.deporte || "");
          form.cells[`J${row}`] = sheetCell(defaultDecomp.otros_atributos || "");
          form.cells[`K${row}`] = sheetCell(defaultDecomp.comments || "");
          filled += 1;
        }
      }
    }
  }
  return { snapshot: clone, filled };
}

function encodeSnapshot(snapshot) {
  const json = JSON.stringify(snapshot);
  const bytes = new TextEncoder().encode(json);
  return bytesToBase64(bytes);
}

function decodeSnapshotB64(b64) {
  if (!b64 || b64 === false) return null;
  try {
    const binary = atob(String(b64));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

async function resolveSaleOrderTemplateId(executeKw, uid) {
  try {
    const rows = await executeKw(
      uid,
      "sale.order.template",
      "search_read",
      [[["name", "ilike", "Plantilla venta"]]],
      { fields: ["id", "name", "spreadsheet_template_id"], limit: 1 }
    );
    if (rows?.[0]?.id) return rows[0].id;
    const any = await executeKw(
      uid,
      "sale.order.template",
      "search_read",
      [[]],
      { fields: ["id", "name"], limit: 1 }
    );
    return any?.[0]?.id || null;
  } catch {
    return null;
  }
}

/**
 * Asegura el Formulario nativo Odoo (copia de Calculadora de Plantilla venta).
 * No usa el Excel lista "FORMATO PEDIDO LIFE".
 */
async function ensureNativeFormularioSheet(odooKw, orderId) {
  const existing = await odooKw(
    "sale.order.spreadsheet",
    "search_read",
    [[["order_id", "=", orderId]]],
    { fields: ["id", "name", "spreadsheet_snapshot"], limit: 1, order: "id desc" }
  );
  if (existing?.[0]?.id) {
    const snap = decodeSnapshotB64(existing[0].spreadsheet_snapshot);
    const names = (snap?.sheets || []).map((s) => String(s?.name || ""));
    const looksNative = names.some((n) => /aprobaci|formulario life|^pedido$/i.test(n));
    if (looksNative && /XLOOKUP|SEQUENCE|ODOO\.LIST/i.test(JSON.stringify(snap || {}))) {
      return { sheetId: existing[0].id, snapshot: snap, source: "existing_native" };
    }
    if (looksNative) {
      return { sheetId: existing[0].id, snapshot: snap, source: "existing" };
    }
  }

  let templateId = null;
  try {
    const sot = await odooKw(
      "sale.order.template",
      "search_read",
      [[["name", "ilike", "Plantilla venta"]]],
      { fields: ["id", "spreadsheet_template_id"], limit: 1 }
    );
    const rel = sot?.[0]?.spreadsheet_template_id;
    templateId = Array.isArray(rel) ? rel[0] : rel || null;
  } catch {
    templateId = null;
  }
  if (!templateId) {
    const byName = await odooKw(
      "sale.order.spreadsheet",
      "search_read",
      [[["name", "ilike", "Formulario pedido Life"], ["order_id", "=", false]]],
      { fields: ["id"], limit: 1, order: "id asc" }
    );
    templateId = byName?.[0]?.id || null;
  }
  if (!templateId) {
    return { sheetId: existing?.[0]?.id || null, snapshot: null, source: "missing_template" };
  }

  let sheetId = existing?.[0]?.id || null;
  if (!sheetId) {
    const copied = await odooKw(
      "sale.order.spreadsheet",
      "copy",
      [templateId],
      { default: { order_id: orderId, name: "Formulario pedido Life" } }
    );
    sheetId = Array.isArray(copied) ? copied[0] : copied;
  } else {
    const tmpl = await odooKw(
      "sale.order.spreadsheet",
      "read",
      [[templateId]],
      { fields: ["spreadsheet_snapshot"] }
    );
    const tmplSnap = tmpl?.[0]?.spreadsheet_snapshot;
    if (tmplSnap) {
      await odooKw("sale.order.spreadsheet", "write", [
        [sheetId],
        { name: "Formulario pedido Life", spreadsheet_snapshot: tmplSnap },
      ]);
    }
  }

  const fresh = await odooKw(
    "sale.order.spreadsheet",
    "search_read",
    [[["id", "=", sheetId]]],
    { fields: ["id", "spreadsheet_snapshot"], limit: 1 }
  );
  return {
    sheetId,
    snapshot: decodeSnapshotB64(fresh?.[0]?.spreadsheet_snapshot),
    source: "copied_template",
  };
}

async function attachFormularioPayloadJson(executeKw, orderId, payloadObj) {
  const name = "formulario_payload_v1.json";
  const json = JSON.stringify(payloadObj, null, 2);
  const datas = bytesToBase64(new TextEncoder().encode(json));
  const existing = await executeKw("ir.attachment", "search", [
    [
      ["res_model", "=", "sale.order"],
      ["res_id", "=", orderId],
      ["name", "=", name],
    ],
  ], { limit: 1 });
  // Odoo 19: campo binario es `raw` (no `datas`)
  const vals = {
    name,
    res_model: "sale.order",
    res_id: orderId,
    type: "binary",
    mimetype: "application/json",
    raw: datas,
  };
  if (Array.isArray(existing) && existing.length) {
    await executeKw("ir.attachment", "write", [[existing[0]], vals]);
    return { id: existing[0], name, updated: true };
  }
  const id = await executeKw("ir.attachment", "create", [vals]);
  return { id, name, updated: false };
}

function buildFormularioPayloadV1({ detail, resolvedLines, fingerprint, fillMode }) {
  const peopleSrc = Array.isArray(detail?.people)
    ? detail.people
    : Array.isArray(detail?.rows)
      ? detail.rows
      : [];
  const units = peopleSrc.map((p, i) => {
    const id = p.identity || {};
    const comp = Array.isArray(p.components) ? p.components[0] || {} : {};
    return {
      row: i + 1,
      nombre: String(id.print_name || id.name || p.nombre || "").trim(),
      numero: String(id.number || p.numero || "").trim(),
      talla: String(comp.size || p.talla || "").trim(),
      color_medias: String(p.color_medias || "").trim(),
      comentario: String(comp.comment || p.comentario || "").trim(),
      product_hint: String(p.product_hint || p.category || p.rol || "").trim(),
    };
  });
  const lines = (resolvedLines || []).map((l, i) => ({
    line_id: l.line_id || `rl_${i + 1}`,
    product_base: String(l.product_base || l.product_text || l.name || "").trim(),
    product_variant_id: Number(l.product_variant_id || l.odoo_product_id || l.product_id || 0) || null,
    product_tmpl_id: Number(l.product_tmpl_id || 0) || null,
    quantity: Math.max(0, Number(l.quantity || 0)),
    category: l.category || null,
    confidence: l.confidence || null,
    principal: {
      cuello: l.attributes?.cuello || "",
      manga: l.attributes?.manga || "",
      genero: l.attributes?.genero || "",
      deporte: l.attributes?.deporte || "",
    },
    otros: {
      tela: l.attributes?.tela || "",
      medias: l.attributes?.medias || "",
      tipo_pantalon: l.attributes?.tipo_pantalon || "",
      forro: l.attributes?.forro || "",
    },
    attributes: l.attributes || {},
    comments: l.comments || "",
  }));
  const personCount = units.length;
  const lineQty = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  return {
    schema_version: "formulario_payload_v1",
    built_at: new Date().toISOString(),
    fingerprint: fingerprint || null,
    meta: {
      source: "kapso",
      parse_status: detail?.parse_status || null,
      layout: detail?.layout || null,
      fill_mode: fillMode || "payload",
    },
    commercial: {
      lines: lines.map((l) => ({
        product_text: l.product_base,
        quantity: l.quantity,
        product_variant_id: l.product_variant_id,
        category: l.category,
      })),
    },
    lines,
    units,
    totals: {
      person_count: personCount,
      line_qty: lineQty,
      qty_match: personCount > 0 && lineQty > 0 ? personCount === lineQty : null,
    },
  };
}

async function upsertSaleOrderSpreadsheet(executeKw, { orderId, odooUrl, detail, resolvedLines, fingerprint, fillMode: fillModeArg }) {
  // executeKw aquí ya es (model, method, args, kwargs) — wrapper con uid.
  const fillMode = String(fillModeArg || "both").toLowerCase();
  // payload | cells | both — default both (Kapso llena celdas; payload queda como evidencia)

  const ensured = await ensureNativeFormularioSheet(executeKw, orderId);
  let sheetId = ensured.sheetId;
  let snapshot = ensured.snapshot;
  if (!snapshot) snapshot = buildMinimalFormularioSnapshot();

  const formularioPayload = buildFormularioPayloadV1({
    detail,
    resolvedLines,
    fingerprint,
    fillMode,
  });
  let payloadAttach = null;
  try {
    payloadAttach = await attachFormularioPayloadJson(
      executeKw,
      orderId,
      formularioPayload
    );
  } catch (attErr) {
    payloadAttach = { error: String(attErr?.message || attErr) };
  }

  let orderLines = [];
  try {
    const so = await executeKw(
      "sale.order",
      "read",
      [[orderId]],
      { fields: ["order_line"] }
    );
    const lineIds = so?.[0]?.order_line || [];
    if (lineIds.length) {
      orderLines = await executeKw(
        "sale.order.line",
        "read",
        [lineIds],
        { fields: ["id", "name", "product_id", "product_uom_qty"] }
      );
    }
  } catch {
    orderLines = [];
  }

  const orderLinesNoDesign = (orderLines || []).filter(
    (l) => !/dise[nñ]o/i.test(String(l.name || l.product_id?.[1] || ""))
  );

  const shouldFillCells = fillMode === "cells" || fillMode === "both";
  let filled = 0;
  let filledSnap = snapshot;
  if (shouldFillCells) {
    const applied = applyFormularioFill(snapshot, {
      detail,
      resolvedLines,
      orderLines: orderLinesNoDesign,
    });
    filledSnap = applied.snapshot;
    filled = applied.filled;
  }

  const personCount = peopleRowsFromDetail(detail).length;
  const lineQty = (resolvedLines || [])
    .filter((l) => !/dise[nñ]o/i.test(l.product_base || l.product_text || l.name || ""))
    .reduce((s, l) => s + Number(l.quantity || 0), 0);
  const status =
    personCount && lineQty && personCount !== lineQty
      ? "mismatch"
      : shouldFillCells
        ? filled
          ? "complete"
          : "partial"
        : payloadAttach?.id
          ? "payload_ready"
          : "empty";

  // En modo payload: asegurar Formulario nativo sin pisar celdas de datos.
  // Solo escribe snapshot si fill de celdas o si acabamos de copiar plantilla vacía.
  if (shouldFillCells || ensured.source === "copied_template" || ensured.source === "missing_template") {
    const writePayload = {
      name: "Formulario pedido Life",
      order_id: orderId,
    };
    if (shouldFillCells) {
      writePayload.spreadsheet_snapshot = encodeSnapshot(filledSnap);
    } else if (ensured.source === "copied_template" && snapshot) {
      // snapshot ya es la plantilla nativa; no reescribir si ya está en sheet
      writePayload.spreadsheet_snapshot = encodeSnapshot(snapshot);
    }
    if (sheetId) {
      if (writePayload.spreadsheet_snapshot || writePayload.name) {
        await executeKw("sale.order.spreadsheet", "write", [[sheetId], writePayload]);
      }
    } else if (writePayload.spreadsheet_snapshot) {
      sheetId = await executeKw("sale.order.spreadsheet", "create", [writePayload]);
    }
  }

  return {
    id: sheetId,
    url: sheetId
      ? `${odooUrl}/odoo/sales/${orderId}/sale-order-spreadsheet/${sheetId}`
      : null,
    filled: shouldFillCells ? filled : 0,
    status,
    source: ensured.source,
    fill_mode: fillMode,
    payload_attachment: payloadAttach,
    formulario_payload: {
      schema_version: formularioPayload.schema_version,
      totals: formularioPayload.totals,
      lines: formularioPayload.lines.length,
      units: formularioPayload.units.length,
    },
  };
}
