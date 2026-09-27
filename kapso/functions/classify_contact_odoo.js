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


/**
 * Contrato quote rico + plantilla LIFE_DOSSIER_v1 (pedido vivo multi-semana).
 * Fuente de verdad corta: vars.quote (Kapso).
 * Fuente de verdad larga: descripción oportunidad CRM con bloque LIFE_DOSSIER_v1.
 */

const DOSSIER_MARKER = "LIFE_DOSSIER_v1";

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** ¿El quote tiene suficiente señal comercial para hidratar? */
function quoteLooksUseful(quote = {}) {
  if (!quote || typeof quote !== "object") return false;
  if (asArray(quote.lines).some((l) => compact(l.product_text) || num(l.quantity) > 0)) {
    return true;
  }
  return Boolean(
    compact(quote.product_text) ||
      num(quote.quantity) > 0 ||
      num(quote.unit_cop) > 0 ||
      compact(quote.customer_display_name) ||
      compact(quote.notes) ||
      asArray(quote.media_refs).length > 0
  );
}

/** Peso para elegir el mejor quote entre ejecuciones. */
function quoteRichnessScore(quote = {}) {
  if (!quoteLooksUseful(quote)) return 0;
  let score = 0;
  if (compact(quote.product_text)) score += 2;
  if (num(quote.quantity) > 0) score += 2;
  if (num(quote.unit_cop) > 0) score += 1;
  if (num(quote.total_cop) > 0) score += 1;
  score += Math.min(4, asArray(quote.lines).length * 2);
  if (quote.variants && typeof quote.variants === "object") {
    score += Object.values(quote.variants).filter((v) => compact(v)).length;
  }
  if (compact(quote.notes)) score += 2;
  score += Math.min(3, asArray(quote.media_refs).length);
  if (compact(quote.dossier_text) || compact(quote.status)) score += 1;
  return score;
}

/**
 * Normaliza quote legado (solo product_text) a shape rico.
 * No inventa líneas: si no hay lines[], crea una desde product_text cuando hay qty/precio.
 */
function normalizeQuote(quote = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const base = quote && typeof quote === "object" ? { ...quote } : {};
  let lines = asArray(base.lines)
    .map((line) => ({
      product_text: compact(line.product_text || line.product || line.name) || null,
      quantity: num(line.quantity ?? line.qty),
      unit_cop: num(line.unit_cop ?? line.unit),
      total_cop: num(line.total_cop ?? line.total),
      odoo_product_id: line.odoo_product_id ?? null,
      garment_type: compact(line.garment_type) || null,
    }))
    .filter((l) => l.product_text || l.quantity || l.unit_cop);

  const productText = compact(base.product_text || base.product) || null;
  const quantity = num(base.quantity ?? base.qty);
  const unitCop = num(base.unit_cop ?? base.unit);
  const totalCop = num(base.total_cop ?? base.total);

  if (!lines.length && (productText || quantity || unitCop)) {
    lines = [
      {
        product_text: productText,
        quantity,
        unit_cop: unitCop,
        total_cop: totalCop,
        odoo_product_id: base.odoo_product_id ?? null,
        garment_type: compact(base.garment_type) || null,
      },
    ];
  }

  const variants =
    base.variants && typeof base.variants === "object"
      ? {
          material: compact(base.variants.material || base.material) || null,
          collar: compact(base.variants.collar || base.collar || base.variant) || null,
          sleeves: compact(base.variants.sleeves || base.sleeves) || null,
          sport: compact(base.variants.sport || base.sport) || null,
        }
      : {
          material: compact(base.material) || null,
          collar: compact(base.collar || base.variant) || null,
          sleeves: compact(base.sleeves) || null,
          sport: compact(base.sport) || null,
        };

  const media_refs = asArray(base.media_refs)
    .map((m) => ({
      url: compact(m.url) || null,
      summary: compact(m.summary || m.photo_summary) || null,
      role: compact(m.role) || "design",
      at: compact(m.at) || null,
    }))
    .filter((m) => m.url || m.summary);

  const history = asArray(base.history)
    .map((h) => ({
      at: compact(h.at) || null,
      note: compact(h.note || h.text) || null,
    }))
    .filter((h) => h.note);

  const primary = lines[0] || {};
  const revision = Number(base.revision || 0) || (quoteLooksUseful(base) ? 1 : 0);

  return {
    ...base,
    product_text: productText || primary.product_text || null,
    quantity: quantity ?? primary.quantity ?? null,
    unit_cop: unitCop ?? primary.unit_cop ?? null,
    total_cop: totalCop ?? primary.total_cop ?? null,
    odoo_product_id: base.odoo_product_id ?? primary.odoo_product_id ?? null,
    match_confidence: compact(base.match_confidence) || null,
    lines,
    variants,
    notes: compact(base.notes) || null,
    media_refs,
    history,
    status:
      compact(base.status) ||
      (quoteLooksUseful(base) ? "cotizando" : null),
    revision,
    updated_at: compact(base.updated_at) || now,
    dossier_text: compact(base.dossier_text) || null,
  };
}

/** Fusiona prior + next privilegiando next en campos escalares y uniendo lines/media/history. */
function mergeQuotes(prior, next, options = {}) {
  const now = options.now || new Date().toISOString();
  const a = normalizeQuote(prior || {}, { now });
  const b = normalizeQuote(next || {}, { now });
  if (!quoteLooksUseful(a) && !quoteLooksUseful(b)) return normalizeQuote({}, { now });
  if (!quoteLooksUseful(b)) return a;
  if (!quoteLooksUseful(a)) return { ...b, revision: Math.max(1, b.revision || 1), updated_at: now };

  const lineKey = (l) =>
    `${compact(l.product_text).toLowerCase()}|${l.quantity || ""}|${l.unit_cop || ""}`;
  const lineMap = new Map();
  for (const l of a.lines) lineMap.set(lineKey(l), l);
  for (const l of b.lines) lineMap.set(lineKey(l), l);
  const lines = [...lineMap.values()];

  const mediaMap = new Map();
  for (const m of [...a.media_refs, ...b.media_refs]) {
    const key = m.url || m.summary;
    if (key) mediaMap.set(key, m);
  }

  const history = [...a.history, ...b.history].slice(-20);
  const bump =
    options.bumpRevision === true ||
    a.quantity !== b.quantity ||
    a.product_text !== b.product_text ||
    a.lines.length !== b.lines.length;

  const merged = normalizeQuote(
    {
      ...a,
      ...b,
      product_text: b.product_text || a.product_text,
      quantity: b.quantity ?? a.quantity,
      unit_cop: b.unit_cop ?? a.unit_cop,
      total_cop: b.total_cop ?? a.total_cop,
      odoo_product_id: b.odoo_product_id ?? a.odoo_product_id,
      match_confidence: b.match_confidence || a.match_confidence,
      lines,
      variants: {
        material: b.variants.material || a.variants.material,
        collar: b.variants.collar || a.variants.collar,
        sleeves: b.variants.sleeves || a.variants.sleeves,
        sport: b.variants.sport || a.variants.sport,
      },
      notes: [a.notes, b.notes].filter(Boolean).join(" · ") || null,
      media_refs: [...mediaMap.values()],
      history,
      status: b.status || a.status || "cotizando",
      revision: bump ? Math.max(a.revision || 0, b.revision || 0) + 1 : Math.max(a.revision || 1, b.revision || 1),
      updated_at: now,
    },
    { now }
  );
  merged.dossier_text = buildDossierText(merged);
  return merged;
}

function money(n) {
  const v = num(n);
  if (!v) return null;
  return `$${Math.round(v).toLocaleString("es-CO")}`;
}

/** Texto plano LIFE_DOSSIER_v1 para CRM description / notify. */
function buildDossierText(quoteInput = {}, meta = {}) {
  const q = normalizeQuote(quoteInput);
  const lines = [
    DOSSIER_MARKER,
    `cliente: ${compact(meta.customer_name || q.customer_display_name) || "—"}`,
    `estado: ${compact(q.status) || "cotizando"}`,
    `revision: ${q.revision || 1}`,
    `updated_at: ${compact(q.updated_at) || new Date().toISOString()}`,
    `qty: ${q.quantity ?? "—"}`,
  ];

  if (q.lines.length) {
    lines.push("opciones:");
    for (const l of q.lines) {
      const unit = money(l.unit_cop);
      const total = money(l.total_cop);
      const priceBit =
        unit && total ? `${unit} → ${total}` : unit || total || "sin precio";
      lines.push(
        `  - ${l.product_text || "producto"}${l.quantity != null ? ` x${l.quantity}` : ""}: ${priceBit}`
      );
    }
  } else if (q.product_text) {
    lines.push("opciones:");
    const unit = money(q.unit_cop);
    const total = money(q.total_cop);
    const priceBit =
      unit && total ? `${unit} → ${total}` : unit || total || "sin precio";
    lines.push(
      `  - ${q.product_text}${q.quantity != null ? ` x${q.quantity}` : ""}: ${priceBit}`
    );
  }

  const v = q.variants || {};
  const variantBits = [v.material, v.collar, v.sleeves, v.sport].filter(Boolean);
  if (variantBits.length) lines.push(`variantes: ${variantBits.join(", ")}`);
  if (q.notes) lines.push(`personalizacion: ${q.notes}`);
  if (q.media_refs.length) {
    lines.push("media:");
    for (const m of q.media_refs.slice(0, 8)) {
      lines.push(`  - [${m.role}] ${m.summary || m.url || "ref"}`);
    }
  }
  if (q.history.length) {
    lines.push("historial:");
    for (const h of q.history.slice(-10)) {
      lines.push(`  - ${h.at || "—"}: ${h.note}`);
    }
  }
  return lines.join("\n");
}

/** Extrae bloque LIFE_DOSSIER_v1 de HTML o texto (descripción CRM). */
function parseDossierFromDescription(description) {
  const raw = String(description || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  const idx = raw.indexOf(DOSSIER_MARKER);
  if (idx < 0) return null;
  const block = raw.slice(idx).split(/\n(?=[A-Z_]{3,}:)/)[0] || raw.slice(idx);
  // Take until blank double-newline or end; keep indented lines
  const body = raw.slice(idx);
  const endMatch = body.search(/\n\n(?!  -)/);
  const text = (endMatch > 0 ? body.slice(0, endMatch) : body).trim();

  const get = (key) => {
    const re = new RegExp(`^${key}:\\s*(.+)$`, "im");
    const m = text.match(re);
    return m ? compact(m[1]) : null;
  };

  const lines = [];
  const optSection = text.match(/opciones:\n((?:  - .+\n?)+)/i);
  if (optSection) {
    for (const row of optSection[1].split("\n")) {
      const m = row.match(/^\s*-\s*(.+?)(?:\s+x(\d+))?:\s*(.+)$/);
      if (!m) continue;
      const product_text = compact(m[1]);
      const quantity = m[2] ? Number(m[2]) : null;
      const priceRaw = compact(m[3]);
      let unit_cop = null;
      let total_cop = null;
      const prices = [...priceRaw.matchAll(/\$?\s*([\d.]+)/g)].map((x) =>
        Number(String(x[1]).replace(/\./g, ""))
      );
      if (prices.length >= 2) {
        unit_cop = prices[0];
        total_cop = prices[1];
      } else if (prices.length === 1) {
        unit_cop = prices[0];
      }
      lines.push({ product_text, quantity, unit_cop, total_cop });
    }
  }

  const variantsRaw = get("variantes");
  const variants = { material: null, collar: null, sleeves: null, sport: null };
  if (variantsRaw) {
    const parts = variantsRaw.split(",").map((p) => compact(p).toLowerCase());
    for (const p of parts) {
      if (/dry|dumonti|hidrotec|lluvia/.test(p)) variants.material = p;
      else if (/cuello|polo|redondo|sport|\bv\b/.test(p)) variants.collar = p;
      else if (/manga/.test(p)) variants.sleeves = p;
      else if (/futbol|voleibol|baloncesto|atletismo/.test(p)) variants.sport = p;
    }
  }

  const media_refs = [];
  const mediaSection = text.match(/media:\n((?:  - .+\n?)+)/i);
  if (mediaSection) {
    for (const row of mediaSection[1].split("\n")) {
      const m = row.match(/^\s*-\s*\[([^\]]+)\]\s*(.+)$/);
      if (m) media_refs.push({ role: compact(m[1]), summary: compact(m[2]), url: null });
    }
  }

  const history = [];
  const histSection = text.match(/historial:\n((?:  - .+\n?)+)/i);
  if (histSection) {
    for (const row of histSection[1].split("\n")) {
      const m = row.match(/^\s*-\s*([^:]+):\s*(.+)$/);
      if (m) history.push({ at: compact(m[1]), note: compact(m[2]) });
    }
  }

  const primary = lines[0] || {};
  return normalizeQuote({
    product_text: primary.product_text || null,
    quantity: num(get("qty")) ?? primary.quantity,
    unit_cop: primary.unit_cop,
    total_cop: primary.total_cop,
    lines,
    variants,
    notes: get("personalizacion"),
    media_refs,
    history,
    status: get("estado") || "cotizando",
    revision: num(get("revision")) || 1,
    updated_at: get("updated_at"),
    customer_display_name: get("cliente"),
    dossier_text: text,
  });
}

/**
 * Inserta o reemplaza bloque LIFE_DOSSIER_v1 en descripción CRM (HTML o texto).
 */
function mergeDescriptionWithDossier(existingDescription, quote, meta = {}) {
  const dossier = buildDossierText(quote, meta);
  const existing = String(existingDescription || "");
  const plainExisting = existing
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const idx = plainExisting.indexOf(DOSSIER_MARKER);
  const dossierHtml = `<pre>${dossier.replace(/</g, "&lt;")}</pre>`;
  if (idx < 0) {
    if (!existing.trim()) return dossierHtml;
    return `${existing}\n\n${dossierHtml}`;
  }
  // Replace previous dossier block in HTML by rewriting whole description: keep non-dossier parts
  const without = existing.replace(
    /<pre>[\s\S]*?LIFE_DOSSIER_v1[\s\S]*?<\/pre>/i,
    ""
  ).replace(/LIFE_DOSSIER_v1[\s\S]*?(?=\n\n|$)/, "");
  return `${without.trim()}\n\n${dossierHtml}`.trim();
}

/** Resumen corto para el agente al retomar. */
function continuityResumeHint(quoteInput = {}) {
  const q = normalizeQuote(quoteInput);
  if (!quoteLooksUseful(q)) return null;
  const bits = [];
  if (q.quantity && q.product_text) bits.push(`${q.quantity} × ${q.product_text}`);
  else if (q.product_text) bits.push(q.product_text);
  const v = q.variants || {};
  const vars = [v.material, v.collar, v.sleeves].filter(Boolean);
  if (vars.length) bits.push(vars.join(", "));
  if (q.lines.length > 1) {
    bits.push(
      `opciones: ${q.lines.map((l) => l.product_text || "línea").join(" / ")}`
    );
  }
  const unit = money(q.unit_cop);
  const total = money(q.total_cop);
  if (unit && total) bits.push(`${unit} c/u · ${total} total`);
  else if (unit) bits.push(`${unit} c/u`);
  return bits.join(" · ");
}


/**
 * Retoma quote/contexto comercial entre conversaciones Kapso.
 * Cuando WhatsApp Business cierra el hilo (ended) y abre uno nuevo,
 * la ejecución anterior muere; este helper busca por teléfono la última
 * ejecución con quote útil y la reinyecta.
 */


function kapsoConfig(env = {}) {
  const base = String(env.KAPSO_API_BASE_URL || "").replace(/\/$/, "");
  const key = String(env.KAPSO_API_KEY || "").trim();
  const workflowId = String(
    env.KAPSO_WORKFLOW_ID || "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6"
  ).trim();
  if (!base || !key) return null;
  return { base, key, workflowId };
}

async function kapsoGet(cfg, path, query = {}) {
  const url = new URL(`${cfg.base}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-Key": cfg.key,
    },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`kapso_${resp.status}:${json?.error || resp.statusText}`);
  }
  return json?.data ?? json;
}

function unwrapList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.conversations)) return payload.conversations;
  if (Array.isArray(payload?.whatsapp_conversations)) {
    return payload.whatsapp_conversations;
  }
  if (Array.isArray(payload?.executions)) return payload.executions;
  return [];
}

/** Digits-only compare; require local-10 overlap so we never hydrate another WA. */
function conversationMatchesPhone(conversation, phoneDigits) {
  const want = String(phoneDigits || "").replace(/\D/g, "");
  if (!want) return false;
  const got = String(
    conversation?.phone_number ||
      conversation?.phone ||
      conversation?.wa_id ||
      ""
  ).replace(/\D/g, "");
  if (!got) return false;
  if (got === want) return true;
  const wantLocal = want.length >= 10 ? want.slice(-10) : want;
  const gotLocal = got.length >= 10 ? got.slice(-10) : got;
  return wantLocal.length >= 10 && wantLocal === gotLocal;
}

/**
 * @returns {Promise<null|{
 *   quote: object,
 *   funnel: object|null,
 *   order_focus: object|null,
 *   source: { conversation_id: string, execution_id: string, status: string }
 * }>}
 */
async function hydrateCustomerSessionFromKapso(env, phone, options = {}) {
  const cfg = kapsoConfig(env);
  if (!cfg) {
    return {
      ok: false,
      error: "missing_kapso_secrets",
      quote: null,
      funnel: null,
      order_focus: null,
      source: null,
    };
  }

  const phoneDigits = String(phone ?? "").replace(/\D/g, "");
  if (!phoneDigits) {
    return {
      ok: false,
      error: "missing_phone",
      quote: null,
      funnel: null,
      order_focus: null,
      source: null,
    };
  }

  const currentConversationId = String(options.currentConversationId || "").trim();
  const currentExecutionId = String(options.currentExecutionId || "").trim();

  try {
    // Kapso list often ignores/weakly applies `phone`; always filter client-side
    // (cross-customer quote bleed: Rinfor←Isbe←Así Es La Vida, 2026-07-18).
    const conversationsPayload = await kapsoGet(cfg, "/platform/v1/whatsapp/conversations", {
      phone_number: phoneDigits,
      phone: phoneDigits,
      q: phoneDigits,
      per_page: 50,
    });
    const conversationsRaw = unwrapList(conversationsPayload);
    const conversations = conversationsRaw.filter((c) =>
      conversationMatchesPhone(c, phoneDigits)
    );
    if (!conversations.length) {
      return {
        ok: false,
        error: conversationsRaw.length ? "no_conversations_for_phone" : "no_conversations",
        quote: null,
        funnel: null,
        order_focus: null,
        source: null,
      };
    }

    // Preferir hilos ended recientes, luego otros activos distintos al actual.
    const ordered = [...conversations].sort((a, b) => {
      const ta = Date.parse(a.last_active_at || a.updated_at || a.created_at || 0);
      const tb = Date.parse(b.last_active_at || b.updated_at || b.created_at || 0);
      return tb - ta;
    });

    let best = null;

    for (const conversation of ordered) {
      const conversationId = String(conversation.id || "");
      if (!conversationId) continue;

      const executionsPayload = await kapsoGet(
        cfg,
        `/platform/v1/workflows/${cfg.workflowId}/executions`,
        {
          whatsapp_conversation_id: conversationId,
          per_page: 5,
        }
      );
      // Platform a veces anida { executions: [...] } dentro de data.
      const executions = unwrapList(
        executionsPayload?.executions ? executionsPayload : executionsPayload
      );

      for (const execution of executions) {
        const executionId = String(execution.id || "");
        if (!executionId || executionId === currentExecutionId) continue;

        const detailPayload = await kapsoGet(
          cfg,
          `/platform/v1/workflow_executions/${executionId}`
        );
        const detail = detailPayload?.execution || detailPayload;
        const priorVars =
          detail?.execution_context?.vars ||
          detailPayload?.execution_context?.vars ||
          {};
        const rawQuote = priorVars.quote || null;
        if (!quoteLooksUseful(rawQuote)) continue;

        const quote = normalizeQuote({
          ...rawQuote,
          customer_display_name_explicit: Boolean(
            priorVars.quote?.customer_display_name_explicit
          ),
        });
        const candidate = {
          ok: true,
          error: null,
          quote,
          resume_hint: continuityResumeHint(quote),
          funnel: priorVars.funnel || null,
          order_focus: {
            id: priorVars.orders?.focus_order_id || priorVars.order?.id || null,
            name: priorVars.orders?.focus_order_name || priorVars.order?.name || null,
          },
          source: {
            conversation_id: conversationId,
            execution_id: executionId,
            status: detail?.status || execution.status || null,
            same_conversation: conversationId === currentConversationId,
          },
          _score: quoteRichnessScore(quote),
        };
        if (!best || candidate._score > best._score) best = candidate;
      }
    }

    if (best) {
      const { _score, ...rest } = best;
      return rest;
    }
  } catch (err) {
    return {
      ok: false,
      error: String(err?.message || err || "hydrate_failed").slice(0, 240),
      quote: null,
      funnel: null,
      order_focus: null,
      source: null,
    };
  }

  return {
    ok: false,
    error: "no_useful_quote",
    quote: null,
    funnel: null,
    order_focus: null,
    source: null,
  };
}

/**
 * Normaliza y resume mensajes recientes de WhatsApp para dar continuidad
 * y visibilidad de las intervenciones del staff al agente orquestador.
 */
function parseRecentMessages(rawMessages = [], options = {}) {
  const currentMessageId = options.currentMessageId ? String(options.currentMessageId) : null;
  const list = unwrapList(rawMessages);

  const parsed = [];
  for (const m of list) {
    const id = String(m?.id || m?.wamid || "");
    if (currentMessageId && id === currentMessageId) continue;

    const d = String(m?.kapso?.direction || m?.direction || "").toLowerCase();
    const dir = d === "inbound" || d === "in" ? "inbound" : d === "outbound" || d === "out" ? "outbound" : "unknown";
    const origin = String(m?.kapso?.origin || m?.origin || "").toLowerCase();

    const k = m?.kapso || {};
    const t = m?.text || {};
    const textParts = [
      k.content,
      k.transcription,
      k.caption,
      typeof t === "string" ? t : t?.body,
      m?.caption,
      m?.image?.caption,
      m?.document?.filename,
      m?.document?.caption,
    ].map((x) => String(x || "").trim()).filter(Boolean);

    let text = textParts.join(" ").slice(0, 500);
    if (!text) {
      const type = String(m?.type || m?.message_type || m?.kapso?.type || "text").toLowerCase();
      if (type === "image") text = "[imagen]";
      else if (type === "audio") text = "[audio]";
      else if (type === "video") text = "[video]";
      else if (type === "document") text = "[documento]";
      else if (type === "sticker") text = "[sticker]";
      else text = "";
    }
    if (!text) continue;

    let speaker = "BOT";
    if (dir === "inbound") {
      speaker = "CLIENTE";
    } else {
      if (origin === "business_app" || origin === "user" || origin === "staff" || origin === "human") {
        speaker = "STAFF";
      } else {
        speaker = "BOT";
      }
    }

    const ts = Date.parse(m?.created_at || m?.timestamp || m?.inserted_at || 0) || 0;
    parsed.push({ id, dir, origin, speaker, text, ts });
  }

  parsed.sort((a, b) => a.ts - b.ts);

  const staffMessages = parsed.filter((m) => m.speaker === "STAFF");
  const lastStaff = staffMessages.length ? staffMessages[staffMessages.length - 1].text : null;
  const staffParticipated = staffMessages.length > 0;

  const summarySlice = parsed.slice(-6);
  const summaryLines = summarySlice.map((m) => `[${m.speaker}]: ${m.text.replace(/\s+/g, " ").trim()}`);
  const recentThreadSummary = summaryLines.join("\n");

  return {
    messages: parsed,
    has_prior_conversation: parsed.length > 0,
    staff_participated: staffParticipated,
    last_staff_message: lastStaff,
    recent_thread_summary: recentThreadSummary || null,
  };
}

async function fetchRecentThreadContext(cfg, conversationId, options = {}) {
  if (!cfg || !conversationId) {
    return {
      has_prior_conversation: false,
      staff_participated: false,
      last_staff_message: null,
      recent_thread_summary: null,
    };
  }
  try {
    const payload = await kapsoGet(cfg, "/platform/v1/whatsapp/messages", {
      conversation_id: conversationId,
      per_page: options.limit || 12,
    });
    return parseRecentMessages(payload, options);
  } catch (err) {
    return {
      has_prior_conversation: false,
      staff_participated: false,
      last_staff_message: null,
      recent_thread_summary: null,
      error: String(err?.message || err),
    };
  }
}

function mapActiveOrders(activeOrders = [], projectTasks = []) {
  const taskByOrderId = new Map();
  for (const task of projectTasks || []) {
    const soId = Array.isArray(task.sale_order_id)
      ? task.sale_order_id[0]
      : task.sale_order_id;
    if (!soId || taskByOrderId.has(soId)) continue;
    taskByOrderId.set(soId, {
      task_id: task.id,
      task_name: task.name || null,
      stage: Array.isArray(task.stage_id) ? task.stage_id[1] : null,
    });
  }

  return (activeOrders || []).map((order) => {
    const linked = taskByOrderId.get(order.id) || {};
    return {
      id: order.id,
      name: order.name,
      state: order.state,
      task_id: linked.task_id || null,
      task_stage: linked.stage || null,
    };
  });
}



async function fetchOpenOpportunityDossier(executeKw, partnerId) {
  if (!partnerId) return null;
  try {
    const leads = await executeKw(
      "crm.lead",
      "search_read",
      [
        [
          ["partner_id", "=", partnerId],
          ["type", "=", "opportunity"],
          ["active", "=", true],
        ],
      ],
      {
        fields: ["id", "name", "description", "stage_id", "write_date"],
        limit: 5,
        order: "write_date desc",
      }
    );
    for (const lead of leads || []) {
      const parsed = parseDossierFromDescription(lead.description || "");
      if (parsed && quoteLooksUseful(parsed)) {
        return {
          lead_id: lead.id,
          lead_name: lead.name || null,
          stage: Array.isArray(lead.stage_id) ? lead.stage_id[1] : null,
          quote: parsed,
        };
      }
    }
  } catch (_e) {
    return null;
  }
  return null;
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context || {};
  const execVars = vars.vars || body?.execution_context?.vars || {};
  const input = body?.input || {};
  const whatsappContext = body?.whatsapp_context || {};
  const now = new Date().toISOString();

  const phone = String(
    input.phone ||
      execVars?.user?.wa_id ||
      execVars?.user?.phone ||
      whatsappContext?.conversation?.phone_number ||
      ""
  ).trim();
  const currentConversationId = String(
    whatsappContext?.conversation?.id ||
      execVars?.kapso?.conversation_id ||
      body?.input?.conversation_id ||
      body?.conversation_id ||
      ""
  ).trim();
  const currentExecutionId = String(
    body?.execution_id ||
      body?.workflow_execution_id ||
      execVars?.kapso?.execution_id ||
      ""
  ).trim();
  const currentMessageId = String(
    whatsappContext?.message?.id ||
      execVars?.kapso?.message_id ||
      body?.input?.message_id ||
      body?.message_id ||
      ""
  ).trim();

  const ODOO_URL = env.ODOO_URL;
  const ODOO_DB = env.ODOO_DB;
  const ODOO_USERNAME = env.ODOO_USERNAME;
  const ODOO_PASSWORD = env.ODOO_PASSWORD;
  const stakeholders = String(env.LIFE_STAKEHOLDER_WHITELIST || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const normalizedPhone = normalizeWaPhone(phone);
  const baseUser = execVars?.user || {};
  if (!normalizedPhone.e164Digits) {
    return response("new_customer", false, 0, now, baseUser);
  }

  // Memoria y Continuidad de Hilo: obtener contexto de mensajes recientes en Kapso
  const cfg = kapsoConfig(env);
  let threadContext = null;
  if (cfg) {
    let convId = currentConversationId;
    if (!convId && normalizedPhone.e164Digits) {
      try {
        const convPayload = await kapsoGet(cfg, "/platform/v1/whatsapp/conversations", {
          phone_number: normalizedPhone.e164Digits,
          per_page: 5,
        });
        const list = unwrapList(convPayload).filter((c) =>
          conversationMatchesPhone(c, normalizedPhone.e164Digits)
        );
        if (list.length > 0) convId = String(list[0].id || "");
      } catch (_e) {
        // ignore
      }
    }
    if (convId) {
      threadContext = await fetchRecentThreadContext(cfg, convId, {
        currentMessageId,
        limit: 10,
      });
      if (threadContext) {
        threadContext.conversation_id = convId;
      }
    }
  }

  if (
    stakeholders.includes(normalizedPhone.e164Digits) ||
    stakeholders.includes(normalizedPhone.e164Plus)
  ) {
    return response("stakeholder", true, 0, now, baseUser, null, { threadContext });
  }

  // Memoria Kapso: retomar quote aunque Odoo no conozca al partner aún.
  const hydrateResult = await hydrateCustomerSessionFromKapso(env, phone, {
    currentConversationId,
    currentExecutionId,
  });
  const hydrated =
    hydrateResult?.ok && hydrateResult?.quote ? hydrateResult : null;
  const hydrateError = hydrateResult?.ok ? null : hydrateResult?.error || null;
  const existingQuote = execVars?.quote || null;

  if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
    return response("new_customer", false, 0, now, baseUser, null, {
      threadContext,
      hydrated,
      hydrateError,
      existingQuote,
      activeOrders: [],
      projectTasks: [],
      lastOrder: null,
      historyCount: 0,
    });
  }

  try {
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
      if (json?.error) throw new Error(json.error?.message || "Odoo RPC error");
      return json.result;
    };
    const uid = await rpc("common", "authenticate", [
      ODOO_DB,
      ODOO_USERNAME,
      ODOO_PASSWORD,
      {},
    ]);
    if (!uid) {
      return response("new_customer", false, 0, now, baseUser, null, {
        threadContext,
        hydrated,
        hydrateError,
        existingQuote,
        activeOrders: [],
        projectTasks: [],
        lastOrder: null,
        historyCount: 0,
      });
    }

    const executeKw = async (model, method, positionalArgs = [], kw = {}) =>
      rpc("object", "execute_kw", [
        ODOO_DB,
        uid,
        ODOO_PASSWORD,
        model,
        method,
        positionalArgs,
        kw,
      ]);

    const lookup = await findPartnerByWaPhone(executeKw, phone, {
      fields: ["id", "name", "phone", "phone_sanitized"],
    });
    const partner = lookup.partner;
    if (!partner?.id) {
      return response("new_customer", false, 0, now, baseUser, null, {
        threadContext,
        hydrated,
        hydrateError,
        existingQuote,
        activeOrders: [],
        projectTasks: [],
        lastOrder: null,
        historyCount: 0,
      });
    }

    const orders = await executeKw(
      "sale.order",
      "search_read",
      [[["partner_id", "=", partner.id]]],
      {
        fields: ["id", "name", "state", "date_order"],
        limit: 10,
        order: "id desc",
      }
    );
    const historyCount = Array.isArray(orders) ? orders.length : 0;
    const lastOrder = historyCount ? orders[0] : null;

    let activeOrders = [];
    try {
      activeOrders = await executeKw(
        "sale.order",
        "search_read",
        [
          [
            ["partner_id", "=", partner.id],
            ["state", "in", ["draft", "sent", "sale"]],
          ],
        ],
        { fields: ["id", "name", "state"], limit: 8, order: "id desc" }
      );
    } catch (_e) {
      activeOrders = [];
    }

    let projectTasks = [];
    try {
      projectTasks = await executeKw(
        "project.task",
        "search_read",
        [[["partner_id", "=", partner.id]]],
        {
          fields: ["id", "name", "stage_id", "project_id", "sale_order_id"],
          limit: 8,
          order: "write_date desc",
        }
      );
    } catch (_e) {
      const orderIds = (orders || []).map((o) => o.id);
      if (orderIds.length) {
        try {
          projectTasks = await executeKw(
            "project.task",
            "search_read",
            [[["sale_order_id", "in", orderIds]]],
            {
              fields: ["id", "name", "stage_id", "project_id", "sale_order_id"],
              limit: 8,
              order: "write_date desc",
            }
          );
        } catch (_e2) {
          projectTasks = [];
        }
      }
    }

    const activeOrderCount = Array.isArray(activeOrders) ? activeOrders.length : 0;
    const projectCardCount = Array.isArray(projectTasks) ? projectTasks.length : 0;
    const latestTask = projectCardCount ? projectTasks[0] : null;
    const hasHistoryOrActive =
      historyCount > 0 || activeOrderCount > 0 || projectCardCount > 0;

    const opportunityDossier = await fetchOpenOpportunityDossier(
      executeKw,
      partner.id
    );

    const partnerUserFields = {
      partner_id: partner.id,
      partner_name: partner.name || null,
      partner_match_strategy: lookup.match_strategy,
      partner_match_ambiguous: lookup.ambiguous,
      partner_match_candidates: lookup.candidates || [],
      wa_phone_normalized: normalizedPhone.e164Plus,
    };

    const segment = hasHistoryOrActive ? "existing_customer" : "new_customer";
    return response(segment, true, historyCount, now, {
      ...baseUser,
      ...partnerUserFields,
      has_active_orders: activeOrderCount > 0,
      has_project_cards: projectCardCount > 0,
    }, null, {
      threadContext,
      hydrated,
      hydrateError,
      opportunityDossier,
      activeOrders,
      projectTasks,
      lastOrder,
      historyCount,
      latestTask,
      projectCardCount,
      existingQuote,
    });
  } catch (_error) {
    return response("new_customer", false, 0, now, baseUser, "odoo_error", {
      threadContext,
      hydrated,
      hydrateError,
      existingQuote,
      activeOrders: [],
      projectTasks: [],
      lastOrder: null,
      historyCount: 0,
    });
  }
}

function response(
  segment,
  known,
  historyCount,
  now,
  baseUser = {},
  errorCode = null,
  extras = {}
) {
  const activeMapped = mapActiveOrders(
    extras.activeOrders || [],
    extras.projectTasks || []
  );
  const hydrated = extras.hydrated || null;
  const opportunityDossier = extras.opportunityDossier || null;
  const lastOrder = extras.lastOrder || null;
  const latestTask = extras.latestTask || null;
  const projectCardCount = Number(extras.projectCardCount || 0);
  const threadContext = extras.threadContext || null;
  const hasPriorThread = Boolean(threadContext?.has_prior_conversation);
  const staffParticipated = Boolean(threadContext?.staff_participated);
  const lastStaffMsg = threadContext?.last_staff_message || null;
  const threadSummary = threadContext?.recent_thread_summary || null;

  // Memoria: Kapso hydrate + dossier CRM (elige/merge el más rico)
  let resumedQuote = null;
  let continuitySource = known ? "odoo_only" : "none";
  let continuityMeta = {
    conversation_id: null,
    execution_id: null,
    prior_status: null,
    same_conversation: null,
    opportunity_id: null,
  };

  if (hydrated?.quote) {
    resumedQuote = normalizeQuote(hydrated.quote);
    continuitySource = "kapso_prior_execution";
    continuityMeta = {
      conversation_id: hydrated.source?.conversation_id || null,
      execution_id: hydrated.source?.execution_id || null,
      prior_status: hydrated.source?.status || null,
      same_conversation: hydrated.source?.same_conversation ?? null,
      opportunity_id: null,
    };
  }
  if (opportunityDossier?.quote) {
    const crmQuote = normalizeQuote(opportunityDossier.quote);
    if (!resumedQuote) {
      resumedQuote = crmQuote;
      continuitySource = "odoo_crm_dossier";
      continuityMeta.opportunity_id = opportunityDossier.lead_id || null;
    } else {
      const merged = mergeQuotes(resumedQuote, crmQuote, { bumpRevision: false });
      // Preferir CRM si es más rico (sobrevive semanas)
      resumedQuote =
        quoteRichnessScore(crmQuote) >= quoteRichnessScore(resumedQuote)
          ? mergeQuotes(resumedQuote, crmQuote, { bumpRevision: false })
          : merged;
      continuitySource = "kapso_and_crm_dossier";
      continuityMeta.opportunity_id = opportunityDossier.lead_id || null;
    }
  }

  if (!resumedQuote) {
    if (staffParticipated) {
      continuitySource = "kapso_staff_interaction";
    } else if (hasPriorThread) {
      continuitySource = "kapso_thread_history";
    } else if (known) {
      continuitySource = "odoo_only";
    }
  }

  const isReturning = Boolean(
    resumedQuote ||
    hasPriorThread ||
    known ||
    activeMapped.length > 0 ||
    projectCardCount > 0 ||
    historyCount > 0
  );

  let resumeHint = null;
  if (resumedQuote) {
    resumeHint = continuityResumeHint(resumedQuote);
  } else if (lastStaffMsg) {
    resumeHint = `Staff dijo: "${lastStaffMsg.slice(0, 100).replace(/\s+/g, ' ')}"`;
  } else if (hasPriorThread) {
    resumeHint = "Hilo previo activo; retomar respondiendo a su mensaje sin saludo frío.";
  }

  const outVars = {
    user: {
      ...baseUser,
      contact_segment: segment,
      is_known_in_odoo: known,
      history_count: historyCount,
    },
    orders: {
      active: activeMapped,
      active_count: activeMapped.length,
      focus_order_id:
        activeMapped.length === 1
          ? activeMapped[0].id
          : hydrated?.order_focus?.id || null,
      focus_order_name:
        activeMapped.length === 1
          ? activeMapped[0].name
          : hydrated?.order_focus?.name || null,
    },
    session: {
      continuity: isReturning
        ? {
            resumed: true,
            has_prior_conversation: hasPriorThread,
            staff_participated: staffParticipated,
            last_staff_message: lastStaffMsg,
            recent_thread_summary: threadSummary,
            source: continuitySource,
            conversation_id: continuityMeta.conversation_id || threadContext?.conversation_id || null,
            execution_id: continuityMeta.execution_id,
            prior_status: continuityMeta.prior_status,
            same_conversation: continuityMeta.same_conversation,
            opportunity_id: continuityMeta.opportunity_id,
            resume_hint: resumeHint,
            resumed_at: now,
          }
        : {
            resumed: false,
            has_prior_conversation: false,
            staff_participated: false,
            last_staff_message: null,
            recent_thread_summary: null,
            source: "none",
            hydrate_error: extras.hydrateError || null,
            resumed_at: now,
          },
    },
    service: {
      last_call_name: "classify_contact_odoo",
      last_call_status: errorCode ? "fallback" : "ready",
      last_call_at: now,
      fallback_message: errorCode,
      ...(isReturning ? { greeting_sent: true } : {}),
    },
  };

  if (lastOrder || hydrated?.order_focus?.id) {
    outVars.order = {
      last_order_id: lastOrder?.id || null,
      last_order_name: lastOrder?.name || null,
      last_order_state: lastOrder?.state || null,
      id: hydrated?.order_focus?.id || null,
      name: hydrated?.order_focus?.name || null,
    };
  }

  if (projectCardCount || latestTask) {
    outVars.project = {
      active_card_count: projectCardCount,
      latest_card_name: latestTask?.name || null,
      latest_stage: Array.isArray(latestTask?.stage_id)
        ? latestTask.stage_id[1]
        : null,
      latest_project_name: Array.isArray(latestTask?.project_id)
        ? latestTask.project_id[1]
        : null,
    };
  }

  if (opportunityDossier?.lead_id) {
    outVars.crm = {
      opportunity_id: opportunityDossier.lead_id,
      opportunity_name: opportunityDossier.lead_name || null,
      opportunity_stage: opportunityDossier.stage || null,
    };
  }

  // Solo rehidratar quote si la ejecución actual aún no tiene uno útil.
  const currentQuote = extras.existingQuote || null;
  const hasCurrentQuote = quoteLooksUseful(currentQuote);
  if (resumedQuote && !hasCurrentQuote) {
    outVars.quote = resumedQuote;
  } else if (resumedQuote && hasCurrentQuote) {
    outVars.quote = mergeQuotes(resumedQuote, currentQuote, { bumpRevision: false });
  }
  if (hydrated?.funnel) {
    outVars.funnel = hydrated.funnel;
  }

  return new Response(
    JSON.stringify({
      vars: outVars,
      status: "ready",
      message: isReturning
        ? "Contacto clasificado; sesión/continuidad comercial retomada."
        : "Contacto clasificado por telefono contra Odoo.",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

{ handler };
