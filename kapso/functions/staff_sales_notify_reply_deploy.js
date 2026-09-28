/**
 * staff-sales-notify-reply — arma el mensaje que el carril staff devuelve a
 * Paola/Javier cuando piden el detalle/contacto de una oportunidad de ventas.
 *
 * El agente staff ya localizó la oportunidad/pedido (buscar_oportunidad_odoo /
 * buscar_pedido_odoo). Esta function recibe ese contexto por `input` y genera
 * un texto limpio con:
 *   - enlace wa.me al cliente (si hay teléfono real)
 *   - enlace de la conversación en Kapso (fotos + historial) — SIEMPRE si existe
 *
 * Resolución de contacto (en orden):
 *   1. input.customer_phone / conversation_id / business_scoped_user_id
 *   2. Kapso API: conversación por id, teléfono o nombre
 *   3. Odoo CRM: teléfono en oportunidad/partner (lead_id o nombre)
 *
 * Entrada (input):
 *   - customer_name, customer_phone, order_summary, value, conversation_id
 *   - lead_id / opportunity_id — opcional, para teléfono Odoo
 *   - contact_only — true → solo enlaces de contacto (wa.me + Kapso)
 *
 * Secrets: KAPSO_API_KEY, KAPSO_API_BASE_URL, ODOO_* (opt, fallback teléfono)
 */

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function local10(value) {
  const d = digits(value);
  return d.length >= 10 ? d.slice(-10) : d;
}

/**
 * Normaliza teléfono staff/cliente → E.164 digits para wa.me y lookup Kapso.
 * - 10 dígitos CO (3xx…) → 57 + 10
 * - 12 dígitos (573…) → se conserva
 * - US/PR (1 + 10) → se conserva (ej. Botafogo 19313394704)
 * - Display notify "310 854 8680" → 573108548680
 */
function normalizeWaPhone(raw) {
  const d = digits(raw);
  if (!d) return { e164Digits: "", local10: "" };
  if (/^(CO|US)\./i.test(String(raw || "").trim())) {
    return { e164Digits: "", local10: "" };
  }
  if (d.startsWith("57") && d.length >= 12) {
    return { e164Digits: d.slice(0, 12), local10: d.slice(-10) };
  }
  if (d.length === 10 && d.startsWith("3")) {
    return { e164Digits: `57${d}`, local10: d };
  }
  if (d.length === 11 && d.startsWith("1")) {
    return { e164Digits: d, local10: d.slice(-10) };
  }
  if (d.length >= 10) {
    const local = d.slice(-10);
    if (local.startsWith("3") && d.length === 10) {
      return { e164Digits: `57${local}`, local10: local };
    }
    return { e164Digits: d, local10: local };
  }
  return { e164Digits: "", local10: "" };
}

/** Extrae teléfono de texto staff: 573…, 3xx xxx xxxx, Tel 310 … */
function extractPhoneFromText(text) {
  const blob = String(text || "");
  const patterns = [
    /\b57[\s-]?3\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/,
    /\b573\d{10}\b/,
    /\bTel\.?\s*(\d{3}[\s-]?\d{3}[\s-]?\d{4})\b/i,
    /\b3\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/,
    /\b1[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/,
  ];
  for (const re of patterns) {
    const m = blob.match(re);
    if (m) {
      const { e164Digits } = normalizeWaPhone(m[1] || m[0]);
      if (e164Digits) return e164Digits;
    }
  }
  return "";
}

function buildWaMeLink(customerPhone) {
  const { e164Digits } = normalizeWaPhone(customerPhone);
  if (!e164Digits || e164Digits.length < 10) return null;
  const greeting = "Hola, le escribo de Life Deportes para confirmar su pedido.";
  return `https://wa.me/${e164Digits}?text=${encodeURIComponent(greeting)}`;
}

function kapsoInboxUrl(env, conversationId) {
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

function kapsoGet(env, apiPath, params = {}) {
  const base = String(env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const apiKey = compact(env.KAPSO_API_KEY);
  if (!apiKey) return Promise.resolve(null);
  const url = new URL(`${base}${apiPath}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  return fetch(url.toString(), {
    headers: { Accept: "application/json", "X-API-Key": apiKey },
  })
    .then((r) => r.json().catch(() => ({})))
    .catch(() => null);
}

function unwrapConversations(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.whatsapp_conversations)) return payload.whatsapp_conversations;
  return [];
}

function convMatchesPhone(conversation, phoneDigits) {
  const want = local10(phoneDigits);
  if (!want) return false;
  const got = local10(conversation?.phone_number || conversation?.phone || conversation?.wa_id || "");
  return Boolean(got && got === want);
}

function extractPhoneFromConversation(conversation) {
  const raw = compact(conversation?.phone_number || conversation?.phone || "");
  const wa = compact(conversation?.wa_id || "");
  const candidate = raw || (/^(CO|US)\./i.test(wa) ? "" : wa);
  return normalizeWaPhone(candidate).e164Digits;
}

function pickBestConversation(conversations, hintId) {
  if (!conversations.length) return null;
  const hint = compact(hintId);
  if (hint) {
    const exact = conversations.find((c) => compact(c.id) === hint);
    if (exact) return exact;
  }
  return [...conversations].sort((a, b) => {
    const ta = Date.parse(a.last_active_at || a.updated_at || a.created_at || 0);
    const tb = Date.parse(b.last_active_at || b.updated_at || b.created_at || 0);
    return tb - ta;
  })[0];
}

/** Busca conversación Kapso por id, teléfono o nombre. */
async function lookupConversationContact(env, { conversationId, customerName, customerPhone, bsuid }) {
  const phoneDigits = digits(customerPhone);
  const bsuidWant = compact(bsuid);

  if (conversationId) {
    const byId = await kapsoGet(env, `/platform/v1/whatsapp/conversations/${conversationId}`);
    const c = byId?.data || byId;
    if (c?.id || c?.business_scoped_user_id) {
      return {
        conversation_id: c.id || conversationId,
        phone: extractPhoneFromConversation(c),
        bsuid: compact(c.business_scoped_user_id || ""),
        name: compact(c.contact_name || c.username || customerName || ""),
      };
    }
  }

  if (phoneDigits.length >= 10) {
    const list = await kapsoGet(env, "/platform/v1/whatsapp/conversations", {
      phone_number: phoneDigits,
      per_page: 30,
    });
    const matches = unwrapConversations(list).filter((c) => convMatchesPhone(c, phoneDigits));
    const hit = pickBestConversation(matches, conversationId);
    if (hit) {
      return {
        conversation_id: compact(hit.id),
        phone: extractPhoneFromConversation(hit),
        bsuid: compact(hit.business_scoped_user_id || ""),
        name: compact(hit.contact_name || hit.username || customerName || ""),
      };
    }
  }

  if (bsuidWant) {
    const list = await kapsoGet(env, "/platform/v1/whatsapp/conversations", {
      q: bsuidWant,
      per_page: 30,
    });
    const hit = unwrapConversations(list).find(
      (c) => compact(c.business_scoped_user_id || "") === bsuidWant
    );
    if (hit) {
      return {
        conversation_id: compact(hit.id),
        phone: extractPhoneFromConversation(hit),
        bsuid: bsuidWant,
        name: compact(hit.contact_name || hit.username || customerName || ""),
      };
    }
  }

  if (customerName) {
    const norm = (s) =>
      String(s || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
    const target = norm(customerName);
    const list = await kapsoGet(env, "/platform/v1/whatsapp/conversations", { per_page: 200 });
    const convs = unwrapConversations(list);
    const hit =
      convs.find((c) => norm(c.contact_name || c.username) === target) ||
      convs.find((c) => norm(c.contact_name || c.username).includes(target));
    if (hit) {
      return {
        conversation_id: compact(hit.id),
        phone: extractPhoneFromConversation(hit),
        bsuid: compact(hit.business_scoped_user_id || ""),
        name: compact(hit.contact_name || hit.username || customerName || ""),
      };
    }
  }

  return null;
}

async function lookupOdooPhone(env, { leadId, customerName }) {
  const url = String(env.ODOO_URL || "").replace(/\/$/, "");
  if (!url || !env.ODOO_DB || !env.ODOO_USERNAME || !env.ODOO_PASSWORD) return "";
  const rpc = (service, method, args) =>
    fetch(`${url}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args } }),
    })
      .then((r) => r.json())
      .then((j) => j.result)
      .catch(() => null);

  try {
    const uid = await rpc("common", "authenticate", [
      env.ODOO_DB,
      env.ODOO_USERNAME,
      env.ODOO_PASSWORD,
      {},
    ]);
    if (!uid) return "";
    const executeKw = (model, method, positionalArgs = [], kw = {}) =>
      rpc("object", "execute_kw", [
        env.ODOO_DB,
        uid,
        env.ODOO_PASSWORD,
        model,
        method,
        positionalArgs,
        kw,
      ]);

    const id = Number(leadId) || 0;
    if (id) {
      const rows = await executeKw(
        "crm.lead",
        "read",
        [[id]],
        { fields: ["phone", "partner_id"], context: { active_test: false } }
      );
      const row = rows?.[0];
      const phone = digits(row?.phone || "");
      if (phone.length >= 10) return normalizeWaPhone(phone).e164Digits;
      const partnerId = Array.isArray(row?.partner_id) ? row.partner_id[0] : null;
      if (partnerId) {
        const partners = await executeKw("res.partner", "read", [[partnerId]], {
          fields: ["phone", "mobile"],
        });
        const p = partners?.[0];
        const pp = digits(p?.phone || p?.mobile || "");
        if (pp.length >= 10) return normalizeWaPhone(pp).e164Digits;
      }
    }

    const name = compact(customerName);
    if (name) {
      const rows = await executeKw(
        "crm.lead",
        "search_read",
        [[["type", "=", "opportunity"], ["name", "ilike", name]]],
        {
          fields: ["phone", "partner_id"],
          limit: 3,
          order: "write_date desc",
          context: { active_test: false },
        }
      );
      for (const row of rows || []) {
        const phone = digits(row?.phone || "");
        if (phone.length >= 10) return phone.length === 10 && phone.startsWith("3") ? `57${phone}` : phone;
      }
    }
  } catch {
    /* odoo optional */
  }
  return "";
}

function buildContactLines({ convName, resumen, waLink, kapsoUrl, hasPhone }) {
  const lines = [];
  if (hasPhone && waLink) {
    lines.push(`Nueva oportunidad · ${convName} · ${resumen}`, waLink);
    if (kapsoUrl) lines.push(kapsoUrl);
  } else if (kapsoUrl) {
    lines.push(
      `Nueva oportunidad · ${convName} · ${resumen} — teléfono no público (WhatsApp privado)`,
      `Atienda desde Kapso:`,
      kapsoUrl
    );
  } else {
    lines.push(
      `Nueva oportunidad · ${convName} · ${resumen} — teléfono no público`,
      `Sin conversación Kapso verificada para ${convName}.`
    );
  }
  return lines.join("\n");
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const customerName = compact(input.customer_name) || "cliente";
  let customerPhone = compact(input.customer_phone);
  const orderSummary = compact(input.order_summary);
  const value = compact(input.value);
  let conversationId = compact(input.conversation_id || vars.kapso?.conversation_id || "");
  const note = compact(input.note);
  const contactOnly = [true, "true", "1", "yes", "on"].includes(input.contact_only);
  let bsuid = compact(input.business_scoped_user_id || vars.user?.business_scoped_user_id || "");

  // Staff puede pegar teléfono en query/note o texto libre (573… o 310 854 8680)
  if (!customerPhone) {
    const blob = [input.query, input.text, note, vars.staff?.last_inbound_text].filter(Boolean).join("\n");
    customerPhone = extractPhoneFromText(blob);
  }
  if (customerPhone) {
    customerPhone = normalizeWaPhone(customerPhone).e164Digits || customerPhone;
  }

  const leadId =
    Number(input.lead_id || input.opportunity_id || vars.lead?.id || vars.crm?.opportunity_id || 0) ||
    null;

  if (env?.KAPSO_API_KEY) {
    const found = await lookupConversationContact(env, {
      conversationId,
      customerName,
      customerPhone,
      bsuid,
    });
    if (found) {
      customerPhone = found.phone || customerPhone;
      conversationId = found.conversation_id || conversationId;
      bsuid = found.bsuid || bsuid;
    }
  }

  if (!customerPhone) {
    customerPhone = await lookupOdooPhone(env, { leadId, customerName });
  }

  const waLink = buildWaMeLink(customerPhone);
  const hasPhone = Boolean(waLink);
  const kapsoUrl = kapsoInboxUrl(env, conversationId);
  const convName = customerName;

  if (contactOnly) {
    const msg = hasPhone
      ? [waLink, kapsoUrl].filter(Boolean).join("\n")
      : kapsoUrl
        ? `Teléfono no público — atienda desde Kapso:\n${kapsoUrl}`
        : `No tengo teléfono de ${convName} ni conversación en Kapso.`;
    return new Response(
      JSON.stringify({
        vars: {
          staff_notify_reply: {
            status: hasPhone || kapsoUrl ? "ready" : "missing_contact",
            at: now,
            message: msg,
            customer_phone: customerPhone || null,
            business_scoped_user_id: bsuid || null,
            conversation_id: conversationId || null,
          },
        },
        status: "ready",
        message: msg,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  if (!orderSummary && !customerPhone && !kapsoUrl) {
    return new Response(
      JSON.stringify({
        vars: { staff_notify_reply: { status: "missing_summary_and_phone", at: now } },
        status: "ready",
        message: "Falta información para armar el aviso.",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const resumenParts = [orderSummary, value, note].filter(Boolean).join(" · ");
  const message = buildContactLines({
    convName,
    resumen: resumenParts || "pedido",
    waLink,
    kapsoUrl,
    hasPhone,
  }).slice(0, 4000);

  return new Response(
    JSON.stringify({
      vars: {
        staff_notify_reply: {
          status: "ready",
          at: now,
          message,
          customer_phone: customerPhone || null,
          business_scoped_user_id: bsuid || null,
          conversation_id: conversationId || null,
        },
      },
      status: "ready",
      message,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

{ handler };
