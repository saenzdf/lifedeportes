/**
 * staff-bridge-hermes — shadow bridge staff WA → Telegram notify and/or Hermes webhook.
 * Not wired in the inbound graph. Kapso Agent Staff still owns production staff.
 *
 * Envelope: life_staff_bridge_v1 (kapso/docs/staff_hermes_bridge.md)
 */
function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function waInboundText(msg) {
  if (!msg || typeof msg !== "object") return "";
  const direct = msg.content ?? msg.body;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const nested = msg.text;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  if (nested && typeof nested === "object") {
    const bodyText = nested.body ?? nested.text;
    if (typeof bodyText === "string" && bodyText.trim()) return bodyText.trim();
  }
  return "";
}

function collectMedia(msg) {
  if (!msg || typeof msg !== "object") return [];
  const url =
    msg.media_url ||
    msg.media?.url ||
    msg.document?.url ||
    msg.image?.url ||
    null;
  if (!url) return [];
  return [
    {
      url,
      mime_type: compact(msg.media?.mime_type || msg.mimetype) || null,
      filename: compact(msg.media?.filename || msg.document?.filename || msg.filename) || null,
    },
  ];
}

function buildEnvelope(body) {
  const whatsappContext = body?.whatsapp_context || {};
  const messages = Array.isArray(whatsappContext.messages) ? whatsappContext.messages : [];
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound") || messages[messages.length - 1] || {};
  const executionContext = body?.execution_context || {};
  const vars = executionContext.vars || {};
  const context = executionContext.context || {};
  const conversation = whatsappContext.conversation || {};

  const waId = compact(
    context?.phone_number || conversation.phone_number || vars?.user?.wa_id || ""
  ).replace(/\D/g, "");

  return {
    schema: "life_staff_bridge_v1",
    source: "kapso",
    lane: "staff",
    at: new Date().toISOString(),
    staff: {
      wa_id: waId || null,
      name: compact(vars?.user?.name || vars?.user?.staff_member?.name) || null,
    },
    conversation_id: conversation.id || conversation.conversation_id || vars?.kapso?.conversation_id || null,
    message_id: lastInbound.id || lastInbound.wamid || lastInbound.message_id || null,
    text: waInboundText(lastInbound) || compact(vars?.intent?.raw_text) || "",
    media: collectMedia(lastInbound),
    kapso: {
      execution_id: executionContext.execution_id || context?.execution_id || null,
      phone_number_id: vars?.tenant?.phone_number_id || "1095603153637786",
    },
  };
}

async function hmacSha256Hex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendTelegramNotify(env, envelope) {
  const token = compact(env.TELEGRAM_BOT_TOKEN);
  const chatId = compact(env.TELEGRAM_HOME_CHANNEL);
  if (!token || !chatId) {
    return { ok: false, error: "missing TELEGRAM_BOT_TOKEN or TELEGRAM_HOME_CHANNEL" };
  }
  const lines = [
    "STAFF WA → Hermes (notify, no agent)",
    envelope.staff?.name ? `${envelope.staff.name} ${envelope.staff.wa_id || ""}`.trim() : envelope.staff?.wa_id || "staff",
    envelope.text || "(sin texto)",
    envelope.media?.length ? `media: ${envelope.media.length}` : null,
    envelope.conversation_id ? `conv ${envelope.conversation_id}` : null,
  ].filter(Boolean);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: lines.join("\n").slice(0, 3500),
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: Boolean(data.ok), error: data.ok ? null : compact(data.description) || `http_${res.status}` };
}

async function postHermesWebhook(env, envelope) {
  const url = compact(env.HERMES_WEBHOOK_URL);
  const secret = compact(env.HERMES_WEBHOOK_SECRET);
  if (!url) return { ok: false, error: "missing HERMES_WEBHOOK_URL" };
  const payload = JSON.stringify(envelope);
  const headers = { "Content-Type": "application/json", "X-Request-ID": compact(envelope.message_id) || envelope.at };
  if (secret) {
    headers["X-Hub-Signature-256"] = `sha256=${await hmacSha256Hex(secret, payload)}`;
  }
  const res = await fetch(url, { method: "POST", headers, body: payload });
  return { ok: res.ok, error: res.ok ? null : `http_${res.status}` };
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const envelope = buildEnvelope(body);
  const mode = compact(env.STAFF_BRIDGE_MODE || "telegram_notify").toLowerCase();
  const now = new Date().toISOString();

  const out = { telegram: null, webhook: null };
  if (mode === "telegram_notify" || mode === "both") {
    out.telegram = await sendTelegramNotify(env, envelope);
  }
  if (mode === "hermes_webhook" || mode === "both") {
    out.webhook = await postHermesWebhook(env, envelope);
  }

  const ok =
    (out.telegram ? out.telegram.ok : true) && (out.webhook ? out.webhook.ok : true);

  return new Response(
    JSON.stringify({
      vars: {
        staff_bridge: {
          schema: envelope.schema,
          mode,
          ok,
          telegram: out.telegram,
          webhook: out.webhook,
          conversation_id: envelope.conversation_id,
          message_id: envelope.message_id,
        },
        service: {
          ...(vars.service || {}),
          last_call_name: "staff_bridge_hermes",
          last_call_status: ok ? "ready" : "fallback",
          last_call_at: now,
          fallback_message: ok ? null : "staff bridge failed; Agent Staff remains source of truth",
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
