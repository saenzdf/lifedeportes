/**
 * Contrato staff pedido completo: resolved_lines, fingerprint, cross-check, readiness.
 */

import { applyEstimateToResolvedLines, inferOrderEstimate } from "./infer_order_estimate.js";

export const SCHEMA_PEOPLE = "life_order_people_v1";
export const WRITE_READY = "ready";
export const WRITE_NEEDS_CONFIRMATION = "needs_staff_confirmation";
export const WRITE_BLOCKED = "blocked";
export const WRITE_NEEDS_RECONCILE = "needs_human_reconcile";
export const LIFECYCLE_SCHEMA = "life_order_lifecycle_v1";
export { inferOrderEstimate, applyEstimateToResolvedLines };

const ATTR_KEYS = [
  "cuello",
  "tela",
  "manga",
  "tipo_pantalon",
  "medias",
  "forro",
  "deporte",
  "genero",
];
const KNOWN_ATTR_SET = new Set(ATTR_KEYS);

/** Columnas principales del Formulario (ADR 0003). */
export const PRINCIPAL_ATTR_KEYS = ["cuello", "manga", "genero", "deporte"];
const PRINCIPAL_ATTR_SET = new Set(PRINCIPAL_ATTR_KEYS);

/** Etiquetas para concatenar en «Otros atributos». */
export const OTROS_ATTR_LABELS = {
  tela: "Tela",
  medias: "Medias",
  tipo_pantalon: "Pantaloneta",
  forro: "Forro",
  tipo_manga: "Tipo de Manga",
  color: "Color",
  bordado: "Bordado",
  botones: "Botones",
  cremallera: "Cremallera",
  tipo_camiseta: "Tipo de camiseta",
  tallas: "Tallas",
  telas: "telas",
};

/** @deprecated usar PRINCIPAL_ATTR_KEYS — alias compat */
export const SPREADSHEET_ATTR_COLS = PRINCIPAL_ATTR_KEYS;

export function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Separa display name Odoo en producto base + atributos embebidos en paréntesis. */
export function splitProductDisplayName(displayName) {
  const raw = compact(displayName);
  if (!raw) return { product_base: "", embedded_attrs: {}, unknown_parts: [], raw: "" };

  // Odoo a menudo concatena descripción ecommerce tras el cierre: "Base (attrs) Largo texto…"
  let product_base = raw;
  let attrsBlob = "";
  const withTrail = raw.match(/^(.+?)\s*\(([^)]+)\)\s*(.*)$/);
  if (withTrail) {
    product_base = compact(withTrail[1]);
    attrsBlob = withTrail[2];
    const trailing = compact(withTrail[3]);
    // Si el trailing parece descripción larga (no atributo corto), se ignora como base
    if (trailing && trailing.length < 40 && !/\s{2,}/.test(trailing)) {
      // raro: texto corto tras ) — no lo usamos como base
    }
  } else {
    return { product_base: raw, embedded_attrs: {}, unknown_parts: [], raw };
  }

  const embedded_attrs = {};
  const unknown_parts = [];
  for (const part of attrsBlob.split(",")) {
    const token = compact(part);
    if (!token) continue;
    const lower = token.toLowerCase();
    if (/cuello|polo|redondo|\bv\b/.test(lower)) embedded_attrs.cuello = token;
    else if (/dry|dumonti|hidrotec|lluvia|tela/.test(lower)) embedded_attrs.tela = token;
    else if (/manga|sisa|ranglan|china|corta|larga/.test(lower) && !/media/.test(lower)) {
      embedded_attrs.manga = token;
    } else if (/media/.test(lower)) embedded_attrs.medias = token;
    else if (/pantalon|lycra|short|mariposa/.test(lower)) embedded_attrs.tipo_pantalon = token;
    else if (/forro/.test(lower)) embedded_attrs.forro = token;
    else if (/^masc|^fem|g[eé]nero/.test(lower)) embedded_attrs.genero = token;
    else if (/deporte|f[uú]tbol|voleibol|baloncesto|atletismo/.test(lower)) {
      embedded_attrs.deporte = token;
    }
    else unknown_parts.push(token);
  }
  return { product_base, embedded_attrs, unknown_parts, raw };
}

/**
 * Producto base + principales + Otros atributos (concat) + Comentario (persona/residual).
 */
export function decomposeProductForSpreadsheet(
  displayName,
  attributes = {},
  existingComments = ""
) {
  const split = splitProductDisplayName(displayName);
  const merged = {
    ...split.embedded_attrs,
    ...normalizeAttributes(attributes),
  };
  const principal = {};
  const otrosParts = [];
  const commentParts = [];

  for (const [key, val] of Object.entries(merged)) {
    const v = compact(val);
    if (!v) continue;
    if (key === "extra") {
      commentParts.push(v);
      continue;
    }
    if (PRINCIPAL_ATTR_SET.has(key)) {
      principal[key] = v;
      continue;
    }
    const label = OTROS_ATTR_LABELS[key] || (KNOWN_ATTR_SET.has(key) ? key : null);
    if (label) otrosParts.push(`${label}: ${v}`);
    else commentParts.push(`${key}: ${v}`);
  }
  for (const part of split.unknown_parts || []) {
    const p = compact(part);
    if (p) commentParts.push(p);
  }
  const personComment = compact(existingComments);
  if (personComment) commentParts.unshift(personComment);

  const otros_atributos = [...new Set(otrosParts)].join(" · ");
  const comments = [...new Set(commentParts)].join(" · ");

  return {
    product_base: split.product_base || compact(displayName),
    principal,
    attributes: { ...principal }, // compat: solo principales tipados en columns
    otros_atributos,
    comments,
    raw: split.raw,
  };
}

/** Normaliza atributos desde match engine / Odoo PTAV / texto libre. */
export function normalizeAttributes(source = {}) {
  const out = {};
  const map = {
    cuello: ["cuello", "collar", "neck"],
    tela: ["tela", "material", "fabric"],
    manga: ["manga", "sleeves", "sleeve", "largo_manga", "largo manga"],
    tipo_pantalon: ["tipo_pantalon", "short_style", "short_type", "pantalon"],
    medias: ["medias", "socks", "media"],
    forro: ["forro", "lining"],
    deporte: ["deporte", "deportes", "sport", "disciplina"],
    genero: ["genero", "género", "gender", "sex"],
  };
  for (const [canon, aliases] of Object.entries(map)) {
    for (const key of aliases) {
      const val = source[key];
      if (val != null && compact(val)) {
        out[canon] = compact(val);
        break;
      }
    }
  }
  return out;
}

export function attributesFromOdooPtavs(ptavs = []) {
  const out = {};
  for (const ptav of ptavs) {
    const attrName = compact(ptav?.attribute_id?.[1] || ptav?.attribute_name || "").toLowerCase();
    const value = compact(ptav?.name || ptav?.value || "");
    if (!value) continue;
    if (/cuello/.test(attrName)) out.cuello = value;
    else if (/tela/.test(attrName)) out.tela = value;
    else if (/largo\s*manga|manga/.test(attrName)) out.manga = value;
    else if (/pantalon/.test(attrName)) out.tipo_pantalon = value;
    else if (/medias|media/.test(attrName)) out.medias = value;
    else if (/forro/.test(attrName)) out.forro = value;
    else if (/deporte/.test(attrName)) out.deporte = value;
    else if (/g[eé]nero|genero/.test(attrName)) out.genero = value;
  }
  return out;
}

export function buildResolvedLine(input = {}, index = 0) {
  const productText = compact(input.product_text || input.name || "");
  const split = splitProductDisplayName(input.display_name || productText);
  const attributes = {
    ...split.embedded_attrs,
    ...normalizeAttributes(input.attributes || input.product_attributes || {}),
    ...normalizeAttributes(input),
  };
  const qty = Math.max(0, Number(input.quantity || input.product_uom_qty || 0));
  const confidence = compact(input.confidence || input.match_confidence || "");
  const lineId =
    compact(input.line_id) ||
    `rl_${index + 1}_${String(input.product_variant_id || input.odoo_product_id || productText)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .slice(0, 40)}`;

  return {
    line_id: lineId,
    product_text: productText || split.product_base,
    product_base: compact(input.product_base) || split.product_base || productText,
    product_tmpl_id: Number(input.product_tmpl_id || 0) || null,
    product_variant_id:
      Number(input.product_variant_id || input.odoo_product_id || input.product_id || 0) || null,
    attributes,
    quantity: qty,
    unit_cop: Number(input.unit_cop || input.unit_price || input.price_unit || 0) || null,
    confidence,
    category: compact(input.category || "").toLowerCase() || null,
    commercial_role: compact(input.commercial_role || "") || null,
    comments: compact(input.comments || input.variant_notes || input.comment || ""),
    alternatives: Array.isArray(input.alternatives) ? input.alternatives : [],
    clarifying_question: compact(input.clarifying_question || "") || null,
  };
}

export function resolvedLinesFromCommercial(lines = []) {
  return (lines || []).map((line, i) => buildResolvedLine(line, i));
}

export function draftRowsFromResolvedLines(resolvedLines = []) {
  return (resolvedLines || [])
    .filter((line) => Number(line.product_variant_id || 0) > 0 && Number(line.quantity || 0) > 0)
    .map((line) => ({
      product_id: line.product_variant_id,
      name: line.product_base || line.product_text,
      quantity: line.quantity,
      unit_price: line.unit_cop || 0,
      line_id: line.line_id,
      attributes: line.attributes,
      comments: line.comments,
    }));
}

export function peopleCount(detail = {}) {
  if (Array.isArray(detail.people) && detail.people.length) return detail.people.length;
  if (Array.isArray(detail.rows) && detail.rows.length) return detail.rows.length;
  return Number(detail.person_count || 0) || 0;
}

export function peopleForSpreadsheet(detail = {}) {
  if (Array.isArray(detail.people) && detail.people.length) {
    return detail.people.map((person, i) => {
      const identity = person.identity || {};
      const components = Array.isArray(person.components) ? person.components : [];
      const primary = components[0] || {};
      const comments = [
        compact(person.comments),
        compact(primary.comment),
        primary.goalkeeper ? "Arquero" : "",
        compact(primary.sleeve || primary.manga),
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        person_id: person.person_id || `p${i + 1}`,
        nombre: compact(identity.print_name || identity.display_name || ""),
        numero: compact(identity.number || ""),
        talla: compact(primary.size || ""),
        color_medias: compact(person.color_medias || primary.color_medias || ""),
        manga: compact(primary.sleeve || primary.manga || ""),
        genero: compact(person.identity?.group || person.grupo || identity.group || ""),
        grupo: compact(person.identity?.group || person.grupo || identity.group || ""),
        comentarios: comments,
        product_line_key: compact(primary.product_line_key || person.product_line_key || ""),
        resolved_line_id: compact(primary.resolved_line_id || person.resolved_line_id || ""),
      };
    });
  }
  return (detail.rows || []).map((row, i) => ({
    person_id: `r${i + 1}`,
    nombre: compact(row.nombre || row.nombre_uniforme || ""),
    numero: compact(row.numero || ""),
    talla: compact(row.talla || ""),
    color_medias: compact(row.color_medias || row.medias || ""),
    manga: compact(row.manga || ""),
    genero: compact(row.genero || row.grupo || ""),
    grupo: compact(row.grupo || row.genero || ""),
    comentarios: [
      compact(row.comentario || row.rol || ""),
      row.arquero ? "Arquero" : "",
    ]
      .filter(Boolean)
      .join(" · "),
    product_line_key: compact(row.product_line_key || row.section_key || ""),
    resolved_line_id: compact(row.resolved_line_id || ""),
  }));
}

/**
 * Cruza personas del detalle vs cantidades de líneas resueltas.
 * Diseño ($0) se ignora.
 */
export function crossCheckPeopleVsLines({ detail = {}, resolvedLines = [] } = {}) {
  const people = peopleForSpreadsheet(detail);
  const productLines = (resolvedLines || []).filter(
    (line) =>
      Number(line.quantity || 0) > 0 &&
      !/dise[nñ]o/i.test(line.product_base || line.product_text || "")
  );
  const totalQty = productLines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  const personCount = people.length;
  const mismatches = [];

  if (productLines.length && totalQty > 0 && personCount === 0) {
    mismatches.push({
      code: "missing_detail_list",
      message: `Lista pendiente para ${totalQty} unidad(es) comerciales`,
      person_count: 0,
      line_qty: totalQty,
    });
  }

  if (productLines.length && personCount && personCount !== totalQty) {
    mismatches.push({
      code: "qty_people_vs_lines",
      message: `Personas en lista (${personCount}) ≠ suma de líneas (${totalQty})`,
      person_count: personCount,
      line_qty: totalQty,
    });
  }

  const linked = people.filter((p) => p.resolved_line_id || p.product_line_key);
  if (linked.length) {
    const byLine = {};
    for (const p of linked) {
      const key = p.resolved_line_id || p.product_line_key;
      byLine[key] = (byLine[key] || 0) + 1;
    }
    for (const line of productLines) {
      const key = line.line_id;
      const count = byLine[key] || byLine[line.product_text] || 0;
      if (count && count !== Number(line.quantity || 0)) {
        mismatches.push({
          code: "line_person_qty",
          line_id: key,
          message: `Línea ${line.product_base}: ${count} personas vs qty ${line.quantity}`,
          person_count: count,
          line_qty: line.quantity,
        });
      }
    }
  }

  const status = mismatches.length ? "mismatch" : personCount || totalQty ? "complete" : "empty";
  return {
    status,
    ok: mismatches.length === 0,
    person_count: personCount,
    line_qty: totalQty,
    mismatches,
  };
}

/**
 * Estado explícito del pedido vivo. Un borrador parcial sí se puede escribir en
 * Odoo, pero no debe confirmarse ni liberarse a producción hasta cerrar faltantes.
 */
export function buildOrderLifecycle(vars = {}, resolvedLines = [], cross = null) {
  const detail = vars.order_draft?.detail || {};
  const people = peopleForSpreadsheet(detail);
  const commercialQty = (resolvedLines || [])
    .filter((line) => !/dise[nñ]o/i.test(line.product_base || line.product_text || ""))
    .reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const missing = [];

  const hasCustomerName = Boolean(
    compact(
      vars.quote?.customer_display_name ||
        vars.order_draft?.customer_display_name ||
        vars.order_session?.display_name ||
        String(vars.lead?.name || "").replace(/^oportunidad\s+de\s+/i, "") ||
        vars.crm?.opportunity_name ||
        vars.crm?.partner_name
    )
  );
  const hasBoundOpp = Boolean(
    Number(vars?.lead?.id || 0) ||
      Number(vars?.crm?.opportunity_id || 0) ||
      Number(vars?.order_draft?.write?.odoo_lead_id || 0)
  );
  if (!hasCustomerName && !hasBoundOpp) {
    missing.push("cliente");
  }
  if (!people.length) {
    missing.push("lista_personas");
  } else {
    if (people.some((person) => !compact(person.nombre))) missing.push("nombres");
    if (people.some((person) => !compact(person.numero))) missing.push("numeros");
    if (people.some((person) => !compact(person.talla))) missing.push("tallas");
  }
  if (cross && !cross.ok && !missing.includes("lista_personas")) {
    missing.push("cuadre_cantidad_lista");
  }
  if ((resolvedLines || []).some((line) => !Number(line.product_variant_id || 0))) {
    missing.push("variantes_odoo");
  }

  const uniqueMissing = [...new Set(missing)];
  const prior = vars.order_draft?.lifecycle || vars.order_lifecycle || {};
  const state = uniqueMissing.length ? "draft_partial" : "draft_ready_for_review";

  return {
    schema_version: LIFECYCLE_SCHEMA,
    state,
    commercial_quantity: commercialQty,
    detail_quantity: people.length,
    missing_fields: uniqueMissing,
    confirmation_gate: {
      allowed: uniqueMissing.length === 0,
      reason: uniqueMissing.length
        ? `Faltan: ${uniqueMissing.join(", ")}`
        : "Datos iniciales completos; revisión humana requerida en Odoo.",
    },
    active_revision: Math.max(0, Number(prior.active_revision || 0)),
    updated_at: new Date().toISOString(),
  };
}

export function stableFingerprint(payload = {}) {
  const lines = (payload.resolved_lines || payload.commercial_lines || [])
    .map((l) => ({
      p: Number(l.product_variant_id || l.odoo_product_id || 0) || compact(l.product_text || l.name),
      q: Number(l.quantity || 0),
      a: normalizeAttributes(l.attributes || l),
    }))
    .sort((a, b) => String(a.p).localeCompare(String(b.p)));
  const people = peopleForSpreadsheet(payload.detail || {})
    .map((p) => `${p.numero}|${p.nombre}|${p.talla}`)
    .sort();
  return JSON.stringify({ lines, people, partner: compact(payload.partner_key || "") });
}

/**
 * Detecta CONFIRMO SUBIR en el mensaje del staff.
 * Kapso suele poner el inbound en intent.raw_text / last_user_input,
 * no solo en staff.lane_reply.
 */
export function hasConfirmoSubir(vars = {}) {
  const staff = vars.staff || {};
  const context = vars.context || {};
  const intent = vars.intent || {};
  const candidates = [
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
  return candidates.some((t) => /\bCONFIRMO\s+SUBIR\b/i.test(compact(t)));
}

/**
 * Exploración de diseño: excepción al mínimo 6.
 * - Solo diseño (línea Diseño / commercial_role=design), o
 * - 1 uniforme/camiseta de muestra + flag explícito (solo diseño / muestra / exploración).
 * Tras aprobar el diseño, el pedido de producción debe ser ≥6 con lista completa.
 */
export function isDesignExploration(vars = {}, resolvedLines = []) {
  const quote = vars.quote || {};
  const draft = vars.order_draft || {};
  const kind = compact(
    quote.order_kind || draft.commercial?.mode || draft.mode || quote.status || ""
  ).toLowerCase();
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
    draft.commercial?.notes,
    vars.staff?.last_inbound_text,
    vars.staff_lane_reply,
    vars.intent?.raw_text,
    vars.intent?.text,
    vars.last_user_input,
  ]
    .map((t) => compact(t))
    .join("\n");

  if (
    /\b(solo\s+dise[nñ]o|explor(ar|aci[oó]n)\s+(el\s+)?dise[nñ]o|muestra\s+(de\s+)?dise[nñ]o|1\s+uniforme\s+(de\s+)?(muestra|dise[nñ]o)|uniforme\s+de\s+muestra|dise[nñ]o\s+de\s+muestra)\b/i.test(
      blob
    )
  ) {
    return true;
  }

  const lines = Array.isArray(resolvedLines) ? resolvedLines : [];
  if (!lines.length) return false;

  const isDesignLine = (l) => {
    const role = compact(l.commercial_role).toLowerCase();
    const text = compact(l.product_text || l.product_base || l.name || "");
    if (role === "design") return true;
    if (/^dise[nñ]o\b/i.test(text) || /dise[nñ]o especial/i.test(text)) return true;
    return false;
  };

  const commercial = lines.filter((l) => !isDesignLine(l) && Number(l.quantity || 0) > 0);
  if (commercial.length === 0 && lines.some(isDesignLine)) return true;

  return false;
}

/**
 * Evalúa si el borrador staff puede escribirse en Odoo.
 * @returns {{ status, code, message, fingerprint, resolved_lines, cross_check }}
 */
export function evaluateStaffWriteReadiness(vars = {}) {
  const orderDraft = vars.order_draft || {};
  const quote = vars.quote || {};
  const staff = vars.staff || {};

  let resolved = Array.isArray(orderDraft.commercial?.resolved_lines)
    ? orderDraft.commercial.resolved_lines.map((l, i) => buildResolvedLine(l, i))
    : [];

  if (!resolved.length && Array.isArray(orderDraft.commercial?.lines)) {
    resolved = resolvedLinesFromCommercial(orderDraft.commercial.lines);
  }

  if (!resolved.length && compact(quote.product_text)) {
    resolved = [
      buildResolvedLine(
        {
          product_text: quote.product_text,
          quantity: quote.quantity,
          product_variant_id: quote.odoo_product_id,
          confidence: quote.match_confidence,
          attributes: quote.product_attributes,
          category: /uniforme/i.test(quote.product_text) ? "uniforme" : null,
        },
        0
      ),
    ];
  }

  const applied = applyEstimateToResolvedLines(vars, resolved, buildResolvedLine);
  resolved = applied.resolved_lines;
  const estimate = applied.estimate;

  if (!resolved.length) {
    return {
      status: WRITE_BLOCKED,
      code: "no_lines",
      message:
        "Pedido incompleto: sin líneas comerciales. Envía estimado o la lista/Excel.",
      fingerprint: null,
      resolved_lines: [],
      cross_check: null,
      estimate: null,
    };
  }

  const baseUniformQty = resolved
    .filter((l) => l.category === "uniforme" || /uniforme/i.test(l.product_text || ""))
    .reduce((s, l) => s + Number(l.quantity || 0), 0);
  const designExploration = isDesignExploration(vars, resolved);
  if (baseUniformQty > 0 && baseUniformQty < 6 && !designExploration) {
    return {
      status: WRITE_BLOCKED,
      code: "min_uniform",
      message: "Pedido incompleto: minimo 6 uniformes del mismo diseno.",
      fingerprint: null,
      resolved_lines: resolved,
      cross_check: null,
    };
  }

  const standalone = resolved.filter(
    (l) => l.category !== "uniforme" && !/uniforme/i.test(l.product_text || "")
  );
  if (baseUniformQty === 0 && !designExploration) {
    const below = standalone.find((l) => Number(l.quantity || 0) < 6);
    if (below) {
      return {
        status: WRITE_BLOCKED,
        code: "min_standalone",
        message: `Pedido mínimo 6 unidades de ${below.product_base || below.product_text}.`,
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
  const confirmoText = hasConfirmoSubir(vars);
  const confirmed =
    (compact(staff.confirmation_fingerprint) &&
      compact(staff.confirmation_fingerprint) === fingerprint) ||
    (confirmoText && Boolean(fingerprint));

  const peopleCount = Array.isArray(orderDraft.detail?.people)
    ? orderDraft.detail.people.length
    : Array.isArray(orderDraft.detail?.rows)
      ? orderDraft.detail.rows.length
      : 0;

  const isDesignExp = isDesignExploration(vars, resolved);
  const isEstimateSinLista = (isDesignExp || Boolean(orderDraft.detail?.lista_pending) || (peopleCount < 1 && resolved.some((l) => Number(l.quantity || 0) >= 6))) && !(Boolean(vars.user?.role === "staff") && !isDesignExp);

  if (peopleCount < 1 && !confirmed && isEstimateSinLista) {
    return {
      status: WRITE_NEEDS_CONFIRMATION,
      code: "needs_presupuesto_intent_sin_lista",
      message: "Sin lista de tallas aún. Responde HAZ PRESUPUESTO si deseas crear el borrador.",
      fingerprint,
      resolved_lines: resolved,
      cross_check: null,
      lista_pending: true,
    };
  }

  const parseStatus = compact(orderDraft.detail?.parse_status || "");
  const needsReviewStatus = parseStatus === "needs_review";
  const hasHardBlockers = Boolean(orderDraft.blockers?.length > 0) || needsReviewStatus;

  const compiledAmbiguity =
    ambiguous.length > 0 ||
    (unresolved.length > 0 &&
      resolved.some((l) => String(l.confidence || "") === "high"));

  const allResolvedHigh =
    resolved.length > 0 &&
    unresolved.length === 0 &&
    resolved.every((l) => String(l.confidence || "") === "high");

  if (
    (compiledAmbiguity || hasHardBlockers || (unresolved.length > 0 && resolved.some((l) => l.confidence === "low"))) &&
    !confirmed
  ) {
    const summary = resolved
      .map(
        (l) =>
          `• ${l.product_base || l.product_text} × ${l.quantity}` +
          (l.product_variant_id ? "" : " (sin variante Odoo)") +
          (l.confidence && l.confidence !== "high" ? ` [${l.confidence}]` : "")
      )
      .join("\n");
    return {
      status: WRITE_NEEDS_CONFIRMATION,
      code: "needs_confirmation",
      message: `Hay ambigüedad u organización parcial de los datos. Resumen:\n${summary}\nResponde CONFIRMO SUBIR para crear el borrador.`,
      fingerprint,
      resolved_lines: resolved,
      cross_check: null,
    };
  }

  if (confirmed && unresolved.length) {
    return {
      status: WRITE_BLOCKED,
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
    status: WRITE_READY,
    code: "pedido_ready",
    message: null,
    fingerprint,
    resolved_lines: resolved,
    cross_check: cross,
    estimate,
  };
}

export function spreadsheetStateFromCross(cross, spreadsheetId = null) {
  return {
    id: spreadsheetId,
    status: cross?.status || "empty",
    fingerprint: null,
    cross_check: cross || null,
  };
}

export { ATTR_KEYS };
