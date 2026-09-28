/**
 * Evita repetir el mismo WhatsApp proactivo al staff (Paola/Javier).
 * Compara el último outbound a ese número con el texto que se quiere enviar.
 *
 * Flag: LIFE_STAFF_OUTBOUND_DEDUPE (default true)
 * Secrets: KAPSO_API_KEY, KAPSO_API_BASE_URL (opt)
 */

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** Normaliza para comparar (espacios, minúsculas). */
function normalizeOutboundCompare(text) {
  return compact(text).toLowerCase();
}

function dedupeEnabled(env) {
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

function templateCompareKey({ templateName, client, orderSummary, value, conversationId }) {
  return normalizeOutboundCompare(
    `${templateName || "template"}|${client || ""}|${orderSummary || ""}|${value || ""}|${conversationId || ""}`
  );
}

/**
 * Último mensaje outbound de Kapso hacia ese teléfono (staff).
 * @returns {{ text: string, at: string|null, message_id: string|null }|null}
 */
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

/**
 * @param {object} env
 * @param {string} toDigits E.164 digits
 * @param {string} intendedText Texto o fingerprint a comparar
 * @returns {Promise<{ duplicate: boolean, last?: string|null, reason?: string }>}
 */
async function isDuplicateStaffOutbound(env, toDigits, intendedText) {
  if (!dedupeEnabled(env)) return { duplicate: false, reason: "dedupe_disabled" };
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

export {
  compact,
  digits,
  normalizeOutboundCompare,
  templateCompareKey,
  fetchLastStaffOutbound,
  isDuplicateStaffOutbound,
  dedupeEnabled,
};
