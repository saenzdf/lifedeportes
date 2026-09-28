/**
 * Direccionamiento outbound WhatsApp — teléfono E.164 (`to`) y/o BSUID (`recipient`).
 * Meta/Kapso: templates pueden ir a BSUID; wa.me solo con teléfono.
 */

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** CO.xxx / US.xxx / US.ENT.xxx */
function isBsuid(value) {
  return /^[A-Z]{2}(\.ENT)?\.[A-Za-z0-9._-]+$/i.test(compact(value));
}

function normalizePhone(raw) {
  const rawStr = compact(raw);
  if (isBsuid(rawStr)) return "";
  let d = digits(rawStr);
  if (d.length === 10 && d.startsWith("3")) d = `57${d}`;
  if (d.length >= 10 && d.length <= 15) return d;
  return "";
}

function extractBsuidFromText(text) {
  const src = String(text || "");
  for (const marker of ["kapso:bsuid=", "bsuid="]) {
    const pos = src.indexOf(marker);
    if (pos < 0) continue;
    const rest = src.slice(pos + marker.length);
    let token = "";
    for (const ch of rest) {
      if (" \t\n\r<>\"'&;".includes(ch)) break;
      token += ch;
    }
    if (isBsuid(token)) return token;
  }
  return "";
}

function extractConversationIdFromText(text) {
  const src = String(text || "");
  const convMarker = "kapso:conv=";
  let pos = src.indexOf(convMarker);
  if (pos >= 0) {
    const rest = src.slice(pos + convMarker.length);
    let token = "";
    for (const ch of rest) {
      if (" \t\n\r<>\"'&;".includes(ch)) break;
      token += ch;
    }
    if (/^[0-9a-f-]{36}$/i.test(token)) return token;
  }
  const urlKey = "conversation_id=";
  pos = src.indexOf(urlKey);
  if (pos >= 0) {
    const rest = src.slice(pos + urlKey.length);
    let token = "";
    for (const ch of rest) {
      if ("& \t\n\r<>\"'".includes(ch)) break;
      token += ch;
    }
    if (/^[0-9a-f-]{36}$/i.test(token)) return token;
  }
  return "";
}

function extractPhoneFromConversation(detail) {
  const raw = compact(detail?.phone_number || detail?.phone || detail?.kapso?.phone_number || "");
  const wa = compact(detail?.wa_id || "");
  const candidate = raw || (/^(CO|US)\./i.test(wa) ? "" : wa);
  return normalizePhone(candidate);
}

function extractBsuidFromConversation(detail) {
  const got = compact(
    detail?.business_scoped_user_id ||
      detail?.kapso?.business_scoped_user_id ||
      detail?.from_user_id ||
      ""
  );
  return isBsuid(got) ? got : "";
}

/**
 * Arma el cuerpo base Meta (sin type/template/document).
 * Prioridad Kapso: si hay teléfono + BSUID, manda ambos (Meta usa `to`).
 */
function buildMetaAddress({ phone, bsuid }) {
  const to = normalizePhone(phone);
  const recipient = isBsuid(bsuid) ? compact(bsuid) : "";
  if (!to && !recipient) return null;
  const base = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
  };
  if (to && recipient) {
    base.to = to;
    base.recipient = recipient;
  } else if (recipient) {
    base.recipient = recipient;
  } else {
    base.to = to;
  }
  return base;
}

async function fetchKapsoConversation(env, conversationId) {
  const cfgBase = compact(env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const key = compact(env.KAPSO_API_KEY || "");
  const id = compact(conversationId);
  if (!key || !id) return null;
  const resp = await fetch(`${cfgBase}/platform/v1/whatsapp/conversations/${id}`, {
    headers: { Accept: "application/json", "X-API-Key": key },
  });
  if (!resp.ok) return null;
  const json = await resp.json().catch(() => ({}));
  return json?.data || json || null;
}

/**
 * Resuelve destino desde payload Odoo/webhook.
 * @returns {{ phone: string, bsuid: string, conversation_id: string|null, method: string }}
 */
async function resolveOutboundTarget(env, input) {
  let phone = normalizePhone(
    input.customer_phone || input.partner_phone || input.phone || input.mobile || ""
  );
  let bsuid = compact(input.bsuid || input.business_scoped_user_id || input.recipient || "");
  if (bsuid && !isBsuid(bsuid)) bsuid = "";
  const conversationId = compact(input.conversation_id || input.kapso_conversation_id || "");

  if (!phone && !bsuid) {
    const blob = [input.description, input.order_summary, input.customer_name].join("\n");
    phone = normalizePhone(extractPhoneFromText(blob));
    bsuid = extractBsuidFromText(blob) || bsuid;
  }

  if ((!phone && !bsuid) && conversationId) {
    const detail = await fetchKapsoConversation(env, conversationId);
    if (detail) {
      phone = phone || extractPhoneFromConversation(detail);
      bsuid = bsuid || extractBsuidFromConversation(detail);
      return {
        phone,
        bsuid,
        conversation_id: conversationId,
        method: "kapso_conversation_lookup",
      };
    }
  }

  return {
    phone,
    bsuid,
    conversation_id: conversationId || null,
    method: phone && bsuid ? "phone_and_bsuid" : bsuid ? "bsuid_only" : phone ? "phone_only" : "unresolved",
  };
}

function extractPhoneFromText(text) {
  const src = String(text || "").toLowerCase();
  const key = "wa.me/";
  const pos = src.indexOf(key);
  if (pos < 0) return "";
  const rest = String(text || "").slice(pos + key.length);
  let out = "";
  for (const ch of rest) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (out) break;
  }
  return normalizePhone(out);
}

export {
  isBsuid,
  normalizePhone,
  extractBsuidFromText,
  extractConversationIdFromText,
  buildMetaAddress,
  resolveOutboundTarget,
  fetchKapsoConversation,
  extractPhoneFromConversation,
  extractBsuidFromConversation,
};
