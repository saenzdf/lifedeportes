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
      phone: phoneDigits,
      q: phoneDigits,
      per_page: 20,
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
