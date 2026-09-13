#!/usr/bin/env node
/**
 * Auditoría de respuestas del agente Kapso Life Deportes (carril cliente).
 *
 * Clasifica chats recientes: bien / mal / sin responder / silencio correcto
 * (Ads prefill, spam), según el prompt vendedor v10 y las KBs comerciales.
 *
 *   node kapso/scripts/audit_customer_responses.js
 *   node kapso/scripts/audit_customer_responses.js --hours 168 --pages 8
 *
 * Env: KAPSO_API_KEY (obligatoria). Opcional:
 *   KAPSO_API_BASE_URL (default https://api.kapso.ai)
 *   KAPSO_PHONE_NUMBER_ID (default Life 1095603153637786)
 *
 * Salidas (no versionar PII):
 *   scratch/kapso_response_audit_<fecha>.json
 *   scratch/kapso_response_audit_<fecha>.md
 *   /opt/cursor/artifacts/kapso_response_audit_<fecha>.md  (si existe el dir)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const PHONE_ID_DEFAULT = "1095603153637786";
const WF_ID = "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6";
const STAFF_PHONES = new Set([
  "573103362484", // Javier
  "573213988464", // Paola
  "3000000046", // Sebastián
  "3000000047", // Diego
]);
const ADS_PREFILL = /^hola,\s*quiero\s+cotizar\s+uniformes\s+de\s*$/i;
const PRODUCT_SIGNAL =
  /uniforme|camiseta|camisa|kit|conjunto|pantaloneta|short|media|arquero|portero|buzo|buso|hoodie|sudadera|peto|gorra|bandera|cotiz|precio|valor|cu[aá]nto|f[uú]tbol|baloncesto|basket|volei|voley|atletismo|microf[uú]tbol|futsal|dumonti|dry.?fit|polo|manga|cuello|talla|pedido|abono|dise[nñ]o|logo|escudo/i;
const COMMERCIAL_INTENT =
  /cotiz|precio|valor|uniforme|camiseta|pedido|abono|dise[nñ]o|talla|lista|excel|cu[aá]nto|necesito|quiero|para\s+\d+/i;
const UNSUPPORTED_SPORT =
  /ciclismo|nataci[oó]n|b[eé]isbol|hockey|patinaje|porras|equitaci[oó]n|motociclismo|tenis(?!\s*de\s*mesa)/i;
const FAQ_KEYS = [
  { id: "descuento", re: /descuento|mayor[ei]sta|rebaja|por\s+volumen/i },
  { id: "rompevientos", re: /rompeviento|chaqueta/i },
  { id: "peto", re: /\bpetos?\b/i },
  { id: "catalogo", re: /cat[aá]logo|ver productos/i },
  { id: "fotos", re: /fotos?\s+(reales|de trabajos)|instagram|facebook|trabajos suyos/i },
  { id: "direccion", re: /direcci[oó]n|d[oó]nde est[aá]n|ubicaci[oó]n|me dirijo/i },
  { id: "pago", re: /c[oó]mo pago|transferen|nequi|bancolombia|daviplata|abono|n[uú]mero de cuenta/i },
  { id: "envio", re: /env[ií]os?|flete|transportadora/i },
  { id: "tallas", re: /tallas?\s+(disponible|tienen)|2xl|3xl|xxl/i },
  { id: "lista", re: /formato|excel|lista de (nombres|tallas)|me manda el formato/i },
  { id: "tela", re: /tela|dry.?fit|dumonti|hidrotec|material|calidad/i },
  { id: "plazo", re: /cu[aá]nto (se demoran|tardan)|d[ií]as h[aá]biles|tiempo de entrega/i },
];
const BAD_CONSULT =
  /d[eé]jeme consultar|le confirmo (en breve|con el equipo)|voy a (consultar|confirmar con)|reviso con (el )?equipo/i;
const BAD_TOOL_NARRATE =
  /voy a (buscar|ver la herramienta|consultar el precio|revisar en el sistema)|estoy buscando|d[eé]jeme buscar/i;
const BAD_CTA =
  /\bf(dese[ae]\s+avanzar|confirmamos\??|procedemos\??|le armo el pedido|avanzamos\??|le queda alguna duda)\b/i;
const BAD_BRAND_HELLO = /hola,?\s*life\s+deportes/i;
const BAD_MARKDOWN = /\*\*[^*]+\*\*/;
const PRICE_ASK = /cu[aá]nto|precio|valor|cotiz/i;
const PRICE_GIVEN = /\$\s?\d/;
const ACCEPT =
  /\b(dale|listo|deseo hacer el pedido|n[uú]mero para (el )?abono|c[oó]mo (pago|abono)|s[ií] (por favor|adelante)|confirmamos|adelante)\b/i;
const ASK_HUMAN =
  /asesor|humano|persona real|llamar|llamada|tel[eé]fono|no virtual|hablar con alguien/i;
const BURST_MS = 45 * 1000;
const UNANSWERED_GRACE_MS = 3 * 60 * 1000;

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}

function digits(v) {
  return String(v || "").replace(/\D/g, "");
}

function local10(v) {
  const d = digits(v);
  return d.length >= 10 ? d.slice(-10) : d;
}

function isStaffPhone(phone) {
  const d = digits(phone);
  const l = local10(d);
  for (const s of STAFF_PHONES) {
    if (d === s || l === local10(s)) return true;
  }
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function unwrapList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.whatsapp_conversations)) return payload.whatsapp_conversations;
  if (Array.isArray(payload?.conversations)) return payload.conversations;
  if (Array.isArray(payload?.messages)) return payload.messages;
  if (Array.isArray(payload?.executions)) return payload.executions;
  if (Array.isArray(payload?.data?.whatsapp_conversations)) {
    return payload.data.whatsapp_conversations;
  }
  if (Array.isArray(payload?.data?.conversations)) return payload.data.conversations;
  if (Array.isArray(payload?.data?.messages)) return payload.data.messages;
  if (Array.isArray(payload?.data?.executions)) return payload.data.executions;
  return [];
}

function extractCount(payload) {
  return (
    payload?.meta?.total ||
    payload?.pagination?.total_count ||
    payload?.total ||
    unwrapList(payload).length ||
    0
  );
}

async function kapso(apiPath) {
  const base = (process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(
    /\/$/,
    ""
  );
  const res = await fetch(`${base}${apiPath}`, {
    headers: {
      "X-API-Key": process.env.KAPSO_API_KEY,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Kapso ${res.status} ${apiPath}: ${text.slice(0, 240)}`);
    err.status = res.status;
    err.json = json;
    throw err;
  }
  return json;
}

function msgTime(m) {
  const raw =
    m?.created_at ||
    m?.timestamp ||
    m?.kapso?.created_at ||
    m?.kapso?.sent_at ||
    null;
  if (!raw) return 0;
  if (typeof raw === "number") {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  const n = Number(raw);
  if (Number.isFinite(n) && String(raw).length <= 13 && /^\d+$/.test(String(raw))) {
    return n < 1e12 ? n * 1000 : n;
  }
  const d = Date.parse(raw);
  return Number.isFinite(d) ? d : 0;
}

function msgDirection(m) {
  const d = String(m?.kapso?.direction || m?.direction || "").toLowerCase();
  if (d === "inbound" || d === "in") return "inbound";
  if (d === "outbound" || d === "out") return "outbound";
  return d || "unknown";
}

function msgOrigin(m) {
  return String(m?.kapso?.origin || m?.origin || "").toLowerCase() || "unknown";
}

function msgType(m) {
  return String(m?.type || m?.message_type || m?.kapso?.type || "text").toLowerCase();
}

function msgContent(m) {
  const k = m?.kapso || {};
  const t = m?.text || {};
  const parts = [
    k.content,
    k.transcription,
    k.caption,
    typeof t === "string" ? t : t.body,
    m?.caption,
    m?.image?.caption,
    m?.document?.filename,
    m?.document?.caption,
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const type = msgType(m);
  if (!parts.length) {
    if (type === "image") return "[imagen]";
    if (type === "audio") return "[audio]";
    if (type === "video") return "[video]";
    if (type === "document") return "[documento]";
    if (type === "sticker") return "[sticker]";
    if (type === "reaction") return "[reaccion]";
    return "";
  }
  return parts.join(" ").slice(0, 2000);
}

function anonymize(text) {
  return String(text || "")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "[URL]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(/(?:\+?57[\s.-]?)?(?:3\d{2})[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[TEL]")
    .replace(/\b\d{7,}\b/g, "[NUM]")
    .replace(/\s+/g, " ")
    .trim();
}

function displayName(name) {
  const first = String(name || "")
    .trim()
    .split(/\s+/)[0];
  if (!first || first.length < 2) return "Cliente";
  return first.slice(0, 24);
}

function phoneTag(phone) {
  const d = digits(phone);
  return d ? `…${d.slice(-4)}` : "…????";
}

function faqsIn(text) {
  return FAQ_KEYS.filter((f) => f.re.test(text)).map((f) => f.id);
}

function groupBursts(messages) {
  const bursts = [];
  for (const m of messages) {
    const last = bursts[bursts.length - 1];
    if (
      last &&
      last.direction === m.direction &&
      m.ts - last.tsEnd <= BURST_MS
    ) {
      last.messages.push(m);
      last.tsEnd = m.ts;
      last.text = `${last.text}\n${m.text}`.trim();
      last.types.add(m.type);
    } else {
      bursts.push({
        direction: m.direction,
        origin: m.origin,
        tsStart: m.ts,
        tsEnd: m.ts,
        text: m.text,
        types: new Set([m.type]),
        messages: [m],
      });
    }
  }
  return bursts;
}

function classifyConversation(conv, normalized, now) {
  const flags = [];
  const inbound = normalized.filter((m) => m.direction === "inbound");
  const outbound = normalized.filter((m) => m.direction === "outbound");
  const inboundText = inbound.map((m) => m.text).join("\n");
  const outboundText = outbound.map((m) => m.text).join("\n");
  const last = normalized[normalized.length - 1] || null;
  const lastIn = inbound[inbound.length - 1] || null;
  const lastOut = outbound[outbound.length - 1] || null;
  const bursts = groupBursts(normalized);
  const lastBurst = bursts[bursts.length - 1] || null;

  const adsOnly =
    inbound.length > 0 &&
    inbound.every((m) => ADS_PREFILL.test(m.text.trim())) &&
    !PRODUCT_SIGNAL.test(inboundText.replace(ADS_PREFILL, ""));
  const hasCommercial = COMMERCIAL_INTENT.test(inboundText) || inbound.some((m) =>
    ["image", "audio", "document"].includes(m.type)
  );
  const botOut = outbound.filter((m) => m.origin !== "business_app");
  const humanOut = outbound.filter((m) => m.origin === "business_app");

  if (adsOnly && botOut.length === 0) {
    return {
      bucket: "silencio_correcto_ads",
      severity: "ok",
      flags: ["ads_prefill_ignore"],
      summary: "Prefill Meta Ads sin habla real; el silencio es correcto.",
    };
  }

  if (!hasCommercial && inbound.length <= 2 && botOut.length === 0) {
    const txt = inboundText.toLowerCase();
    if (/^(hola|buenas|buenos d[ií]as|ok|gracias)?[\s.!?]*$/i.test(txt.trim()) || !txt.trim()) {
      return {
        bucket: last && last.direction === "inbound" && now - last.ts > UNANSWERED_GRACE_MS
          ? "sin_responder_saludo"
          : "exploratorio",
        severity: last && last.direction === "inbound" && now - last.ts > UNANSWERED_GRACE_MS
          ? "warn"
          : "info",
        flags: ["poco_contenido"],
        summary: "Saludo o hilo corto sin señal comercial clara.",
      };
    }
  }

  if (BAD_CONSULT.test(outboundText) && faqsIn(inboundText).length) {
    flags.push("escape_consultar_faq");
  }
  if (BAD_TOOL_NARRATE.test(outboundText)) flags.push("narra_tools");
  if (BAD_MARKDOWN.test(outboundText)) flags.push("markdown_asteriscos");
  if (BAD_CTA.test(outboundText)) flags.push("cta_insistente");
  if (BAD_BRAND_HELLO.test(outboundText)) flags.push("saludo_marca");
  if (
    /dumonti|hidrotec/i.test(outboundText) &&
    !/dumonti|hidrotec|falcao|mejor calidad/i.test(inboundText)
  ) {
    flags.push("upsell_tela");
  }
  if (PRICE_GIVEN.test(outboundText) && !PRICE_ASK.test(inboundText) && !ACCEPT.test(inboundText)) {
    flags.push("precio_no_pedido");
  }
  if (UNSUPPORTED_SPORT.test(inboundText) && PRICE_GIVEN.test(outboundText)) {
    flags.push("cotizo_deporte_fuera_de_linea");
  }
  if (
    /\bcamiseta/i.test(inboundText) &&
    !/\buniforme|\bkit|\bconjunto/i.test(inboundText) &&
    /uniforme completo/i.test(outboundText) &&
    !/camiseta sola/i.test(outboundText)
  ) {
    flags.push("confundio_camiseta_vs_uniforme");
  }

  const askedFaqs = faqsIn(inboundText);
  const answeredFaqs = faqsIn(outboundText);
  const missedFaqs = askedFaqs.filter((id) => !answeredFaqs.includes(id));
  if (askedFaqs.length >= 2 && missedFaqs.length) {
    flags.push(`faq_parcial:${missedFaqs.join(",")}`);
  } else if (askedFaqs.length === 1 && missedFaqs.length === 1 && botOut.length) {
    flags.push(`faq_sin_responder:${missedFaqs[0]}`);
  }

  if (ACCEPT.test(inboundText) && /310\s*336|321\s*398/.test(outboundText) && !/hoy|mañana|abono del 50/i.test(outboundText)) {
    flags.push("cierre_solo_telefonos_sin_notify_copy");
  }

  const unanswered =
    lastBurst &&
    lastBurst.direction === "inbound" &&
    hasCommercial &&
    now - lastBurst.tsEnd > UNANSWERED_GRACE_MS;

  if (unanswered) {
    flags.push("ultimo_inbound_sin_outbound");
    const afterHandoff = conv.status === "handoff" || humanOut.length > 0;
    return {
      bucket: afterHandoff ? "sin_responder_post_handoff" : "sin_responder",
      severity: "bad",
      flags,
      summary: afterHandoff
        ? "El cliente escribió y nadie (bot ni humano) contestó tras handoff."
        : "El cliente dejó un mensaje comercial y Kapso no contestó.",
    };
  }

  if (lastBurst && lastBurst.direction === "outbound") {
    const waitingOnCustomer = /[¿?]|cuánt|deporte|cantidad|talla|color/i.test(lastBurst.text);
    if (flags.length) {
      return {
        bucket: "respondio_mal",
        severity: "bad",
        flags,
        summary: `Respondió, pero rompe reglas v10: ${flags.join(", ")}.`,
      };
    }
    if (botOut.length && hasCommercial) {
      return {
        bucket: waitingOnCustomer ? "bien_espera_cliente" : "bien",
        severity: "ok",
        flags: waitingOnCustomer ? ["espera_cliente"] : ["flujo_ok"],
        summary: waitingOnCustomer
          ? "Kapso contestó bien y espera al cliente."
          : "Kapso contestó alineado al playbook (sin flags v10).",
      };
    }
    if (humanOut.length && !botOut.length) {
      return {
        bucket: "humano_only",
        severity: "info",
        flags: ["compose_humano"],
        summary: "Solo hay outbound humano (WhatsApp Business App).",
      };
    }
  }

  if (flags.length) {
    return {
      bucket: "respondio_mal",
      severity: "bad",
      flags,
      summary: `Hilo con violaciones v10: ${flags.join(", ")}.`,
    };
  }

  if (hasCommercial && botOut.length) {
    return {
      bucket: "bien",
      severity: "ok",
      flags: ["flujo_ok"],
      summary: "Hilo comercial con respuesta del bot y sin flags duros.",
    };
  }

  return {
    bucket: "exploratorio",
    severity: "info",
    flags: flags.length ? flags : ["sin_cierre"],
    summary: "Hilo corto o sin señal suficiente para juzgar calidad.",
  };
}

function normalizeMessages(raw) {
  return unwrapList(raw)
    .map((m) => ({
      id: m.id || m.wamid || "",
      direction: msgDirection(m),
      origin: msgOrigin(m),
      type: msgType(m),
      status: m.status || m.kapso?.status || "",
      ts: msgTime(m),
      text: msgContent(m),
    }))
    .filter((m) => m.ts)
    .sort((a, b) => a.ts - b.ts);
}

function lastSnippets(normalized, n = 6) {
  return normalized.slice(-n).map((m) => ({
    at: m.ts ? new Date(m.ts).toISOString() : null,
    dir: m.direction === "inbound" ? "CLIENTE" : m.origin === "business_app" ? "HUMANO" : "KAPSO",
    type: m.type,
    text: anonymize(m.text).slice(0, 280),
  }));
}

async function listConversations(phoneId, pages) {
  const out = [];
  for (let page = 1; page <= pages; page += 1) {
    const json = await kapso(
      `/platform/v1/whatsapp/conversations?phone_number_id=${encodeURIComponent(phoneId)}&per_page=50&page=${page}`
    );
    const rows = unwrapList(json);
    out.push(...rows);
    if (rows.length < 50) break;
    await sleep(80);
  }
  return out;
}

async function listMessages(conversationId, pages = 3) {
  const out = [];
  for (let page = 1; page <= pages; page += 1) {
    const json = await kapso(
      `/platform/v1/whatsapp/messages?conversation_id=${encodeURIComponent(conversationId)}&per_page=50&page=${page}`
    );
    const rows = unwrapList(json);
    out.push(...rows);
    if (rows.length < 50) break;
    await sleep(40);
  }
  return out;
}

async function listExecutions(status, perPage = 30) {
  try {
    const json = await kapso(
      `/platform/v1/workflows/${WF_ID}/executions?status=${encodeURIComponent(status)}&per_page=${perPage}`
    );
    return unwrapList(json);
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function health(period) {
  const result = { period, phone_numbers: [], api: {}, webhooks: {}, failed_messages: [] };
  try {
    const phones = await kapso(`/platform/v1/whatsapp/phone_numbers?per_page=20`);
    result.phone_numbers = unwrapList(phones).map((p) => ({
      id: p.id,
      name: p.name || p.display_name,
      display: p.display_phone_number || p.phone_number,
      status: p.status,
    }));
  } catch (e) {
    result.phone_numbers_error = String(e.message || e);
  }
  try {
    const apiTotals = await kapso(`/platform/v1/api_logs?period=${period}&per_page=1`);
    const apiErrors = await kapso(
      `/platform/v1/api_logs?period=${period}&errors_only=true&per_page=10`
    );
    result.api = {
      total: extractCount(apiTotals),
      failed: extractCount(apiErrors),
      sample_errors: unwrapList(apiErrors).slice(0, 5).map((x) => ({
        id: x.id,
        status: x.status || x.http_status,
        path: x.path || x.request_path,
        at: x.created_at,
      })),
    };
  } catch (e) {
    result.api = { error: String(e.message || e) };
  }
  try {
    const whTotals = await kapso(`/platform/v1/webhook_deliveries?period=${period}&per_page=1`);
    const whErrors = await kapso(
      `/platform/v1/webhook_deliveries?period=${period}&errors_only=true&per_page=10`
    );
    result.webhooks = {
      total: extractCount(whTotals),
      failed: extractCount(whErrors),
    };
  } catch (e) {
    result.webhooks = { error: String(e.message || e) };
  }
  try {
    const failed = await kapso(
      `/platform/v1/whatsapp/messages?status=failed&direction=outbound&per_page=20`
    );
    result.failed_messages = unwrapList(failed).slice(0, 15).map((m) => ({
      id: m.id,
      at: m.created_at,
      conversation_id: m.conversation_id || m.kapso?.conversation_id,
      error: m.error || m.kapso?.error || m.status,
    }));
  } catch (e) {
    result.failed_messages_error = String(e.message || e);
  }
  return result;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push(`# Auditoría de respuestas Kapso Life Deportes`);
  lines.push("");
  lines.push(`Generado: **${report.generated_at}** · ventana **${report.hours}h** · chats escaneados **${report.scanned}** (cliente **${report.customer_count}**, staff omitidos **${report.staff_skipped}**).`);
  lines.push("");
  lines.push(`Workflow: \`lifedeportes_sales_inbound\` (\`${WF_ID}\`). Rubro según prompt vendedor v10.`);
  lines.push("");
  lines.push("## Resumen");
  lines.push("");
  lines.push("| Bucket | Cantidad | Qué significa |");
  lines.push("|--------|----------|---------------|");
  const labels = {
    bien: "Contestó alineado al playbook",
    bien_espera_cliente: "Contestó bien y espera al cliente",
    respondio_mal: "Contestó, pero rompe reglas v10",
    sin_responder: "Último mensaje del cliente sin respuesta del bot",
    sin_responder_post_handoff: "Cliente escribió tras handoff y nadie contestó",
    sin_responder_saludo: "Saludo sin respuesta (posible hueco)",
    silencio_correcto_ads: "Prefill Ads; silencio correcto",
    exploratorio: "Poco contenido para juzgar",
    humano_only: "Solo outbound humano",
  };
  for (const [bucket, count] of Object.entries(report.counts)) {
    lines.push(`| \`${bucket}\` | ${count} | ${labels[bucket] || ""} |`);
  }
  lines.push("");
  lines.push("## Salud de canal");
  lines.push("");
  lines.push(`- API calls (${report.health.period}): ${report.health.api?.total ?? "?"} total, **${report.health.api?.failed ?? "?"}** con error`);
  lines.push(`- Webhooks: ${report.health.webhooks?.total ?? "?"} total, **${report.health.webhooks?.failed ?? "?"}** fallidos`);
  lines.push(`- Outbound failed: **${(report.health.failed_messages || []).length}** en la muestra`);
  const exec = report.executions || {};
  lines.push(`- Executions waiting: ${Array.isArray(exec.waiting) ? exec.waiting.length : exec.waiting?.error || "?"}`);
  lines.push(`- Executions handoff: ${Array.isArray(exec.handoff) ? exec.handoff.length : exec.handoff?.error || "?"}`);
  lines.push(`- Executions failed: ${Array.isArray(exec.failed) ? exec.failed.length : exec.failed?.error || "?"}`);
  lines.push("");

  const section = (title, bucket, empty) => {
    const rows = report.conversations.filter((c) => c.bucket === bucket);
    lines.push(`## ${title} (${rows.length})`);
    lines.push("");
    if (!rows.length) {
      lines.push(empty);
      lines.push("");
      return;
    }
    for (const c of rows) {
      lines.push(`### ${c.who} (${c.phone_tag}) · ${c.status || "?"} · ${c.last_active || ""}`);
      lines.push("");
      lines.push(`${c.summary}`);
      if (c.flags?.length) lines.push(`Flags: \`${c.flags.join("`, `")}\``);
      lines.push("");
      for (const s of c.snippets || []) {
        lines.push(`- **${s.dir}** (${s.at || "?"}): ${s.text || `(${s.type})`}`);
      }
      lines.push("");
    }
  };

  section("Sin responder (prioridad)", "sin_responder", "_Ningún chat comercial quedó colgado en esta ventana._");
  section("Sin responder tras handoff", "sin_responder_post_handoff", "_No hay inbound huérfano post-handoff._");
  section("Respondió mal", "respondio_mal", "_Ninguna violación v10 detectada por heurística._");
  section("Hizo bien", "bien", "_Ningún hilo calificó como flujo OK._");
  section("Bien, espera al cliente", "bien_espera_cliente", "_Nadie en espera de respuesta del cliente._");
  section("Silencio correcto (Ads)", "silencio_correcto_ads", "_Sin prefill Ads en la ventana._");
  section("Saludo sin respuesta", "sin_responder_saludo", "_Sin saludos colgados._");

  lines.push("## Cómo leer esta auditoría");
  lines.push("");
  lines.push("Heurística automática sobre el hilo WhatsApp (no lee el razonamiento interno del LLM). Un flag no equivale a pérdida de venta; sirve para priorizar revisión humana. Silencio en prefill Ads es **correcto**. PII reducida a nombre de pila + últimos 4 dígitos + texto anonimizado.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  loadEnv();
  if (!process.env.KAPSO_API_KEY) {
    console.error("Falta KAPSO_API_KEY. Añádela al entorno (.env o Secrets del Cloud Agent).");
    process.exit(2);
  }
  const hours = Number(argValue("--hours", "168"));
  const pages = Number(argValue("--pages", "8"));
  const phoneId = process.env.KAPSO_PHONE_NUMBER_ID || PHONE_ID_DEFAULT;
  const since = Date.now() - hours * 3600 * 1000;
  const now = Date.now();
  const period = hours <= 24 ? "24h" : hours <= 168 ? "7d" : "30d";

  const healthInfo = await health(period);
  const executions = {
    waiting: await listExecutions("waiting"),
    handoff: await listExecutions("handoff"),
    failed: await listExecutions("failed"),
  };

  const convs = await listConversations(phoneId, pages);
  let staffSkipped = 0;
  const customers = [];
  for (const c of convs) {
    const t = new Date(c.last_active_at || c.updated_at || c.last_message_at || 0).getTime();
    if (t && t < since) continue;
    if (isStaffPhone(c.phone_number || c.phone || c.wa_id)) {
      staffSkipped += 1;
      continue;
    }
    customers.push(c);
  }

  const classified = [];
  const counts = {};
  for (const c of customers) {
    let rawMsgs = [];
    try {
      rawMsgs = await listMessages(c.id, 3);
    } catch (e) {
      classified.push({
        conversation_id: c.id,
        who: displayName(c.contact_name || c.name),
        phone_tag: phoneTag(c.phone_number || c.phone),
        status: c.status,
        bucket: "exploratorio",
        severity: "warn",
        flags: ["error_fetch_messages"],
        summary: `No pude leer mensajes: ${String(e.message || e).slice(0, 160)}`,
        snippets: [],
      });
      counts.exploratorio = (counts.exploratorio || 0) + 1;
      continue;
    }
    const normalized = normalizeMessages(rawMsgs).filter((m) => m.ts >= since - 24 * 3600 * 1000);
    const verdict = classifyConversation(c, normalized, now);
    counts[verdict.bucket] = (counts[verdict.bucket] || 0) + 1;
    classified.push({
      conversation_id: c.id,
      who: displayName(c.contact_name || c.name),
      phone_tag: phoneTag(c.phone_number || c.phone),
      status: c.status,
      last_active: c.last_active_at || c.updated_at || null,
      inbound: normalized.filter((m) => m.direction === "inbound").length,
      outbound: normalized.filter((m) => m.direction === "outbound").length,
      ...verdict,
      snippets: lastSnippets(normalized),
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    hours,
    pages,
    phone_number_id: phoneId,
    workflow_id: WF_ID,
    scanned: convs.length,
    customer_count: customers.length,
    staff_skipped: staffSkipped,
    counts,
    health: healthInfo,
    executions: {
      waiting: Array.isArray(executions.waiting)
        ? executions.waiting.slice(0, 15).map((e) => ({
            id: e.id,
            status: e.status,
            step: e.current_step?.identifier || e.current_step,
            conversation_id: e.whatsapp_conversation_id,
            started_at: e.started_at,
          }))
        : executions.waiting,
      handoff: Array.isArray(executions.handoff)
        ? executions.handoff.slice(0, 15).map((e) => ({
            id: e.id,
            status: e.status,
            conversation_id: e.whatsapp_conversation_id,
            started_at: e.started_at,
          }))
        : executions.handoff,
      failed: Array.isArray(executions.failed)
        ? executions.failed.slice(0, 15).map((e) => ({
            id: e.id,
            status: e.status,
            error: e.error || e.last_error,
            conversation_id: e.whatsapp_conversation_id,
            started_at: e.started_at,
          }))
        : executions.failed,
    },
    conversations: classified.sort((a, b) => {
      const order = { bad: 0, warn: 1, info: 2, ok: 3 };
      return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
    }),
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const scratchDir = path.join(ROOT, "scratch");
  fs.mkdirSync(scratchDir, { recursive: true });
  const jsonPath = path.join(scratchDir, `kapso_response_audit_${stamp}.json`);
  const md = renderMarkdown(report);
  const mdPath = path.join(scratchDir, `kapso_response_audit_${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, md);

  const artifactDir = "/opt/cursor/artifacts";
  try {
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, `kapso_response_audit_${stamp}.md`), md);
    fs.writeFileSync(path.join(artifactDir, `kapso_response_audit_${stamp}.json`), JSON.stringify(report, null, 2));
  } catch {
    /* artifacts optional in entornos sin /opt/cursor */
  }

  console.log(JSON.stringify({
    ok: true,
    json: jsonPath,
    md: mdPath,
    counts,
    customer_count: customers.length,
    staff_skipped: staffSkipped,
    health: {
      api_failed: healthInfo.api?.failed,
      webhook_failed: healthInfo.webhooks?.failed,
      outbound_failed: (healthInfo.failed_messages || []).length,
    },
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
