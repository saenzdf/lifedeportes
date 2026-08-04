/**
 * Contrato quote rico + plantilla LIFE_DOSSIER_v1 (pedido vivo multi-semana).
 * Fuente de verdad corta: vars.quote (Kapso).
 * Fuente de verdad larga: descripción oportunidad CRM con bloque LIFE_DOSSIER_v1.
 */

export const DOSSIER_MARKER = "LIFE_DOSSIER_v1";

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
export function quoteLooksUseful(quote = {}) {
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
export function quoteRichnessScore(quote = {}) {
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
export function normalizeQuote(quote = {}, options = {}) {
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
export function mergeQuotes(prior, next, options = {}) {
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
export function buildDossierText(quoteInput = {}, meta = {}) {
  const q = normalizeQuote(quoteInput);
  // Teléfono NUNCA en description/dossier — solo campo phone / partner.
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
export function parseDossierFromDescription(description) {
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
export function mergeDescriptionWithDossier(existingDescription, quote, meta = {}) {
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
export function continuityResumeHint(quoteInput = {}) {
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
