/**
 * ensure-crm-from-quote — seed determinista de oportunidad CRM (Asistente Kapso).
 *
 * Corre en el grafo ANTES del Agent Vendedor (tras debounce cliente).
 * Si vars.quote ya tiene interés/payload y no hay lead, siembra crm.lead.
 * No envía WhatsApp. No bloquea el turno: siempre deja pasar al agente.
 *
 * Secrets: ODOO_*, LIFE_CRM_SEED_ENABLED
 */

// --- LIFE_CRM_GATE_INLINE_START ---
const { shouldSeedCrmOpportunity, buildOrderSummaryFromQuote, seedCrmOpportunityFromQuote } = (() => {


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

{ compact, digits, THINKING_RE, SOFT_CLOSE_RE, ACCEPTANCE_RE };



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
    const vals = {
      name: oppName,
      partner_id: partnerId,
      contact_name: oppName,
      phone: norm.e164Plus || customerPhone || false,
      description,
      type: "opportunity",
      date_deadline: deadline,
    };
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


return { shouldSeedCrmOpportunity, buildOrderSummaryFromQuote, seedCrmOpportunityFromQuote };
})();
// --- LIFE_CRM_GATE_INLINE_END ---

// --- LIFE_CRM_SEED_INLINE_START ---
/* seed+gate bundled in gate IIFE above */
// --- LIFE_CRM_SEED_INLINE_END ---

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function lastInboundText(body, vars) {
  const msgs = body?.whatsapp_context?.messages || vars?.context?.recent_inbound || [];
  if (Array.isArray(msgs) && msgs.length) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      const dir = m?.kapso?.direction || m?.direction || "";
      if (dir && dir !== "inbound") continue;
      const t =
        m?.kapso?.content ||
        m?.text?.body ||
        m?.text ||
        m?.body ||
        "";
      if (compact(t)) return compact(t);
    }
  }
  return compact(
    vars?.context?.last_inbound_text ||
      body?.whatsapp_context?.conversation?.kapso?.last_message_text ||
      ""
  );
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || body?.vars || {};
  const whatsapp = body?.whatsapp_context || {};
  const now = new Date().toISOString();
  const quote = vars.quote && typeof vars.quote === "object" ? { ...vars.quote } : {};

  const alreadyId =
    Number(vars.crm?.opportunity_id || vars.lead?.id || quote.crm_opportunity_id || 0) || 0;
  if (alreadyId > 0) {
    return new Response(
      JSON.stringify({
        vars: {
          crm_seed_ensure: {
            at: now,
            skipped: true,
            reason: "already_has_lead",
            opportunity_id: alreadyId,
          },
        },
        status: "ready",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const customerPhone = digits(
    vars.user?.wa_id ||
      vars.user?.phone ||
      whatsapp?.conversation?.phone_number ||
      quote.phone ||
      ""
  );
  const conversationId = compact(
    whatsapp?.conversation?.id || vars.kapso?.conversation_id || ""
  );
  const customerName = compact(
    quote.customer_display_name ||
      quote.customer_name ||
      quote.team_name ||
      vars.user?.explicit_name ||
      vars.user?.name ||
      whatsapp?.conversation?.contact_name ||
      ""
  );
  const lastText = lastInboundText(body, vars);

  const gate = shouldSeedCrmOpportunity({
    quote,
    note: quote.notes || "",
    lastCustomerText: lastText,
  });

  if (!gate.ok) {
    return new Response(
      JSON.stringify({
        vars: {
          crm_seed_ensure: {
            at: now,
            skipped: true,
            reason: gate.reason,
            message_es: gate.message_es || null,
          },
        },
        status: "ready",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  if (!customerPhone) {
    return new Response(
      JSON.stringify({
        vars: {
          crm_seed_ensure: {
            at: now,
            skipped: true,
            reason: "no_phone",
          },
        },
        status: "ready",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  quote.status =
    quote.status && !/cotizando/i.test(String(quote.status))
      ? quote.status
      : "interes_confirmado";

  let result;
  try {
    result = await seedCrmOpportunityFromQuote(env, {
      quote,
      customerPhone,
      customerName,
      whatsappName: compact(whatsapp?.conversation?.contact_name || vars.user?.name || ""),
      conversationId,
      statusOverride: quote.status,
      fingerprint:
        vars.sales_notify?.fingerprint ||
        `ensure:${customerPhone}:${conversationId.slice(0, 8) || "na"}`,
      source: "ensure_crm_from_quote",
    });
  } catch (err) {
    result = { ok: false, error: String(err?.message || err).slice(0, 300) };
  }

  const leadId = Number(result?.lead_id || result?.opportunity_id || 0) || null;

  return new Response(
    JSON.stringify({
      vars: {
        quote: {
          ...quote,
          crm_opportunity_id: leadId || quote.crm_opportunity_id || null,
          status: quote.status,
        },
        crm: {
          ...(vars.crm || {}),
          opportunity_id: leadId || vars.crm?.opportunity_id || null,
          seeded_by: "ensure_crm_from_quote",
          seeded_at: now,
          gate: gate.reason,
          result,
        },
        lead: leadId
          ? { id: leadId, ...(vars.lead || {}) }
          : vars.lead || undefined,
        crm_seed_ensure: {
          at: now,
          skipped: false,
          gate: gate.reason,
          result,
          summary: buildOrderSummaryFromQuote(quote),
        },
      },
      status: "ready",
      message: result?.ok
        ? `CRM seed #${leadId || "?"}`
        : `CRM ensure skip/fail: ${result?.error || result?.reason || "unknown"}`,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

{ handler };
