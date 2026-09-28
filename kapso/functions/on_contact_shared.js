/**
 * on-contact-shared — webhook de WhatsApp: cuando un cliente comparte su número
 * (tap en el botón REQUEST_CONTACT_INFO de `compartir_contacto_asesor`, comparte
 * un contacto, o pega un celular colombiano en texto), Kapso envía
 * `whatsapp.message.received`. Esta function:
 *   1) extrae el número real + BSUID + nombre + conversation_id,
 *   2) busca/crea el crm.lead por conversation_id/BSUID en Odoo y resuelve el
 *      asesor asignado ("Asignado a: Paola/Javier"). Si el lead ya tiene asesor,
 *      lo MANTIENE (nunca reasigna). Si no, asigna UNO SOLO (round-robin
 *      determinístico) y lo persiste — NUNCA envía a ambos.
 *   3) arma el enlace wa.me del cliente y lo envía SOLO a ese asesor, para que
 *      cierre la venta desde su WhatsApp personal.
 *
 * Auth: Header X-Webhook-Secret / X-Life-Webhook-Secret | Query ?secret=
 * Secrets: KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID (opt, default 1095603153637786),
 *          ODOO_URL/DB/USERNAME/PASSWORD, LIFE_WEBHOOK_SECRET (opt), STAFF_PHONES (opt)
 * public_endpoint=true
 *
 * Destinos staff: Paola 573213988464 / Javier 573103362484 (en ese orden para
 * el round-robin por conversation_id).
 */

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function customerSendOk(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(now)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const minutesOfDay = Number(map.hour) * 60 + Number(map.minute);
  return minutesOfDay >= 6 * 60 && minutesOfDay < 22 * 60;
}

function staffNotifyOk(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(now)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  if (map.weekday === "Sunday") return false;
  const minutesOfDay = Number(map.hour) * 60 + Number(map.minute);
  return minutesOfDay >= 8 * 60 && minutesOfDay < 18 * 60;
}

function phoneNumberId(env) {
  return compact(
    env.KAPSO_PHONE_NUMBER_ID ||
      env.LIFE_WHATSAPP_PHONE_NUMBER_ID ||
      "1095603153637786"
  );
}

function extractSecret(request, url) {
  return (
    compact(request.headers.get("x-webhook-secret")) ||
    compact(request.headers.get("X-Webhook-Secret")) ||
    compact(request.headers.get("x-life-webhook-secret")) ||
    compact(request.headers.get("X-Life-Webhook-Secret")) ||
    compact(url.searchParams.get("secret")) ||
    compact(url.searchParams.get("token"))
  );
}

function expectedSecret(env) {
  return compact(
    env.LIFE_WEBHOOK_SECRET ||
      env.LIFE_WA_TEMPLATE_WEBHOOK_SECRET ||
      env.LIFE_ODOO_WEBHOOK_SECRET ||
      ""
  );
}

// Orden estable para round-robin por conversation_id.
const STAFF_ORDER = [
  { phone: "573213988464", name: "Paola" },
  { phone: "573103362484", name: "Javier" },
];

function staffPhones(env) {
  return compact(env.STAFF_PHONES || "573213988464,573103362484")
    .split(",")
    .map((p) => digits(p))
    .filter((p) => p.length >= 10);
}

function parseAsesor(desc) {
  const m = /Asignado a:\s*(Paola|Javier)/i.exec(String(desc || ""));
  if (!m) return null;
  return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
}

function cleanPersonName(name) {
  return compact(name).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "").trim();
}

/** Entre leads del mismo cliente, el asesor más viejo gana; se escribe en el activo. */
function pickStickyLead(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const assigned = list
    .filter((r) => parseAsesor(r.description))
    .sort((a, b) => Number(a.id) - Number(b.id));
  const sticky = assigned[0] || null;
  const lead =
    list.find((r) => r.active === true || r.active === "true") || sticky || list[0] || null;
  return { sticky, lead, asesor: parseAsesor((sticky || lead)?.description) };
}

function rpc(env, service, method, args) {
  const url = compact(env.ODOO_URL || env.ODOO_LIFEDEPORTES_PROD_URL || "");
  if (!url) return Promise.resolve(null);
  return fetch(`${url.replace(/\/$/, "")}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
    }),
  })
    .then((r) => r.json().catch(() => ({})))
    .then((j) => j?.result)
    .catch(() => null);
}

/**
 * Busca/crea el lead por conversation_id/BSUID y devuelve el asesor asignado.
 * Si el lead ya tiene "Asignado a: X", lo devuelve (mantiene la decisión).
 * Si no existe, crea el lead con la conversación y asigna UNO SOLO (round-robin
 * determinístico por conversation_id). Devuelve { lead_id, asesor, asesor_phone, reused }.
 */
async function resolveLeadAndAsesor(env, { conversationId, bsuid, phone, customerName }) {
  const db = compact(env.ODOO_DB || env.ODOO_LIFEDEPORTES_PROD_DB || "lifedeportes");
  const user = compact(env.ODOO_USERNAME || env.ODOO_LIFEDEPORTES_PROD_USERNAME);
  const pass = compact(env.ODOO_PASSWORD || env.ODOO_LIFEDEPORTES_PROD_PASSWORD);
  if (!db || !user || !pass) return null;

  const uid = await rpc(env, "common", "authenticate", [db, user, pass, {}]);
  if (!uid) return null;

  const searchKw = { limit: 8, order: "id desc", context: { active_test: false } };
  const fields = ["id", "name", "phone", "description", "active"];
  const byId = new Map();
  const add = (found) => {
    for (const r of found || []) if (r?.id) byId.set(r.id, r);
  };
  const searchLeads = async (domain) => {
    const found = await rpc(env, "object", "execute_kw", [
      db, uid, pass, "crm.lead", "search_read",
      [domain, fields],
      searchKw,
    ]);
    add(found);
  };

  // Merge conv + BSUID (no cortar en el primer hit: la conv nueva no ve el lead archivado).
  for (const n of [conversationId, bsuid].filter(Boolean)) {
    await searchLeads([["description", "ilike", n]]);
  }
  const local10 = digits(phone).slice(-10);
  if (local10.length >= 7) {
    await searchLeads([["phone", "ilike", local10]]);
  }
  const person = cleanPersonName(customerName);
  if (person.length >= 8) {
    const named = await rpc(env, "object", "execute_kw", [
      db, uid, pass, "crm.lead", "search_read",
      [[["name", "ilike", person.slice(0, 40)], ["type", "=", "opportunity"]], fields],
      searchKw,
    ]);
    for (const r of named || []) {
      if (r?.id && parseAsesor(r.description)) byId.set(r.id, r);
    }
  }

  const rows = [...byId.values()];
  if (rows.length) {
    const { sticky, lead, asesor } = pickStickyLead(rows);
    const already = phone && String(lead.description || "").includes(`wa.me/${digits(phone)}`);
    if (!asesor) {
      const as = pickAsesor(conversationId || bsuid, env);
      await writeAsesor(env, db, uid, pass, lead.id, as.name);
      await enrichLeadDescription(env, db, uid, pass, lead.id, { conversationId, bsuid, phone });
      return { lead_id: lead.id, lead_name: compact(lead.name), asesor: as.name, asesor_phone: as.phone, reused: true, assigned_now: true, already_notified: already };
    }
    if (lead.id !== sticky?.id && sticky) {
      await writeAsesor(env, db, uid, pass, lead.id, asesor);
    }
    await enrichLeadDescription(env, db, uid, pass, lead.id, { conversationId, bsuid, phone });
    return { lead_id: lead.id, lead_name: compact(lead.name), asesor, asesor_phone: phoneOf(asesor), reused: true, assigned_now: false, already_notified: already };
  }

  // No existe: crear lead y asignar uno solo.
  const as = pickAsesor(conversationId || bsuid, env);
  const convHtml = conversationId
    ? `<!-- kapso:conv=${conversationId} source=on_contact_shared -->`
    : "";
  const bsuidHtml = bsuid ? `<!-- kapso:bsuid=${bsuid} -->` : "";
  const links = crmConversationLinksHtml(env, conversationId, phone);
  const newId = await rpc(env, "object", "execute_kw", [
    db, uid, pass, "crm.lead", "create",
    [{
      name: customerName || "Cliente (compartió contacto)",
      phone: phone || false,
      description: `${links}\n${convHtml}${bsuidHtml}<p><b>Asignado a: ${as.name}</b></p>`.trim(),
    }],
  ]);
  if (!newId) return null;
  return { lead_id: newId, lead_name: customerName, asesor: as.name, asesor_phone: as.phone, reused: false, assigned_now: true };
}

function phoneOf(name) {
  const s = STAFF_ORDER.find((x) => x.name === name);
  return s ? s.phone : null;
}

/** Round-robin determinístico por conversation_id (hash → índice estable). */
function pickAsesor(conversationId, env) {
  const phones = staffPhones(env);
  const order = STAFF_ORDER.filter((s) => phones.includes(s.phone));
  if (!order.length) return { phone: null, name: null };
  let h = 0;
  const key = String(conversationId || "");
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return order[h % order.length];
}

async function writePendingStaffNotify(env, leadId, payload) {
  if (!leadId) return { ok: false };
  const db = compact(env.ODOO_DB || env.ODOO_LIFEDEPORTES_PROD_DB);
  const user = compact(env.ODOO_USERNAME || env.ODOO_LIFEDEPORTES_PROD_USERNAME);
  const pass = compact(env.ODOO_PASSWORD || env.ODOO_LIFEDEPORTES_PROD_PASSWORD);
  const uid = await rpc(env, "common", "authenticate", [db, user, pass, {}]);
  if (!uid) return { ok: false };
  const rows = await rpc(env, "object", "execute_kw", [
    db, uid, pass, "crm.lead", "read",
    [[leadId], ["description"]],
  ]);
  const current = String(rows?.[0]?.description || "").replace(
    /<!--\s*kapso:pending_staff_notify(?:=[\s\S]*?)?\s*-->/gi,
    ""
  );
  const json = JSON.stringify(payload || {}).replace(/--/g, "\\u002d\\u002d");
  const next = `${current}\n<!-- kapso:pending_staff_notify=${json} -->`.trim();
  await rpc(env, "object", "execute_kw", [
    db, uid, pass, "crm.lead", "write",
    [[leadId], { description: next }],
  ]);
  return { ok: true };
}

async function writeAsesor(env, db, uid, pass, leadId, name) {
  const rows = await rpc(env, "object", "execute_kw", [
    db, uid, pass, "crm.lead", "read",
    [[leadId], ["description"]],
  ]);
  const current = String(rows?.[0]?.description || "");
  if (/Asignado a:\s*(Paola|Javier)/i.test(current)) return;
  const next = `${current}\n<p><b>Asignado a: ${name}</b></p>`.trim();
  await rpc(env, "object", "execute_kw", [
    db, uid, pass, "crm.lead", "write",
    [[leadId], { description: next }],
  ]);
}

/** Completa Kapso/wa.me, BSUID y el teléfono del lead sin borrar el brief comercial. */
async function enrichLeadDescription(env, db, uid, pass, leadId, { conversationId, bsuid, phone }) {
  const rows = await rpc(env, "object", "execute_kw", [
    db, uid, pass, "crm.lead", "read",
    [[leadId], ["description", "phone"]],
  ]);
  let current = String(rows?.[0]?.description || "");
  let next = injectCrmConversationLinks(current, env, conversationId, phone);
  if (bsuid && !next.includes(bsuid)) {
    next = `${next}\n<!-- kapso:bsuid=${bsuid} -->`.trim();
  }
  const vals = {};
  if (next !== current) vals.description = next;
  const havePhone = String(rows?.[0]?.phone || "").replace(/\D/g, "").length >= 11;
  if (phone && !havePhone) vals.phone = phone.startsWith("+") ? phone : `+${digits(phone)}`;
  if (!Object.keys(vals).length) return;
  await rpc(env, "object", "execute_kw", [
    db, uid, pass, "crm.lead", "write",
    [[leadId], vals],
  ]);
}


// --- STAFF_OUTBOUND_DEDUPE ---
function normalizeOutboundCompare(text) {
  return compact(text).toLowerCase();
}

function staffDedupeEnabled(env) {
  return !["0", "false", "no", "off"].includes(
    String(env?.LIFE_STAFF_OUTBOUND_DEDUPE ?? "true").toLowerCase().trim()
  );
}

function extractOutboundText(m) {
  if (!m || typeof m !== "object") return "";
  if (typeof m.content === "string" && m.content) return m.content;
  if (typeof m.text === "string" && m.text) return m.text;
  if (m.text?.body) return String(m.text.body);
  if (m.kapso?.content) return String(m.kapso.content);
  if (m.body) return String(m.body);
  return "";
}

async function fetchLastStaffOutbound(env, toDigits) {
  const base = compact(env?.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const key = compact(env?.KAPSO_API_KEY);
  if (!base || !key) return null;
  let phone = digits(toDigits);
  if (phone.length === 10) phone = `57${phone}`;
  if (phone.length < 11) return null;
  try {
    const url = `${base}/platform/v1/whatsapp/messages?phone_number=${encodeURIComponent(phone)}&per_page=25`;
    const resp = await fetch(url, {
      headers: { "X-API-Key": key, Accept: "application/json" },
    });
    if (!resp.ok) return null;
    const json = await resp.json().catch(() => ({}));
    const list = Array.isArray(json.data)
      ? json.data
      : Array.isArray(json.messages)
        ? json.messages
        : [];
    for (const m of list) {
      const dir = compact(m?.kapso?.direction || m?.direction || "").toLowerCase();
      if (dir !== "outbound") continue;
      const text = extractOutboundText(m);
      if (!text) continue;
      return {
        text,
        at: m.timestamp || m.created_at || m.kapso?.created_at || null,
        message_id: m.id || m.message_id || m.kapso?.message_id || null,
      };
    }
  } catch (_err) {
    return null;
  }
  return null;
}

async function isDuplicateStaffOutbound(env, toDigits, intendedText) {
  if (!staffDedupeEnabled(env)) return { duplicate: false, reason: "dedupe_disabled" };
  const intended = normalizeOutboundCompare(intendedText);
  if (!intended) return { duplicate: false, reason: "empty_intended" };
  const last = await fetchLastStaffOutbound(env, toDigits);
  if (!last?.text) return { duplicate: false, reason: "no_prior_outbound" };
  const same = normalizeOutboundCompare(last.text) === intended;
  return {
    duplicate: same,
    last: last.text,
    last_at: last.at,
    last_message_id: last.message_id,
    reason: same ? "same_as_last_outbound" : "different",
  };
}

function templateCompareKey({ templateName, client, orderSummary, value, conversationId }) {
  return normalizeOutboundCompare(
    `${templateName || "template"}|${client || ""}|${orderSummary || ""}|${value || ""}|${conversationId || ""}`
  );
}
// --- END STAFF_OUTBOUND_DEDUPE ---

async function sendWhatsAppText(env, toDigits, body) {
  const apiKey = compact(env.KAPSO_API_KEY);
  const pnid = phoneNumberId(env);
  if (!apiKey) return { ok: false, error: "missing_kapso_api_key" };
  if (!toDigits || toDigits.length < 10) return { ok: false, error: "invalid_to" };
  const bodyStr = String(body).slice(0, 4000);
  const dup = await isDuplicateStaffOutbound(env, toDigits, bodyStr);
  if (dup.duplicate) {
    return {
      ok: true,
      skipped: true,
      duplicate: true,
      reason: "duplicate_last_outbound",
      last_message_id: dup.last_message_id || null,
    };
  }
  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${pnid}/messages`;
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
      text: { body: bodyStr },
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      error: String(json?.error?.message || resp.statusText || "wa_failed").slice(0, 220),
    };
  }
  return { ok: true, message_id: json?.messages?.[0]?.id || null };
}

function buildWaMeLink(customerPhone) {
  const d = digits(customerPhone);
  if (!d || d.length < 11) return null;
  const national = d.startsWith("57") && d.length >= 12 ? d : d;
  if (national.length < 11) return null;
  const greeting = "Hola, le escribo de Life Deportes para confirmar su pedido.";
  return `https://wa.me/${national}?text=${encodeURIComponent(greeting)}`;
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

function crmConversationLinksHtml(env, conversationId, customerPhone) {
  const kapsoUrl = kapsoInboxUrl(env, conversationId);
  const wa = buildWaMeLink(customerPhone);
  if (!kapsoUrl && !wa) return "";
  if (!kapsoUrl) {
    return `<p><a href="${wa}" target="_blank" rel="noopener noreferrer"><b>Escribir por WhatsApp</b></a></p>`;
  }
  const waBit = wa
    ? ` · <a href="${wa}" target="_blank" rel="noopener noreferrer"><b>Escribir por WhatsApp</b></a>`
    : "";
  return `<p><a href="${kapsoUrl}" target="_blank" rel="noopener noreferrer"><b>Abrir chat en Kapso</b></a>${waBit}</p>`;
}

function injectCrmConversationLinks(desc, env, conversationId, customerPhone) {
  let next = String(desc || "");
  const wa = buildWaMeLink(customerPhone);
  const hasKapso = /inbox\.kapso\.ai|Abrir chat en Kapso/i.test(next);
  const hasWa = /wa\.me\//i.test(next);
  if (!hasKapso) {
    const links = crmConversationLinksHtml(env, conversationId, customerPhone);
    if (links) next = `${links}\n${next}`.trim();
  } else if (wa && !hasWa) {
    next = next.replace(
      /(<b>Abrir chat en Kapso<\/b><\/a>)/i,
      `$1 · <a href="${wa}" target="_blank" rel="noopener noreferrer"><b>Escribir por WhatsApp</b></a>`
    );
  }
  return next;
}

function isStaffOrBusinessPhone(phone) {
  const d = digits(phone);
  return (
    d === "573213988464" ||
    d === "573103362484" ||
    d === "3000000066" ||
    d.slice(-10) === "3000000066"
  );
}

/** Cliente pega el número en texto (ej. "3000000008") en vez de compartir contacto. */
function extractPhoneFromText(message) {
  const type = compact(message?.type || "text") || "text";
  if (type !== "text") return null;
  const body = compact(
    (message?.text && typeof message.text === "object"
      ? message.text.body
      : message?.text) ||
      message?.body ||
      message?.kapso?.content ||
      ""
  );
  if (!body) return null;
  const extra = body.replace(/[\d\s+\-().]/g, "");
  if (extra.length > 40) return null;
  const d = digits(body);
  if (!d) return null;
  let local10 = d;
  if (d.startsWith("57") && d.length >= 12) local10 = d.slice(-10);
  else if (d.length !== 10) return null;
  if (local10.length !== 10 || local10[0] !== "3") return null;
  const phone = `57${local10}`;
  if (isStaffOrBusinessPhone(phone)) return null;
  return {
    phone,
    raw_phone: body,
    name: "",
    origin: "text",
    bsuid: compact(message?.from_user_id || ""),
  };
}

function extractContacts(message) {
  const type = compact(message?.type || "");
  if (type !== "contacts") return extractPhoneFromText(message);
  const list = Array.isArray(message?.contacts) ? message.contacts : [];
  let phone = "";
  let name = "";
  for (const c of list) {
    const phones = Array.isArray(c?.phones) ? c.phones : [];
    for (const p of phones) {
      phone = compact(p?.wa_id || p?.phone || "");
      if (phone) break;
    }
    if (!name) {
      const n = c?.name;
      name = compact(
        (n && typeof n === "object" ? n.formatted_name || n.first_name : n) ||
          c?.profile_name ||
          ""
      );
    }
    if (phone) break;
  }
  const parsedPhone = digits(phone);
  if (!parsedPhone || isStaffOrBusinessPhone(parsedPhone)) return null;
  return {
    phone: parsedPhone,
    raw_phone: compact(phone),
    name,
    origin: compact(list[0]?.origin || "contacts"),
    bsuid: compact(message?.from_user_id || ""),
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handler(request, env) {
  const url = new URL(request.url);
  const now = new Date().toISOString();

  if (request.method === "GET") {
    return jsonResponse({ ok: true, service: "on-contact-shared", at: now });
  }

  const want = expectedSecret(env);
  const got = extractSecret(request, url);
  if (want && got !== want) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const raw = await request.json().catch(() => ({}));
  const events = raw?.batch ? (Array.isArray(raw?.data) ? raw.data : []) : [raw];
  const results = [];

  for (const evt of events) {
    const message = evt?.message || evt?.input?.message || evt?.input || {};
    const conv = evt?.conversation || evt?.input?.conversation || {};
    const fromDigits = digits(
      message?.from || message?.kapso?.phone_number || conv?.phone_number || ""
    );
    if (fromDigits && isStaffOrBusinessPhone(fromDigits)) continue;

    const parsed = extractContacts(message);
    if (!parsed) continue;

    const conversationId = compact(conv?.id || message?.conversation_id || "");
    const bsuid = parsed.bsuid || compact(conv?.business_scoped_user_id || "");
    const phone = parsed.phone;
    const customerName = parsed.name || compact(conv?.contact_name || conv?.username || "");

    if (!phone) {
      results.push({ ok: false, error: "no_phone_in_contact", bsuid, conversationId });
      continue;
    }

    // Resolver (o crear) el lead y su asesor asignado — nunca ambos.
    const lead = await resolveLeadAndAsesor(env, { conversationId, bsuid, phone, customerName });

    const waLink = buildWaMeLink(phone);
    // Destino: SOLO el asesor asignado (resuelto o asignado ahora).
    const asesorPhone = lead?.asesor_phone || phoneOf(lead?.asesor);
    const toPhones = asesorPhone ? [asesorPhone] : [];

    const clienteLabel = customerName || lead?.lead_name || (phone ? `WA ${phone.slice(-10)}` : "cliente");
    // Mensaje limpio: sin IDs técnicos ni lead_id.
    const msg =
      `El cliente ${clienteLabel} compartió su número de WhatsApp para continuar con su pedido. ` +
      `Para hablarle y cerrar la venta, abra este enlace:\n${waLink || phone}`;

    const sends = [];
    let deferred = false;
    if (!lead?.already_notified) {
      if (!staffNotifyOk()) {
        deferred = true;
        if (lead?.lead_id) {
          await writePendingStaffNotify(env, lead.lead_id, {
            assignee_phone: asesorPhone,
            assignee_name: lead?.asesor || null,
            customer_name: clienteLabel,
            customer_phone: phone,
            conversation_id: conversationId || null,
            order_summary: "compartió su número de WhatsApp",
            detail_text: msg,
            created_at: now,
          }).catch(() => ({ ok: false }));
        }
      } else {
        for (const to of toPhones) {
          const s = await sendWhatsAppText(env, to, msg);
          sends.push({ to, ok: s.ok, message_id: s.message_id || null, error: s.error || null });
        }
      }
    }
    results.push({
      ok: true,
      customer_name: clienteLabel,
      phone,
      bsuid,
      conversation_id: conversationId,
      lead_id: lead?.lead_id || null,
      asesor: lead?.asesor || null,
      asesor_phone: asesorPhone || null,
      reused_lead: lead?.reused || false,
      assigned_now: lead?.assigned_now || false,
      already_notified: lead?.already_notified || false,
      deferred_staff_notify: deferred,
      wa_link: waLink,
      sends,
    });
  }

  if (!results.length) {
    return jsonResponse({ ok: true, ignored: true, message: "No contact messages in payload" });
  }
  return jsonResponse({ ok: true, results, at: now });
}

export { handler };
