// AUTO-GENERATED notify+dossier bundle
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
 * notificar_interes_ventas — avisa a líneas comerciales cuando el cliente
 * acepta cotización / muestra interés claro. NO hace handoff.
 *
 * Secrets:
 *   KAPSO_API_KEY
 *   KAPSO_API_BASE_URL (opcional; default api.kapso.ai)
 *   KAPSO_PHONE_NUMBER_ID | LIFE_WHATSAPP_PHONE_NUMBER_ID (default Life)
 *   LIFE_SALES_NOTIFY_ENABLED (true|false; default false — no WA a ventas en pruebas)
 *   LIFE_SALES_NOTIFY_PHONES (csv E.164; vacío = no envía; prod típico 573103362484,573213988464)
 *   LIFE_SALES_NOTIFY_WEBHOOK (opcional POST JSON)
 */


function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function buildFingerprint(conversationId, quote) {
  const q = normalizeQuote(quote || {});
  const lineSig = (q.lines || [])
    .map((l) => `${l.product_text}:${l.quantity}:${l.unit_cop}`)
    .join(",");
  const parts = [
    conversationId || "no-conv",
    compact(q.product_text || ""),
    String(q.quantity || ""),
    String(q.total_cop || ""),
    lineSig,
    String(q.revision || ""),
  ];
  return parts.join("|").slice(0, 240);
}

function buildNotifyBody({ customerPhone, customerName, conversationId, quote, note }) {
  const q = normalizeQuote(quote || {});
  const product = compact(q.product_text || "producto");
  const qty = q.quantity || "?";
  const unit = money(q.unit_cop);
  const total = money(q.total_cop);
  const lines = [
    "Life · interés → semilla CRM (pedido vivo multi-semana)",
    "Siguiente paso staff: crear/actualizar OPORTUNIDAD con LIFE_DOSSIER_v1. Presupuesto SO solo después (lista+refs + HAZ PRESUPUESTO).",
    `Cliente WA: ${customerPhone || "sin teléfono"}`,
  ];
  if (customerName) lines.push(`Nombre (si lo dijo): ${customerName}`);
  lines.push(`Estimado principal: ${qty} × ${product}`);
  if (unit) lines.push(`Unitario: ${unit}`);
  if (total) lines.push(`Total cotizado: ${total}`);
  if ((q.lines || []).length > 1) {
    lines.push("Opciones:");
    for (const l of q.lines) {
      lines.push(
        `  - ${l.quantity || "?"} × ${l.product_text || "producto"}` +
          (l.unit_cop ? ` @ ${money(l.unit_cop)}` : "") +
          (l.total_cop ? ` = ${money(l.total_cop)}` : "")
      );
    }
  }
  const v = q.variants || {};
  const variantBits = [v.material, v.collar, v.sleeves, v.sport].filter(Boolean);
  if (variantBits.length) lines.push(`Variantes: ${variantBits.join(", ")}`);
  if (q.notes) lines.push(`Notas: ${compact(q.notes).slice(0, 160)}`);
  if (conversationId) lines.push(`Conv: ${conversationId}`);
  if (note) lines.push(`Nota aviso: ${compact(note).slice(0, 160)}`);
  const hint = continuityResumeHint(q);
  if (hint) lines.push(`Retomar: ${hint}`);
  lines.push("Bot sigue en waiting — pueden escribir en el hilo del cliente.");
  return lines.join("\n");
}

async function sendWhatsAppText(env, toDigits, body) {
  const apiKey = compact(env.KAPSO_API_KEY);
  const phoneNumberId = compact(
    env.KAPSO_PHONE_NUMBER_ID ||
      env.LIFE_WHATSAPP_PHONE_NUMBER_ID ||
      "1095603153637786"
  );
  if (!apiKey) return { ok: false, error: "missing_kapso_api_key" };
  if (!toDigits || toDigits.length < 10) {
    return { ok: false, error: "invalid_to" };
  }

  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toDigits,
      type: "text",
      text: { body: String(body).slice(0, 4000) },
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      error: String(json?.error?.message || resp.statusText || "wa_failed").slice(0, 160),
    };
  }
  return { ok: true, message_id: json?.messages?.[0]?.id || null };
}

async function postWebhook(env, payload) {
  const url = compact(env.LIFE_SALES_NOTIFY_WEBHOOK);
  if (!url) return { ok: false, skipped: true };
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      return { ok: false, error: `webhook_${resp.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 120) };
  }
}

// --- LIFE_CRM_SEED_INLINE_START ---
const { shouldSeedCrmOpportunity, seedCrmOpportunityFromQuote } = (() => {


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
function shouldSeedCrmOpportunity(opts = {}) {
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

function buildOrderSummaryFromQuote(quote = {}) {
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





async function odooJsonRpc(env, service, method, args) {
  const url = String(env.ODOO_URL || "").replace(/\/$/, "");
  const db = env.ODOO_DB;
  const password = env.ODOO_PASSWORD;
  if (!url || !db || !env.ODOO_USERNAME || !password) {
    throw new Error("missing_odoo_secrets");
  }
  const resp = await fetch(`${url}/jsonrpc`, {
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
      json.error?.message ||
      "odoo_rpc_error";
    throw new Error(String(detail).slice(0, 400));
  }
  return json.result;
}

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeWaPhone(raw) {
  const digits = digitsOnly(raw);
  if (!digits) return { e164Plus: null, e164Digits: null, local10: null };
  let national = digits;
  if (digits.startsWith("57") && digits.length >= 12) national = digits.slice(-10);
  else if (digits.length >= 10) national = digits.slice(-10);
  else return { e164Plus: null, e164Digits: null, local10: null };
  return {
    e164Plus: `+57${national}`,
    e164Digits: `57${national}`,
    local10: national,
  };
}

/** Quita emoji / fancy unicode de nombres WA; deja letras y espacios. */
function cleanTeamName(raw) {
  let s = compact(raw);
  if (!s) return "";
  s = s
    .normalize("NFKC")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[^\p{L}\p{N}\s.\-_/&]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.slice(0, 120);
}

/** Etiquetas de producto/pedido — NO son nombre de cliente. */
function looksLikeProductLabel(raw) {
  const s = compact(raw).toLowerCase();
  if (!s) return false;
  if (
    /\b(uniforme|uniformes|camiseta|camisetas|sudadera|buzo|pantaloneta|polo|rompevientos|peto|chaqueta|cotizaci[oó]n|pedido)\b/i.test(
      s
    )
  ) {
    return true;
  }
  // Frases largas tipo "Uniformes de fútbol … para 10 niños"
  if (s.length > 48 && /\b(para|niñ|competencia|presentaci[oó]n|dry[\s-]?fit)\b/i.test(s)) {
    return true;
  }
  return false;
}

/**
 * Nombre para partner / opp CRM.
 * Prioridad: equipo explícito → nombre dicho → perfil WhatsApp → WA+tel.
 * Nunca product_text.
 */
function resolveCrmCustomerLabel({
  teamName,
  customerName,
  whatsappName,
  phone,
} = {}) {
  const candidates = [teamName, customerName, whatsappName];
  for (const c of candidates) {
    const cleaned = cleanTeamName(c);
    if (cleaned && !looksLikeProductLabel(cleaned)) return cleaned;
  }
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits) return `WA ${digits.slice(-10)}`;
  return "Pedido WhatsApp";
}

function addCalendarDays(isoDate, days) {
  const d = isoDate ? new Date(isoDate) : new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function moneyCop(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v);
}

function formatCop(n) {
  return `${Number(n).toLocaleString("es-CO")}`;
}

/** Pipeline Life: seed=6 Asistente Kapso · won→3 Proposition · lost→5 Perdida */
function resolveCrmStageId(env, quote, statusOverride) {
  const explicit = Number(
    quote?.crm_stage_id || quote?.stage_id || env.LIFE_CRM_FORCE_STAGE_ID || 0
  );
  if (explicit > 0) return explicit;

  const label = String(
    quote?.crm_stage || statusOverride || quote?.status || ""
  )
    .toLowerCase()
    .trim();
  if (
    /^(perdid|lost|cancel|rechaz)/.test(label) ||
    label.includes("perdida") ||
    label.includes("lost")
  ) {
    return Number(env.LIFE_CRM_LOST_STAGE_ID || 5) || 5;
  }
  if (
    /^(ganad|won|propuest|proposition|aceptad|pedido_confirmado|confirmado)$/.test(
      label
    ) ||
    label.includes("propuesta") ||
    label.includes("proposition") ||
    label.includes("ganado")
  ) {
    return Number(env.LIFE_CRM_WON_STAGE_ID || 3) || 3;
  }
  return Number(env.LIFE_CRM_SEED_STAGE_ID || 6) || 6;
}

/** Deep-link Kapso inbox → conversación (templates / reply). */
function buildKapsoConversationUrl(env, conversationId) {
  const id = compact(conversationId);
  if (!id) return null;
  const projectId =
    compact(env?.LIFE_KAPSO_PROJECT_ID) ||
    compact(env?.KAPSO_PROJECT_ID) ||
    "b470d474-6a7a-4d84-a214-6cd4b198b4f3";
  const base =
    compact(env?.LIFE_KAPSO_INBOX_BASE) || "https://inbox.kapso.ai/projects";
  return `${base.replace(/\/$/, "")}/${projectId}?conversation_id=${encodeURIComponent(id)}`;
}

/**
 * Link a conversación Kapso solo si el CRM viene del carril ventas (cliente).
 * Staff upload / retoma: NO link (el hilo staff no es el chat del cliente).
 */
function shouldLinkKapsoConversation(source, quote) {
  if (quote?.skip_kapso_link === true || quote?.crm_lane === "staff") return false;
  const s = String(source || quote?.source || "")
    .toLowerCase()
    .trim();
  if (!s) return true; // seed ventas por defecto
  if (/(^|_)staff|staff_|retoma_staff|inbox_ingreso|opportunity_only/.test(s)) {
    return false;
  }
  // Ventas / barrido / notify
  return true;
}

function buildVisibleDescription(quote, status, teamName, conversationId, env, source) {
  if (compact(quote?.description_html)) return String(quote.description_html).trim();

  const product = compact(quote?.product_text) || "pedido";
  const qty = Number(quote?.quantity);
  const unit = moneyCop(quote?.unit_cop);
  const total = moneyCop(quote?.total_cop) || (unit && Number.isFinite(qty) ? unit * qty : null);
  const notes = compact(quote?.notes);
  const convDate = compact(quote?.conversation_date || quote?.last_active_at || quote?.updated_at);
  const includeLink = shouldLinkKapsoConversation(source, quote);
  const kapsoUrl = includeLink
    ? buildKapsoConversationUrl(env || {}, conversationId)
    : null;
  const parts = [];

  if (convDate) {
    // Solo fecha (Bogotá-friendly): YYYY-MM-DD o ISO → mostrar fecha legible
    const day = convDate.slice(0, 10);
    parts.push(`<p><b>Conversación:</b> ${escapeHtml(day)}</p>`);
  }
  if (kapsoUrl) {
    parts.push(
      `<p><a href="${escapeHtml(kapsoUrl)}" target="_blank" rel="noopener noreferrer"><b>Abrir chat en Kapso</b></a> (enviar template / responder)</p>`
    );
  }
  if (Number.isFinite(qty) && qty > 0) {
    parts.push(`<p><b>Pedido:</b> ${qty} × ${escapeHtml(product)}.</p>`);
  } else {
    parts.push(`<p><b>Pedido:</b> ${escapeHtml(product)}.</p>`);
  }
  if (notes) {
    parts.push(`<p>${escapeHtml(notes).replace(/\n/g, "<br/>")}</p>`);
  }
  if (Array.isArray(quote?.lines) && quote.lines.length) {
    parts.push("<ul>");
    for (const line of quote.lines.slice(0, 40)) {
      const lp = compact(line?.product_text) || product;
      const lq = Number(line?.quantity);
      const label = Number.isFinite(lq) ? `${lq} × ${lp}` : lp;
      parts.push(`<li>${escapeHtml(label)}</li>`);
    }
    parts.push("</ul>");
  }
  if (unit || total) {
    const bits = [];
    if (unit) bits.push(`${formatCop(unit)} / u`);
    if (total) bits.push(`total <b>${formatCop(total)}</b>`);
    parts.push(`<p><b>Cotización ofrecida:</b> ${bits.join(" → ")}.</p>`);
  }
  if (status) {
    parts.push(`<p><b>Estado:</b> ${escapeHtml(String(status))}.</p>`);
  }
  if (teamName) {
    parts.push(`<!-- team:${teamName.replace(/</g, "")} -->`);
  }
  return parts.join("\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Quita teléfono visible o en meta de description CRM (va solo en campo phone). */
function stripPhoneFromCrmDescription(html) {
  return String(html || "")
    .replace(/^\s*telefono\s*:\s*.*$/gim, "")
    .replace(/<p[^>]*>\s*<b>\s*Tel[eé]fono\s*:?\s*<\/b>\s*[^<]*<\/p>/gi, "")
    .replace(/\sphone=\d+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function metaComment({ conversationId, fingerprint, source }) {
  // Teléfono solo en campo phone/partner — no en description (ni en comentario HTML).
  const bits = [];
  if (conversationId) bits.push(`conv=${conversationId}`);
  if (fingerprint) bits.push(`fp=${String(fingerprint).slice(0, 80)}`);
  if (source) bits.push(`source=${source}`);
  return bits.length ? `<!-- kapso:${bits.join(" ")} -->` : "";
}

async function findOrCreatePartner(env, uid, phone, displayName) {
  const password = env.ODOO_PASSWORD;
  const db = env.ODOO_DB;
  const executeKw = (model, method, positionalArgs = [], kw = {}) =>
    odooJsonRpc(env, "object", "execute_kw", [
      db,
      uid,
      password,
      model,
      method,
      positionalArgs,
      kw,
    ]);

  const norm = normalizeWaPhone(phone);
  let partnerId = null;
  if (norm.e164Plus) {
    const domains = [
      [["active", "=", true], ["phone_sanitized", "=", norm.e164Plus]],
      [["active", "=", true], ["phone", "ilike", norm.local10]],
    ];
    for (const domain of domains) {
      const rows = await executeKw("res.partner", "search_read", [domain], {
        fields: ["id", "name"],
        limit: 1,
      });
      if (rows?.[0]?.id) {
        partnerId = rows[0].id;
        const wanted =
          cleanTeamName(displayName) || `WA ${norm.e164Digits || phone || "cliente"}`;
        const current = compact(rows[0].name);
        // Si el partner quedó con nombre = producto, corregir con WA/equipo.
        if (
          wanted &&
          wanted !== current &&
          (looksLikeProductLabel(current) || !current)
        ) {
          try {
            await executeKw("res.partner", "write", [[partnerId], { name: wanted }]);
          } catch {
            /* ignore rename race */
          }
        }
        break;
      }
    }
  }
  if (!partnerId) {
    const name =
      cleanTeamName(displayName) || `WA ${norm.e164Digits || phone || "cliente"}`;
    partnerId = await executeKw("res.partner", "create", [
      {
        name,
        phone: norm.e164Plus || phone || false,
        type: "contact",
      },
    ]);
  }
  return partnerId;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function attachMediaToLead(executeKw, leadId, mediaRefs) {
  const list = Array.isArray(mediaRefs) ? mediaRefs : [];
  const uploaded = [];
  const errors = [];
  let i = 0;
  for (const ref of list) {
    i += 1;
    const url = compact(typeof ref === "string" ? ref : ref?.url || ref?.link);
    if (!url.startsWith("http")) continue;
    const name =
      compact(ref?.filename) ||
      `diseño_referencia_${i}.jpeg`;
    try {
      const existing = await executeKw(
        "ir.attachment",
        "search",
        [
          [
            ["res_model", "=", "crm.lead"],
            ["res_id", "=", leadId],
            ["name", "=", name],
          ],
        ],
        { limit: 1 }
      );
      if (Array.isArray(existing) && existing.length) {
        uploaded.push({ name, skipped: true, id: existing[0] });
        continue;
      }
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`download_failed:${resp.status}`);
      const bytes = new Uint8Array(await resp.arrayBuffer());
      const attId = await executeKw("ir.attachment", "create", [
        {
          name,
          res_model: "crm.lead",
          res_id: leadId,
          type: "binary",
          mimetype: compact(ref?.mime_type) || "image/jpeg",
          datas: bytesToBase64(bytes),
        },
      ]);
      uploaded.push({ name, id: attId });
    } catch (err) {
      errors.push({ name, error: String(err?.message || err).slice(0, 160) });
    }
  }
  return { uploaded, errors };
}

/**
 * @returns {{ ok: boolean, skipped?: boolean, reason?: string, lead_id?: number, lead_url?: string, created?: boolean, attachments?: object, error?: string }}
 */
async function seedCrmOpportunityFromQuote(env, {
  quote,
  customerPhone,
  customerName,
  whatsappName,
  conversationId,
  dossierText,
  statusOverride,
  fingerprint,
  source,
}) {
  const enabledRaw = String(env.LIFE_CRM_SEED_ENABLED ?? "true").toLowerCase().trim();
  if (["0", "false", "no", "off"].includes(enabledRaw)) {
    return { ok: false, skipped: true, reason: "crm_seed_disabled" };
  }

  try {
    const uid = await odooJsonRpc(env, "common", "authenticate", [
      env.ODOO_DB,
      env.ODOO_USERNAME,
      env.ODOO_PASSWORD,
      {},
    ]);
    if (!uid) throw new Error("odoo_auth_failed");

    const password = env.ODOO_PASSWORD;
    const db = env.ODOO_DB;
    const executeKw = (model, method, positionalArgs = [], kw = {}) =>
      odooJsonRpc(env, "object", "execute_kw", [
        db,
        uid,
        password,
        model,
        method,
        positionalArgs,
        kw,
      ]);

    const q = quote && typeof quote === "object" ? quote : {};
    const teamName = resolveCrmCustomerLabel({
      teamName: q.team_name || q.customer_team || q.equipo,
      customerName:
        customerName ||
        q.customer_display_name ||
        q.customer_name ||
        q.explicit_name,
      whatsappName:
        whatsappName ||
        q.whatsapp_profile_name ||
        q.wa_profile_name ||
        q.profile_name,
      phone: customerPhone,
    });

    const partnerId = await findOrCreatePartner(
      env,
      uid,
      customerPhone,
      teamName
    );

    const norm = normalizeWaPhone(customerPhone);
    const status = statusOverride || q.status || "interes_confirmado";
    const visible = buildVisibleDescription(
      q,
      status,
      teamName,
      conversationId,
      env,
      source || "kapso_seed"
    );
    // dossierText legacy ignored for visible body; keep only as HTML comment meta
    const meta = metaComment({
      conversationId,
      fingerprint,
      source: source || "kapso_seed",
    });
    const description = stripPhoneFromCrmDescription(
      meta ? `${visible}\n${meta}` : visible
    );

    const total = moneyCop(q.total_cop);
    const unit = moneyCop(q.unit_cop);
    const qty = Number(q.quantity);
    const expected =
      total ||
      (unit && Number.isFinite(qty) && qty > 0 ? unit * qty : null);
    const deadline =
      compact(q.date_deadline) ||
      addCalendarDays(null, Number(env.LIFE_CRM_DEFAULT_CLOSE_DAYS || 4));

    const fp = String(fingerprint || "").slice(0, 200);
    let leadId = null;
    let created = false;
    const existing = await executeKw(
      "crm.lead",
      "search_read",
      [
        [
          ["partner_id", "=", partnerId],
          ["type", "=", "opportunity"],
          ["active", "=", true],
        ],
      ],
      { fields: ["id", "name", "description"], limit: 8, order: "id desc" }
    );
    if (fp && Array.isArray(existing)) {
      const hit = existing.find((r) => String(r.description || "").includes(fp));
      if (hit) leadId = hit.id;
    }
    if (!leadId && conversationId && Array.isArray(existing)) {
      const hit = existing.find((r) =>
        String(r.description || "").includes(conversationId)
      );
      if (hit) leadId = hit.id;
    }
    if (!leadId && Array.isArray(existing) && existing.length) {
      const soft = existing.find((r) => {
        const rn = cleanTeamName(String(r.name || "").replace(/^oportunidad\s+de\s+/i, ""));
        return rn === teamName || cleanTeamName(r.name) === teamName || String(r.name || "") === teamName;
      });
      if (soft) leadId = soft.id;
    }

    const stageId = resolveCrmStageId(env, q, status);
    // Nombre CRM = cliente/equipo plano (sin «Oportunidad de»).
    const oppName = teamName;
    const staffUserId = vars.user?.odoo_user_id || vars.user?.user_id || (vars.user?.odoo_project_id === 8 ? 8 : vars.user?.odoo_project_id === 9 ? 9 : undefined);

    // Compute CRM probability (95-100% close/pay intent, 75-85% high intent, 50% evaluating)
    const textsForProb = [
      vars?.last_user_input,
      vars?.staff?.last_inbound_text,
      customerPhone,
      description
    ].filter(Boolean).join("\n").toLowerCase();
    let calculatedProb = 75; // Default high interest
    if (/\b(d[oó]nde\s+pago|d[aá]tos?\s+de\s+pago|n[uú]mero\s+de\s+cuenta|nequi|bancolombia|hacer\s+el\s+abono|para\s+consignar|c[oó]mo\s+cierro|pagar|cu[eé]nta\s+bancaria)\b/i.test(textsForProb)) {
      calculatedProb = 98;
    } else if (/\b(lo\b.*\bpensar|preguntar\b.*\bequipo|preguntar\b.*\bgrupo|esperando\b.*\bconfirmaci[oó]n|ma[nñ]ana\b.*\baviso|consultando)\b/i.test(textsForProb)) {
      calculatedProb = 50;
    }

    const vals = {
      name: oppName,
      partner_id: partnerId,
      contact_name: oppName,
      phone: norm.e164Plus || customerPhone || false,
      description,
      type: "opportunity",
      date_deadline: deadline,
      probability: calculatedProb,
    };
    if (staffUserId) vals.user_id = staffUserId;
    if (expected) vals.expected_revenue = expected;

    // Create always lands on resolved stage. Updates only move stage when
    // status/crm_stage pide propuesta (3) o perdida (5) — no bajar de Proposition a seed.
    // Nunca renombrar opp existente sin orden explícita (force_name / crm_rename).
    if (!leadId) {
      vals.stage_id = stageId;
      leadId = await executeKw("crm.lead", "create", [vals]);
      created = true;
    } else {
      const seedStage = Number(env.LIFE_CRM_SEED_STAGE_ID || 6) || 6;
      if (stageId !== seedStage) {
        vals.stage_id = stageId;
      }
      const forceName = ["1", "true", "yes", "on"].includes(
        String(q.force_name || q.crm_rename || "")
          .toLowerCase()
          .trim()
      );
      if (!forceName) {
        delete vals.name;
        delete vals.contact_name;
      }
      await executeKw("crm.lead", "write", [[leadId], vals]);
    }

    const media =
      q.media_refs ||
      q.media_urls ||
      (Array.isArray(q.attachments) ? q.attachments : []);
    const attachments = await attachMediaToLead(executeKw, leadId, media);

    // dossierText unused for body; silence unused if passed
    void dossierText;

    const odooUrl = String(env.ODOO_URL || "").replace(/\/$/, "");
    return {
      ok: true,
      lead_id: leadId,
      lead_url: `${odooUrl}/odoo/crm/${leadId}`,
      created,
      partner_id: partnerId,
      name: teamName,
      expected_revenue: expected || null,
      date_deadline: deadline,
      attachments,
    };
  } catch (err) {
    return {
      ok: false,
      error: String(err?.message || err).slice(0, 240),
    };
  }
}


return { shouldSeedCrmOpportunity, seedCrmOpportunityFromQuote };
})();
// --- LIFE_CRM_SEED_INLINE_END ---

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || body?.vars || {};
  const input = body?.input || {};
  const whatsapp = body?.whatsapp_context || {};
  const now = new Date().toISOString();

  const inputPatch = {
    product_text: input.product_text || null,
    quantity: input.quantity ?? null,
    unit_cop: input.unit_cop ?? null,
    total_cop: input.total_cop ?? null,
    notes: input.notes || input.note || null,
    lines: input.lines || null,
    variants: input.variants || null,
    media_refs: input.media_refs || null,
  };
  // Quitar nulls del patch para no pisar quote con vacíos
  Object.keys(inputPatch).forEach((k) => {
    if (inputPatch[k] == null) delete inputPatch[k];
  });

  const quote = mergeQuotes(vars.quote || {}, inputPatch, {
    now,
    bumpRevision: true,
  });
  quote.dossier_text = buildDossierText(quote, {
    customer_name:
      input.customer_name ||
      vars.quote?.customer_display_name ||
      vars.user?.explicit_name ||
      "",
    customer_phone:
      input.customer_phone ||
      vars.user?.wa_id ||
      vars.user?.phone ||
      whatsapp?.conversation?.phone_number ||
      "",
  });

  const customerPhone = digits(
    input.customer_phone ||
      vars.user?.wa_id ||
      vars.user?.phone ||
      whatsapp?.conversation?.phone_number ||
      ""
  );
  const conversationId = compact(
    input.conversation_id ||
      whatsapp?.conversation?.id ||
      vars.kapso?.conversation_id ||
      ""
  );
  const note = compact(input.note || "");
  const customerNameRaw = compact(
    input.customer_name ||
      vars.quote?.customer_name ||
      vars.quote?.customer_display_name ||
      vars.user?.explicit_name ||
      vars.user?.name ||
      executionContext?.context?.contact?.profile_name ||
      executionContext?.context?.contact?.name ||
      executionContext?.context?.contact?.display_name ||
      whatsapp?.contact?.profile_name ||
      whatsapp?.contact?.name ||
      whatsapp?.conversation?.contact_name ||
      ""
  );
  // Si el “nombre” es en realidad el producto, no usarlo como cliente.
  const customerName = /\b(uniforme|uniformes|camiseta|sudadera|buzo|pantaloneta|polo|rompevientos|peto|chaqueta)\b/i.test(
    customerNameRaw
  )
    ? ""
    : customerNameRaw;
  const whatsappProfileName = compact(
    executionContext?.context?.contact?.profile_name ||
      executionContext?.context?.contact?.name ||
      executionContext?.context?.contact?.display_name ||
      vars.user?.name ||
      whatsapp?.contact?.profile_name ||
      whatsapp?.contact?.name ||
      ""
  );
  const fingerprint = buildFingerprint(conversationId, quote);
  const priorFp = compact(vars.sales_notify?.fingerprint || "");

  if (priorFp && priorFp === fingerprint && vars.sales_notify?.status === "sent") {
    return new Response(
      JSON.stringify({
        vars: {
          quote,
          sales_notify: {
            ...(vars.sales_notify || {}),
            last_call_at: now,
            duplicate: true,
          },
          service: {
            last_call_name: "notify_sales_interest",
            last_call_status: "ready",
            last_call_at: now,
            fallback_message: null,
          },
        },
        status: "ready",
        message: "Notificación ya enviada (idempotente).",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const text = buildNotifyBody({
    customerPhone,
    customerName: customerName || null,
    conversationId,
    quote,
    note,
  });

  const notifyEnabled = ["1", "true", "yes", "on"].includes(
    String(env.LIFE_SALES_NOTIFY_ENABLED || "").toLowerCase().trim()
  );
  const phonesRaw = compact(env.LIFE_SALES_NOTIFY_PHONES || "");
  const destinations = notifyEnabled
    ? phonesRaw
        .split(",")
        .map((p) => digits(p))
        .filter((p) => p.length >= 10)
    : [];

  const waResults = [];
  if (notifyEnabled && destinations.length) {
    for (const to of destinations) {
      waResults.push({ to, ...(await sendWhatsAppText(env, to, text)) });
    }
  }

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  // --- LIFE_CRM_SEED_CALL ---
  let crmSeedResult = { ok: false, skipped: true, reason: "not_attempted" };
  const crmGate = shouldSeedCrmOpportunity({
    quote,
    note,
    lastCustomerText:
      vars.context?.last_inbound_text ||
      vars.staff?.last_inbound_text ||
      whatsapp?.messages?.[0]?.text ||
      "",
  });
  if (!crmGate.ok) {
    crmSeedResult = { ok: false, skipped: true, reason: crmGate.reason, message_es: crmGate.message_es };
  } else {
    quote.status = quote.status && quote.status !== "cotizando" ? quote.status : "interes_confirmado";
    quote.dossier_text = buildDossierText(quote, {
      customer_name: customerName || whatsappProfileName || "",
      customer_phone: customerPhone || "",
    });
    crmSeedResult = await seedCrmOpportunityFromQuote(env, {
      quote,
      customerPhone,
      customerName,
      whatsappName: whatsappProfileName,
      conversationId,
      dossierText: quote.dossier_text,
      statusOverride: "interes_confirmado",
      fingerprint,
      source: "notify_sales_interest",
    });
  }

  const webhookPayload = {
    event: "life.sales.interest",
    at: now,
    fingerprint,
    next_step: "crm_opportunity",
    customer_phone: customerPhone || null,
    customer_name: customerName || null,
    conversation_id: conversationId || null,
    quote: {
      product_text: quote.product_text,
      quantity: quote.quantity,
      unit_cop: quote.unit_cop,
      total_cop: quote.total_cop,
      lines: quote.lines,
      variants: quote.variants,
      notes: quote.notes,
      media_refs: quote.media_refs,
      revision: quote.revision,
      status: quote.status,
      dossier_text: quote.dossier_text,
    },
    note: note || null,
    message_preview: text,
    notify_enabled: notifyEnabled,
  };
  const webhook = notifyEnabled
    ? await postWebhook(env, webhookPayload)
    : { ok: false, skipped: true };

  const anyWaOk = waResults.some((r) => r.ok);
  let status = "dry_run";
  if (!notifyEnabled) {
    status = "disabled";
  } else if (anyWaOk || webhook.ok) {
    status = "sent";
  } else if (destinations.length) {
    status = "failed";
  } else {
    status = "no_destinations";
  }

  return new Response(
    JSON.stringify({
      vars: {
        quote,
        sales_notify: {
          status,
          enabled: notifyEnabled,
          fingerprint,
          notified_at: now,
          destinations,
          whatsapp: waResults.map(({ to, ok, error, message_id }) => ({
            to,
            ok,
            error: error || null,
            message_id: message_id || null,
          })),
          webhook: {
            ok: Boolean(webhook.ok),
            skipped: Boolean(webhook.skipped),
            error: webhook.error || null,
          },
          message_preview: text,
          crm_seed: {
            next_step: "crm_opportunity",
            customer_phone: customerPhone || null,
            customer_name: customerName || null,
            product_text: quote.product_text,
            quantity: quote.quantity,
            unit_cop: quote.unit_cop,
            total_cop: quote.total_cop,
            lines: quote.lines,
            variants: quote.variants,
            notes: quote.notes || note || null,
            media_refs: quote.media_refs,
            revision: quote.revision,
            dossier_text: quote.dossier_text,
            gate: crmGate.ok ? "pass" : crmGate.reason,
            result: crmSeedResult,
          },
          crm_seed_result: crmSeedResult,
        },
        service: {
          last_call_name: "notify_sales_interest",
          last_call_status: status === "failed" ? "fallback" : "ready",
          last_call_at: now,
          fallback_message:
            status === "failed"
              ? "No se pudo avisar a ventas; el bot sigue en waiting."
              : null,
        },
      },
      status: "ready",
      message:
        status === "sent"
          ? "Ventas notificadas; cliente sigue en waiting."
          : status === "disabled"
            ? "Aviso a ventas desactivado (LIFE_SALES_NOTIFY_ENABLED); cliente sigue en waiting."
            : "Intento de notificación a ventas registrado.",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

{ handler };

