/**
 * Retoma quote/contexto comercial entre conversaciones Kapso.
 * Cuando WhatsApp Business cierra el hilo (ended) y abre uno nuevo,
 * la ejecución anterior muere; este helper busca por teléfono la última
 * ejecución con quote útil y la reinyecta.
 */

import {
  normalizeQuote,
  quoteLooksUseful,
  quoteRichnessScore,
  continuityResumeHint,
} from "./life_quote_dossier.js";

function kapsoConfig(env = {}) {
  const base = String(env.KAPSO_API_BASE_URL || "").replace(/\/$/, "");
  const key = String(env.KAPSO_API_KEY || "").trim();
  const workflowId = String(
    env.KAPSO_WORKFLOW_ID || "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6"
  ).trim();
  if (!base || !key) return null;
  return { base, key, workflowId };
}

async function kapsoGet(cfg, path, query = {}) {
  const url = new URL(`${cfg.base}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-Key": cfg.key,
    },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`kapso_${resp.status}:${json?.error || resp.statusText}`);
  }
  return json?.data ?? json;
}

function unwrapList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.conversations)) return payload.conversations;
  if (Array.isArray(payload?.whatsapp_conversations)) {
    return payload.whatsapp_conversations;
  }
  if (Array.isArray(payload?.executions)) return payload.executions;
  return [];
}

/** Digits-only compare; require local-10 overlap so we never hydrate another WA. */
export function conversationMatchesPhone(conversation, phoneDigits) {
  const want = String(phoneDigits || "").replace(/\D/g, "");
  if (!want) return false;
  const got = String(
    conversation?.phone_number ||
      conversation?.phone ||
      conversation?.wa_id ||
      ""
  ).replace(/\D/g, "");
  if (!got) return false;
  if (got === want) return true;
  const wantLocal = want.length >= 10 ? want.slice(-10) : want;
  const gotLocal = got.length >= 10 ? got.slice(-10) : got;
  return wantLocal.length >= 10 && wantLocal === gotLocal;
}

/**
 * @returns {Promise<null|{
 *   quote: object,
 *   funnel: object|null,
 *   order_focus: object|null,
 *   source: { conversation_id: string, execution_id: string, status: string }
 * }>}
 */
export async function hydrateCustomerSessionFromKapso(env, phone, options = {}) {
  const cfg = kapsoConfig(env);
  if (!cfg) {
    return {
      ok: false,
      error: "missing_kapso_secrets",
      quote: null,
      funnel: null,
      order_focus: null,
      source: null,
    };
  }

  const phoneDigits = String(phone ?? "").replace(/\D/g, "");
  if (!phoneDigits) {
    return {
      ok: false,
      error: "missing_phone",
      quote: null,
      funnel: null,
      order_focus: null,
      source: null,
    };
  }

  const currentConversationId = String(options.currentConversationId || "").trim();
  const currentExecutionId = String(options.currentExecutionId || "").trim();

  try {
    // Kapso list often ignores/weakly applies `phone`; always filter client-side
    // (cross-customer quote bleed: Rinfor←Isbe←Así Es La Vida, 2026-07-18).
    const conversationsPayload = await kapsoGet(cfg, "/platform/v1/whatsapp/conversations", {
      phone_number: phoneDigits,
      phone: phoneDigits,
      q: phoneDigits,
      per_page: 50,
    });
    const conversationsRaw = unwrapList(conversationsPayload);
    const conversations = conversationsRaw.filter((c) =>
      conversationMatchesPhone(c, phoneDigits)
    );
    if (!conversations.length) {
      return {
        ok: false,
        error: conversationsRaw.length ? "no_conversations_for_phone" : "no_conversations",
        quote: null,
        funnel: null,
        order_focus: null,
        source: null,
      };
    }

    // Preferir hilos ended recientes, luego otros activos distintos al actual.
    const ordered = [...conversations].sort((a, b) => {
      const ta = Date.parse(a.last_active_at || a.updated_at || a.created_at || 0);
      const tb = Date.parse(b.last_active_at || b.updated_at || b.created_at || 0);
      return tb - ta;
    });

    let best = null;

    for (const conversation of ordered) {
      const conversationId = String(conversation.id || "");
      if (!conversationId) continue;

      const executionsPayload = await kapsoGet(
        cfg,
        `/platform/v1/workflows/${cfg.workflowId}/executions`,
        {
          whatsapp_conversation_id: conversationId,
          per_page: 5,
        }
      );
      // Platform a veces anida { executions: [...] } dentro de data.
      const executions = unwrapList(
        executionsPayload?.executions ? executionsPayload : executionsPayload
      );

      for (const execution of executions) {
        const executionId = String(execution.id || "");
        if (!executionId || executionId === currentExecutionId) continue;

        const detailPayload = await kapsoGet(
          cfg,
          `/platform/v1/workflow_executions/${executionId}`
        );
        const detail = detailPayload?.execution || detailPayload;
        const priorVars =
          detail?.execution_context?.vars ||
          detailPayload?.execution_context?.vars ||
          {};
        const rawQuote = priorVars.quote || null;
        if (!quoteLooksUseful(rawQuote)) continue;

        const quote = normalizeQuote({
          ...rawQuote,
          customer_display_name_explicit: Boolean(
            priorVars.quote?.customer_display_name_explicit
          ),
        });
        const candidate = {
          ok: true,
          error: null,
          quote,
          resume_hint: continuityResumeHint(quote),
          funnel: priorVars.funnel || null,
          order_focus: {
            id: priorVars.orders?.focus_order_id || priorVars.order?.id || null,
            name: priorVars.orders?.focus_order_name || priorVars.order?.name || null,
          },
          source: {
            conversation_id: conversationId,
            execution_id: executionId,
            status: detail?.status || execution.status || null,
            same_conversation: conversationId === currentConversationId,
          },
          _score: quoteRichnessScore(quote),
        };
        if (!best || candidate._score > best._score) best = candidate;
      }
    }

    if (best) {
      const { _score, ...rest } = best;
      return rest;
    }
  } catch (err) {
    return {
      ok: false,
      error: String(err?.message || err || "hydrate_failed").slice(0, 240),
      quote: null,
      funnel: null,
      order_focus: null,
      source: null,
    };
  }

  return {
    ok: false,
    error: "no_useful_quote",
    quote: null,
    funnel: null,
    order_focus: null,
    source: null,
  };
}

export function mapActiveOrders(activeOrders = [], projectTasks = []) {
  const taskByOrderId = new Map();
  for (const task of projectTasks || []) {
    const soId = Array.isArray(task.sale_order_id)
      ? task.sale_order_id[0]
      : task.sale_order_id;
    if (!soId || taskByOrderId.has(soId)) continue;
    taskByOrderId.set(soId, {
      task_id: task.id,
      task_name: task.name || null,
      stage: Array.isArray(task.stage_id) ? task.stage_id[1] : null,
    });
  }

  return (activeOrders || []).map((order) => {
    const linked = taskByOrderId.get(order.id) || {};
    return {
      id: order.id,
      name: order.name,
      state: order.state,
      task_id: linked.task_id || null,
      task_stage: linked.stage || null,
    };
  });
}

/**
 * Normaliza y resume mensajes recientes de WhatsApp para dar continuidad
 * y visibilidad de las intervenciones del staff al agente orquestador.
 */
export function parseRecentMessages(rawMessages = [], options = {}) {
  const currentMessageId = options.currentMessageId ? String(options.currentMessageId) : null;
  const list = unwrapList(rawMessages);

  const parsed = [];
  for (const m of list) {
    const id = String(m?.id || m?.wamid || "");
    if (currentMessageId && id === currentMessageId) continue;

    const d = String(m?.kapso?.direction || m?.direction || "").toLowerCase();
    const dir = d === "inbound" || d === "in" ? "inbound" : d === "outbound" || d === "out" ? "outbound" : "unknown";
    const origin = String(m?.kapso?.origin || m?.origin || "").toLowerCase();

    const k = m?.kapso || {};
    const t = m?.text || {};
    const textParts = [
      k.content,
      k.transcription,
      k.caption,
      typeof t === "string" ? t : t?.body,
      m?.caption,
      m?.image?.caption,
      m?.document?.filename,
      m?.document?.caption,
    ].map((x) => String(x || "").trim()).filter(Boolean);

    let text = textParts.join(" ").slice(0, 500);
    if (!text) {
      const type = String(m?.type || m?.message_type || m?.kapso?.type || "text").toLowerCase();
      if (type === "image") text = "[imagen]";
      else if (type === "audio") text = "[audio]";
      else if (type === "video") text = "[video]";
      else if (type === "document") text = "[documento]";
      else if (type === "sticker") text = "[sticker]";
      else text = "";
    }
    if (!text) continue;

    let speaker = "BOT";
    if (dir === "inbound") {
      speaker = "CLIENTE";
    } else {
      if (origin === "business_app" || origin === "user" || origin === "staff" || origin === "human") {
        speaker = "STAFF";
      } else {
        speaker = "BOT";
      }
    }

    const ts = Date.parse(m?.created_at || m?.timestamp || m?.inserted_at || 0) || 0;
    parsed.push({ id, dir, origin, speaker, text, ts });
  }

  parsed.sort((a, b) => a.ts - b.ts);

  const staffMessages = parsed.filter((m) => m.speaker === "STAFF");
  const lastStaff = staffMessages.length ? staffMessages[staffMessages.length - 1].text : null;
  const staffParticipated = staffMessages.length > 0;

  const summarySlice = parsed.slice(-6);
  const summaryLines = summarySlice.map((m) => `[${m.speaker}]: ${m.text.replace(/\s+/g, " ").trim()}`);
  const recentThreadSummary = summaryLines.join("\n");

  return {
    messages: parsed,
    has_prior_conversation: parsed.length > 0,
    staff_participated: staffParticipated,
    last_staff_message: lastStaff,
    recent_thread_summary: recentThreadSummary || null,
  };
}

export async function fetchRecentThreadContext(cfg, conversationId, options = {}) {
  if (!cfg || !conversationId) {
    return {
      has_prior_conversation: false,
      staff_participated: false,
      last_staff_message: null,
      recent_thread_summary: null,
    };
  }
  try {
    const payload = await kapsoGet(cfg, "/platform/v1/whatsapp/messages", {
      conversation_id: conversationId,
      per_page: options.limit || 12,
    });
    return parseRecentMessages(payload, options);
  } catch (err) {
    return {
      has_prior_conversation: false,
      staff_participated: false,
      last_staff_message: null,
      recent_thread_summary: null,
      error: String(err?.message || err),
    };
  }
}

