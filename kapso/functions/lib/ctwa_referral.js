/**
 * Click-to-WhatsApp (CTWA) referral helpers.
 * Meta may attach `referral` on the first inbound from an ad.
 * Kapso Platform list/get message API often omits it; workflow whatsapp_context
 * may still carry it. Prefill icebreaker is a fallback signal.
 */

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function messageText(msg) {
  if (!msg || typeof msg !== "object") return "";
  const direct = msg.content ?? msg.body ?? msg.caption ?? msg.kapso?.content;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const nested = msg.text ?? msg.message?.text;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  if (nested && typeof nested === "object") {
    const bodyText = nested.body ?? nested.text;
    if (typeof bodyText === "string" && bodyText.trim()) return bodyText.trim();
  }
  return "";
}

function pickReferral(msg) {
  if (!msg || typeof msg !== "object") return null;
  const raw =
    msg.referral ||
    msg.kapso?.referral ||
    msg.message?.referral ||
    msg.raw?.referral ||
    null;
  if (!raw || typeof raw !== "object") return null;
  const sourceId = compact(raw.source_id || raw.sourceId);
  const ctwaClid = compact(raw.ctwa_clid || raw.ctwaClid);
  const sourceUrl = compact(raw.source_url || raw.sourceUrl);
  if (!sourceId && !ctwaClid && !sourceUrl) return null;
  return {
    source_type: compact(raw.source_type || raw.sourceType) || null,
    source_id: sourceId || null,
    source_url: sourceUrl || null,
    ctwa_clid: ctwaClid || null,
    headline: compact(raw.headline) || null,
    body: compact(raw.body) || null,
    media_type: compact(raw.media_type || raw.mediaType) || null,
    image_url: compact(raw.image_url || raw.imageUrl || raw.thumbnail_url) || null,
    video_url: compact(raw.video_url || raw.videoUrl) || null,
  };
}

function parseIcebreaker(text) {
  const t = compact(text);
  const m = t.match(/^Hola,\s*quiero cotizar uniformes de\s*(.*)$/i);
  if (!m) return null;
  return {
    icebreaker: "Hola, quiero cotizar uniformes de",
    suffix: compact(m[1]) || "",
  };
}

/**
 * Extract best CTWA signal from inbound messages + prior vars.ctwa.
 */
function extractCtwa(messages = [], prior = null) {
  const inbound = (Array.isArray(messages) ? messages : []).filter(
    (m) => !m?.direction || String(m.direction).toLowerCase() === "inbound"
  );

  let fromReferral = null;
  for (const msg of inbound) {
    const ref = pickReferral(msg);
    if (ref) {
      fromReferral = {
        detected: true,
        source: "referral",
        ...ref,
        captured_at: new Date().toISOString(),
      };
      break;
    }
  }

  let fromPrefill = null;
  for (const msg of [...inbound].reverse()) {
    const ice = parseIcebreaker(messageText(msg));
    if (!ice) continue;
    fromPrefill = {
      detected: true,
      source: "prefill_heuristic",
      icebreaker: ice.icebreaker,
      icebreaker_suffix: ice.suffix || null,
      source_type: "ad",
      captured_at: new Date().toISOString(),
    };
    break;
  }

  const priorObj =
    prior && typeof prior === "object" && prior.detected ? { ...prior } : null;

  // Prefer real referral fields; keep icebreaker from heuristic/prior.
  if (fromReferral) {
    const merged = {
      ...(priorObj || {}),
      ...fromReferral,
      icebreaker:
        fromPrefill?.icebreaker ||
        priorObj?.icebreaker ||
        fromReferral.icebreaker ||
        null,
      icebreaker_suffix:
        fromPrefill?.icebreaker_suffix ||
        priorObj?.icebreaker_suffix ||
        fromReferral.icebreaker_suffix ||
        null,
    };
    return merged;
  }

  if (priorObj?.source === "referral" || priorObj?.source_id || priorObj?.ctwa_clid) {
    return {
      ...priorObj,
      icebreaker: priorObj.icebreaker || fromPrefill?.icebreaker || null,
      icebreaker_suffix:
        priorObj.icebreaker_suffix || fromPrefill?.icebreaker_suffix || null,
    };
  }

  if (fromPrefill) {
    return { ...(priorObj || {}), ...fromPrefill };
  }

  return priorObj;
}

function formatCtwaDescriptionBlock(ctwa) {
  if (!ctwa || !ctwa.detected) return "";
  const lines = ["CTWA_v1"];
  if (ctwa.source) lines.push(`source: ${ctwa.source}`);
  if (ctwa.source_type) lines.push(`source_type: ${ctwa.source_type}`);
  if (ctwa.source_id) lines.push(`source_id: ${ctwa.source_id}`);
  if (ctwa.ctwa_clid) lines.push(`ctwa_clid: ${ctwa.ctwa_clid}`);
  if (ctwa.source_url) lines.push(`source_url: ${ctwa.source_url}`);
  if (ctwa.headline) lines.push(`headline: ${ctwa.headline}`);
  if (ctwa.body) lines.push(`body: ${ctwa.body}`);
  if (ctwa.media_type) lines.push(`media_type: ${ctwa.media_type}`);
  if (ctwa.icebreaker) lines.push(`icebreaker: ${ctwa.icebreaker}`);
  if (ctwa.icebreaker_suffix != null && ctwa.icebreaker_suffix !== "") {
    lines.push(`icebreaker_suffix: ${ctwa.icebreaker_suffix}`);
  }
  if (ctwa.captured_at) lines.push(`captured_at: ${ctwa.captured_at}`);
  return lines.join("\n");
}

function upsertCtwaInDescription(description, ctwa) {
  const block = formatCtwaDescriptionBlock(ctwa);
  if (!block) return description || "";
  const html = `<pre>${block.replace(/</g, "&lt;")}</pre>`;
  const cur = String(description || "");
  if (/CTWA_v1/i.test(cur)) {
    const next = cur
      .replace(/<pre>[\s\S]*?CTWA_v1[\s\S]*?<\/pre>/i, html)
      .replace(/CTWA_v1[\s\S]*?(?=\n\n|$)/, block);
    if (/CTWA_v1/i.test(next)) return next;
    return `${cur}\n\n${html}`;
  }
  return cur ? `${cur}\n\n${html}` : html;
}

function ctwaHasAttributionIds(ctwa) {
  return Boolean(ctwa && (ctwa.source_id || ctwa.ctwa_clid || ctwa.source_url));
}

module.exports = {
  compact,
  fold,
  messageText,
  pickReferral,
  parseIcebreaker,
  extractCtwa,
  formatCtwaDescriptionBlock,
  upsertCtwaInDescription,
  ctwaHasAttributionIds,
};
