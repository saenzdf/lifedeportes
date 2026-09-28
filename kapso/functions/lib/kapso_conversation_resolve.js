/**
 * Verifica que un conversation_id de Kapso corresponda al cliente (teléfono / BSUID).
 * Evita links de inbox que abren otro contacto (API q/list a veces mezcla hilos).
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

export function conversationMatchesPhone(conversation, phoneDigits) {
  const want = local10(phoneDigits);
  if (!want) return false;
  const got = local10(
    conversation?.phone_number || conversation?.phone || conversation?.wa_id || ""
  );
  if (!got) return false;
  return want === got;
}

export function conversationMatchesBsuid(conversation, bsuid) {
  const want = compact(bsuid);
  if (!want) return false;
  const got = compact(
    conversation?.business_scoped_user_id ||
      conversation?.kapso?.business_scoped_user_id ||
      ""
  );
  return Boolean(got && got === want);
}

function kapsoConfig(env = {}) {
  const base = compact(env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const key = compact(env.KAPSO_API_KEY || "");
  if (!base || !key) return null;
  return { base, key };
}

async function kapsoGet(cfg, path, query = {}) {
  const url = new URL(`${cfg.base}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const resp = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-API-Key": cfg.key },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`kapso_${resp.status}`);
  }
  return json?.data ?? json;
}

function unwrapList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.conversations)) return payload.conversations;
  if (Array.isArray(payload?.whatsapp_conversations)) return payload.whatsapp_conversations;
  return [];
}

async function fetchConversationDetail(cfg, conversationId) {
  try {
    return await kapsoGet(cfg, `/platform/v1/whatsapp/conversations/${conversationId}`);
  } catch {
    return null;
  }
}

async function listConversationsForPhone(cfg, phoneDigits) {
  const phone = digits(phoneDigits);
  const payload = await kapsoGet(cfg, "/platform/v1/whatsapp/conversations", {
    phone_number: phone,
    phone,
    q: phone,
    per_page: 50,
  });
  return unwrapList(payload).filter((c) => conversationMatchesPhone(c, phone));
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

/**
 * Devuelve conversation_id verificado para links Kapso / template.
 * Si no hay match seguro → conversation_id null (staff usa wa.me).
 */
export function extractPhoneDigitsFromConversation(conversation) {
  const raw = compact(
    conversation?.phone_number || conversation?.phone || ""
  );
  const wa = compact(conversation?.wa_id || "");
  const candidate = raw || (/^(CO|US)\./i.test(wa) ? "" : wa);
  const d = digits(candidate);
  if (!d) return "";
  if (d.length === 10 && d.startsWith("3")) return `57${d}`;
  return d.length >= 10 ? d : "";
}

/** Teléfono E.164/digits desde Kapso cuando el grafo solo trae BSUID. */
export async function resolveCustomerPhoneFromKapso(env, conversationId) {
  const cfg = kapsoConfig(env);
  const hint = compact(conversationId);
  if (!cfg || !hint) return "";
  const detail = await fetchConversationDetail(cfg, hint);
  return extractPhoneDigitsFromConversation(detail);
}

export async function resolveVerifiedConversationId(
  env,
  { conversationId, phoneDigits, bsuid } = {}
) {
  const cfg = kapsoConfig(env);
  const hint = compact(conversationId);
  const phone = digits(phoneDigits);
  const bsuidWant = compact(bsuid);

  if (!cfg) {
    return {
      conversation_id: hint || null,
      verified: false,
      method: "missing_kapso_config",
    };
  }

  if (hint && (phone.length >= 10 || bsuidWant)) {
    const detail = await fetchConversationDetail(cfg, hint);
    if (detail?.id) {
      const phoneOk = phone.length >= 10 && conversationMatchesPhone(detail, phone);
      const bsuidOk = bsuidWant && conversationMatchesBsuid(detail, bsuidWant);
      if (phoneOk || bsuidOk || (!phone.length && !bsuidWant)) {
        return {
          conversation_id: hint,
          verified: true,
          method: "hint_verified",
          contact_name: detail?.kapso?.contact_name || null,
          phone_digits: extractPhoneDigitsFromConversation(detail) || null,
        };
      }
    }
  }

  if (phone.length >= 10) {
    const matches = await listConversationsForPhone(cfg, phone);
    const best = pickBestConversation(matches, hint);
    if (best?.id) {
      return {
        conversation_id: String(best.id),
        verified: true,
        method: hint && compact(best.id) !== hint ? "phone_lookup_corrected" : "phone_lookup",
        contact_name: best?.kapso?.contact_name || null,
        rejected_hint: hint && compact(best.id) !== hint ? hint : null,
      };
    }
  }

  if (bsuidWant) {
    const payload = await kapsoGet(cfg, "/platform/v1/whatsapp/conversations", {
      q: bsuidWant,
      per_page: 30,
    });
    const matches = unwrapList(payload).filter((c) => conversationMatchesBsuid(c, bsuidWant));
    const best = pickBestConversation(matches, hint);
    if (best?.id) {
      return {
        conversation_id: String(best.id),
        verified: true,
        method: "bsuid_lookup",
        contact_name: best?.kapso?.contact_name || null,
      };
    }
  }

  return {
    conversation_id: null,
    verified: false,
    method: "no_safe_match",
    rejected_hint: hint || null,
  };
}
