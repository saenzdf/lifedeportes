/**
 * seed-crm-awaiting — prueba / barrido: crea crm.lead desde payload de conversación en espera.
 *
 * Invoke (API key Kapso):
 * POST /platform/v1/functions/<id>/invoke
 * {
 *   "phone": "3000000016",
 *   "conversation_id": "uuid",
 *   "customer_name": "Emily Zuluaga",
 *   "team_name": "Emily Zuluaga",
 *   "quote": {
 *     "product_text": "camiseta dry-fit",
 *     "quantity": 23,
 *     "unit_cop": 30000,
 *     "total_cop": 690000,
 *     "notes": "...",
 *     "media_refs": [{ "url": "https://...", "filename": "diseño_1.jpeg" }],
 *     "date_deadline": "2026-07-31",
 *     "status": "esperando_lista_abono"
 *   },
 *   "fingerprint": "awaiting:3000000016:2026-07-27"
 * }
 *
 * Secrets: ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, LIFE_CRM_SEED_ENABLED
 */

// --- LIFE_CRM_SEED_INLINE_START ---


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
    const teamName =
      cleanTeamName(q.team_name) ||
      cleanTeamName(customerName) ||
      cleanTeamName(q.product_text) ||
      "Pedido WhatsApp";

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
      const soft = existing.find(
        (r) => cleanTeamName(r.name) === teamName || String(r.name || "") === teamName
      );
      if (soft) leadId = soft.id;
    }

    const stageId = resolveCrmStageId(env, q, status);
    const vals = {
      name: teamName,
      partner_id: partnerId,
      contact_name: teamName,
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


// --- LIFE_CRM_SEED_INLINE_END ---

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || body || {};

  if (input.dry_run === true || body.dry_run === true) {
    return new Response(
      JSON.stringify({
        ok: true,
        dry_run: true,
        would_seed: {
          phone: input.phone || null,
          team_name: input.team_name || input.customer_name || null,
          quote: input.quote || null,
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const quote = input.quote && typeof input.quote === "object" ? { ...input.quote } : {};
  if (input.team_name) quote.team_name = input.team_name;
  if (input.description_html) quote.description_html = input.description_html;
  if (Array.isArray(input.media_refs)) quote.media_refs = input.media_refs;

  const result = await seedCrmOpportunityFromQuote(env, {
    quote,
    customerPhone: input.phone || input.customer_phone || quote.phone || "",
    customerName: input.customer_name || input.team_name || quote.team_name || "",
    conversationId: input.conversation_id || input.conversationId || "",
    statusOverride: quote.status || input.status || "esperando_respuesta",
    fingerprint:
      input.fingerprint ||
      `awaiting:${String(input.phone || "").replace(/\D/g, "")}:${(input.conversation_id || "").slice(0, 8)}`,
    source: input.source || "seed_crm_awaiting",
  });

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}
