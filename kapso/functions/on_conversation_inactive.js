/**
 * on-conversation-inactive — webhook Kapso `whatsapp.conversation.inactive`.
 *
 * Tras N minutos sin inbound ni outbound (default 180), termina ejecuciones
 * `waiting` del carril vendedor en ESA conversación. Inbox libre; el próximo
 * inbound = Start + hydrate. No toca staff.
 *
 * public_endpoint=true
 * Auth: X-Webhook-Secret (mismo LIFE_WEBHOOK_SECRET que on-contact-shared)
 * Secrets: KAPSO_API_KEY, LIFE_WEBHOOK_SECRET, LIFE_WORKFLOW_ID (opt)
 */

const WORKFLOW_ID = "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6";
const VENDOR_STEP = "agent_orquestador_1745500003000";
const STAFF_STEPS = new Set([
  "agent_1780762885818",
  "wait_staff_burst_1745500019200",
  "wait_staff_lane_1745500019050",
]);
const STAFF_PHONES_10 = new Set([
  "3103362484",
  "3213988464",
  "3172273627",
  "3172575981",
]);

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function last10Digits(value) {
  const d = String(value ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

function isStaffPhone(phone) {
  const d = last10Digits(phone);
  return Boolean(d && STAFF_PHONES_10.has(d));
}

function isStaffStep(step) {
  const s = compact(step);
  if (!s) return false;
  if (STAFF_STEPS.has(s)) return true;
  if (/staff/i.test(s) && !/customer/i.test(s)) return true;
  return false;
}

function isCustomerWaitingStep(step) {
  const s = compact(step);
  if (!s) return true;
  if (s === VENDOR_STEP || s.includes("orquestador")) return true;
  if (s.includes("wait_customer")) return true;
  if (/historico|histórico/i.test(s)) return true;
  return false;
}

function stepId(exec) {
  return compact(
    exec?.current_step?.identifier || exec?.current_step_identifier || ""
  );
}

function unwrapExecutions(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const data = payload.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.executions)) return data.executions;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(payload.executions)) return payload.executions;
  return [];
}

function extractConversation(body) {
  const src = body?.data && typeof body.data === "object" && !body.conversation ? body.data : body || {};
  const conv = src.conversation || src.data?.conversation || {};
  const id =
    compact(conv.id) ||
    compact(src.conversation_id) ||
    compact(src.whatsapp_conversation_id);
  const phone =
    conv.phone_number ||
    conv.phone ||
    src.phone_number ||
    "";
  return { conversationId: id, phone: compact(phone), inactivityMinutes: Number(src.inactivity?.minutes) || null };
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

function shouldEndWaiting(exec, phone, now = new Date()) {
  if (!customerSendOk(now)) return false;
  if (compact(exec?.status).toLowerCase() !== "waiting") return false;
  if (isStaffPhone(phone)) return false;
  const step = stepId(exec);
  if (isStaffStep(step)) return false;
  return isCustomerWaitingStep(step);
}

function extractSecret(request, url) {
  return (
    compact(request.headers.get("x-webhook-secret")) ||
    compact(request.headers.get("X-Webhook-Secret")) ||
    compact(url.searchParams.get("secret"))
  );
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function kapsoJson(env, method, path, body) {
  const apiKey = compact(env.KAPSO_API_KEY);
  if (!apiKey) throw new Error("missing_kapso_api_key");
  const base = compact(env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const resp = await fetch(`${base}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`${resp.status} ${compact(json?.error?.message || json?.error || resp.statusText)}`.slice(0, 220));
  }
  return json;
}

async function listWaitingForConversation(env, workflowId, conversationId) {
  const qs = new URLSearchParams({
    status: "waiting",
    whatsapp_conversation_id: conversationId,
    per_page: "50",
    page: "1",
  });
  const json = await kapsoJson(
    env,
    "GET",
    `/platform/v1/workflows/${workflowId}/executions?${qs.toString()}`
  );
  return unwrapExecutions(json).filter(
    (e) => compact(e.whatsapp_conversation_id) === compact(conversationId)
  );
}

async function handler(request, env) {
  try {
    const url = new URL(request.url);
    const want = compact(env.LIFE_WEBHOOK_SECRET || "");
    if (want && extractSecret(request, url) !== want) {
      return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const { conversationId, phone } = extractConversation(body);
    if (!conversationId) {
      return jsonResponse({ ok: true, skipped: "no_conversation_id" });
    }
    if (isStaffPhone(phone)) {
      return jsonResponse({ ok: true, skipped: "staff_phone", conversation_id: conversationId });
    }
    if (!customerSendOk()) {
      return jsonResponse({
        ok: true,
        skipped: "quiet_hours",
        conversation_id: conversationId,
      });
    }

    const workflowId = compact(env.LIFE_WORKFLOW_ID) || WORKFLOW_ID;
    const waiting = await listWaitingForConversation(env, workflowId, conversationId);
    const ended = [];
    const skipped = [];
    for (const exec of waiting) {
      if (!shouldEndWaiting(exec, phone)) {
        skipped.push({ id: exec.id, step: stepId(exec), reason: "not_customer_waiting" });
        continue;
      }
      await kapsoJson(env, "PATCH", `/platform/v1/workflow_executions/${exec.id}`, {
        workflow_execution: { status: "ended" },
      });
      ended.push({ id: exec.id, step: stepId(exec) });
    }

    return jsonResponse({
      ok: true,
      conversation_id: conversationId,
      waiting_total: waiting.length,
      ended: ended.length,
      skipped: skipped.length,
      ended_ids: ended.map((e) => e.id),
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: String(err?.message || err).slice(0, 300) },
      500
    );
  }
}

{ handler };
