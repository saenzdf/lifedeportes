// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: buscar-conversacion-kapso  id: 3ecc9e06-cf5b-4037-9840-68138bb1e853
// ultimo deploy: 2026-08-14T14:29:22-04:00  status: deployed
// motivo: tool del agente staff, sin cablear y sin uso
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

/**
 * buscar-conversacion-kapso — staff "sube oportunidad o pedido de {cliente}".
 *
 * Lee la conversación Kapso de OTRO cliente (por nombre) y la carga en vars:
 *   vars.quote.{product_text, quantity, unit_cop, total_cop, notes, media_refs, ...}
 *   vars.order_draft.attachments[]  (media URLs de la conversación)
 *   vars.kapso.conversation_id
 *   vars.lead.{customer_display_name, phone}
 *
 * NO crea Odoo directamente: devuelve el quote + adjuntos para que el agente
 * staff use sus tools existentes (crear-presupuesto-odoo, parsers,
 * registrar-adjuntos-pedido, fusionar-borrador-lista) y suba la oportunidad+SO.
 * Así se reutiliza la lógica Odoo probada sin duplicarla.
 *
 * Secrets: KAPSO_API_KEY, KAPSO_API_BASE_URL (opt, default api.kapso.ai)
 */

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeKey(name) {
  return compact(name)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function kapsoGet(env, apiPath, params = {}) {
  const base = String(env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const apiKey = compact(env.KAPSO_API_KEY);
  if (!apiKey) throw new Error("missing_kapso_api_key");
  const url = new URL(`${base}${apiPath}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-API-Key": apiKey },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detail = String(json?.error?.message || json?.error || resp.statusText || `kapso_${resp.status}`).slice(0, 240);
    throw new Error(`${apiPath} → HTTP ${resp.status}: ${detail}`);
  }
  return json;
}

function extractFromThread(body) {
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const msgs = body?.whatsapp_context?.messages || [];
  const texts = [];
  for (const m of [...msgs].reverse().slice(0, 10)) {
    const t = (typeof m?.text === "string" && m.text) || m?.text?.body || m?.kapso?.content || "";
    if (t) texts.push(String(t));
  }
  const blob = [input.query, input.name, input.customer_name, vars?.staff?.last_inbound_text, ...texts]
    .filter(Boolean)
    .join("\n");
  // "sube oportunidad o pedido de Yesenya Mojica" / "de yesenya"
  const nameMatch =
    input.customer_name ||
    input.name ||
    blob.match(
      /(?:sube|subir|crea|crear|sube la|crea la|oportunidad(?: o pedido)?|pedido)\s+(?:oportunidad|pedido)?\s*(?:de|del|para)?\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s.&_-]{1,48})/i
    )?.[1] ||
    "";
  return {
    name: compact(input.customer_name || input.name || (nameMatch || "")),
    query: compact(input.query || ""),
    include_media: input.include_media !== false,
  };
}

/** Heurístico mínimo para poblar quote desde los textos del hilo. */
function buildQuoteFromTexts(texts, customerName) {
  const blob = texts.filter(Boolean).join("\n");
  const q = {
    product_text: "",
    quantity: null,
    unit_cop: null,
    total_cop: null,
    notes: "",
    status: "interes_confirmado",
  };

  // cantidad: "10 camisetas", "8 uniformes", "para 12", "20"
  const qtyMatch =
    blob.match(/\b(\d{1,3})\s*(camisetas|camisetas deportivas|uniformes|uniformes de|conjuntos|juegos)\b/i) ||
    blob.match(/\b(\d{1,3})\s*(?:camisetas?|uniformes?|conjuntos?)\b/i);
  if (qtyMatch) q.quantity = Number(qtyMatch[1]);

  // producto/deporte
  const sport =
    (blob.match(/\b(f[úu]tbol|baloncesto|v[óo]le[yi]|v[óo]libol|atletismo|b[ée]isbol|m[ée]dias)\b/i) || [])[1] || "";
  const garment =
    (blob.match(/\b(uniforme|uniforme completo|camiseta|camiseta deportiva|pantaloneta|sudadera|polo|rompevientos|peto|chaqueta)\b/i) || [])[1] || "";
  if (garment) {
    q.product_text = sport ? `${garment} de ${sport}` : garment;
  } else if (sport) {
    q.product_text = `uniforme de ${sport}`;
  }

  // precio total/unitario: $1.650.000 / $50.000
  const money =
    blob.match(/\$\s*([\d.]+(?:\.[\d]{3})*(?:,\d+)?)/g) || [];
  if (money.length) {
    const last = money[money.length - 1].replace(/[$\s]/g, "").replace(/\./g, "").replace(",", ".");
    const num = Number(last);
    if (Number.isFinite(num) && num > 0) {
      if (q.quantity && q.quantity >= 6) q.unit_cop = num;
      else q.total_cop = num;
    }
  }

  // notes: últimas 1-2 frases útiles (abono, llegada, tallas)
  const lastLines = texts
    .filter((t) => t && t.length < 160)
    .slice(-2)
    .join(" · ");
  if (lastLines) q.notes = lastLines.slice(0, 400);
  q.customer_display_name = compact(customerName || "");
  return q;
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  if (vars?.user?.role && vars.user.role !== "staff") {
    return jsonResponse({ ok: false, error: "staff_only" }, 403);
  }

  const target = extractFromThread(body);
  if (!target.name && !target.query) {
    return jsonResponse({
      ok: false,
      status: "need_name",
      message: "Indica el nombre del cliente (ej. 'sube oportunidad de Yesenya Mojica').",
    });
  }

  try {
    // 1. Listar conversaciones y filtrar por nombre client-side (la API no filtra por contact_name).
    const phoneNumberId = compact(
      env.KAPSO_PHONE_NUMBER_ID || env.LIFE_WHATSAPP_PHONE_NUMBER_ID || "1095603153637786"
    );
    const convsPayload = await kapsoGet(env, "/platform/v1/whatsapp/conversations", {
      phone_number_id: phoneNumberId,
      per_page: 200,
    });
    const convs = Array.isArray(convsPayload.data)
      ? convsPayload.data
      : Array.isArray(convsPayload.whatsapp_conversations)
        ? convsPayload.whatsapp_conversations
        : [];
    if (!convs.length) throw new Error("no_conversations");

    const key = normalizeKey(target.name || target.query);
    const hits = convs.filter((c) => {
      const cn = normalizeKey(c.contact_name || c.username || "");
      return cn && (cn.includes(key) || key.includes(cn) || key === cn);
    });
    if (!hits.length) {
      return jsonResponse({
        ok: false,
        status: "conversation_not_found",
        message: `No encontré conversación Kapso para '${target.name || target.query}'.`,
        candidates: convs.slice(0, 5).map((c) => c.contact_name || c.username),
      });
    }
    const conv = hits[0];
    const conversationId = compact(conv.id);
    const customerName =
      compact(conv.contact_name || conv.username) || compact(target.name || target.query);
    const phone = digits(conv.phone_number || conv.phone || "");

    // 2. Mensajes de la conversación.
    const msgsPayload = await kapsoGet(env, "/platform/v1/whatsapp/messages", {
      conversation_id: conversationId,
      per_page: 40,
    });
    const msgs = Array.isArray(msgsPayload.data) ? msgsPayload.data : [];
    const texts = [];
    const mediaRefs = [];
    for (const m of msgs) {
      const direction = compact(m?.kapso?.direction || m?.direction || "inbound");
      const txt =
        (typeof m?.text === "string" && m.text) || m?.text?.body || m?.kapso?.content || "";
      if (txt) texts.push(String(txt));
      const mediaUrl =
        m?.media_url ||
        m?.media?.url ||
        m?.document?.url ||
        m?.image?.url ||
        m?.kapso?.media_url ||
        "";
      if (target.include_media && mediaUrl && String(mediaUrl).startsWith("http")) {
        mediaRefs.push({
          url: mediaUrl,
          filename: compact(m?.media?.filename || m?.document?.filename || m?.image?.filename || ""),
          mime_type: compact(m?.media?.mime_type || m?.mimetype || m?.document?.mime_type || ""),
          direction,
        });
      }
    }

    const quote = buildQuoteFromTexts(texts, customerName);

    const summaryBits = [];
    if (quote.product_text) summaryBits.push(quote.product_text);
    if (quote.quantity) summaryBits.push(`${quote.quantity} u`);
    if (quote.unit_cop) summaryBits.push(`$${quote.unit_cop} c/u`);
    if (quote.total_cop) summaryBits.push(`$${quote.total_cop} total`);
    summaryBits.push(`${msgs.length} mensajes · ${mediaRefs.length} adjuntos`);

    const order_draft = {
      customer_display_name: customerName,
      quote,
      attachments: mediaRefs,
      conversation_id: conversationId,
    };

    return jsonResponse({
      ok: true,
      status: "ready",
      conversation_id: conversationId,
      customer_name: customerName,
      phone: phone || null,
      quote,
      attachments: mediaRefs,
      message_count: msgs.length,
      summary: summaryBits.join(" · "),
      message:
        `Conversación de ${customerName} cargada (${summaryBits.join(" · ")}). ` +
        `Ahora sube la oportunidad y el pedido a Odoo con los adjuntos y parsea la lista si hay archivo.`,
      vars: {
        quote,
        order_draft,
        kapso: { conversation_id: conversationId },
        lead: { customer_display_name: customerName, phone: phone || null },
        service: {
          last_call_name: "buscar_conversacion_kapso",
          last_call_status: "ready",
          last_call_at: now,
          fallback_message: null,
        },
      },
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: String(err?.message || err).slice(0, 240),
      status: "kapso_error",
      vars: {
        service: {
          last_call_name: "buscar_conversacion_kapso",
          last_call_status: "error",
          last_call_at: now,
          fallback_message: "No pude leer la conversación de Kapso.",
        },
      },
    });
  }
}

export { handler };
