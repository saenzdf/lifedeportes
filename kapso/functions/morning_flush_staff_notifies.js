/**
 * morning-flush-staff-notifies — ~8:00 a.m. Bogotá (día hábil).
 *
 * Lee crm.lead con marcador `<!-- kapso:pending_staff_notify=... -->`
 * (encolados la noche/domingo por notify-sales-interest) y envía el aviso WA
 * al asesor asignado (Paola O Javier). Luego quita el marcador.
 *
 * Invoke (cron / launchd / manual):
 *   POST https://api.kapso.ai/platform/v1/functions/{id}/invoke
 *   Header: X-API-Key
 *   Body: { dry_run?: false, lookback_hours?: 96 }
 *
 * Secrets: ODOO_*, KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID,
 *   LIFE_SALES_NOTIFY_ENABLED, LIFE_SALES_NOTIFY_TEMPLATE (opt)
 */

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function staffNotifyOk(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(now)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  if (map.weekday === "Sunday") return false;
  const minutesOfDay = Number(map.hour) * 60 + Number(map.minute);
  return minutesOfDay >= 8 * 60 && minutesOfDay < 18 * 60;
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

const PENDING_RE = /<!--\s*kapso:pending_staff_notify=([\s\S]*?)\s*-->/i;

function parsePendingPayload(desc) {
  const m = PENDING_RE.exec(String(desc || ""));
  if (!m) return null;
  try {
    const raw = m[1].replace(/\\u002d\\u002d/g, "--");
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

function stripPendingMarker(desc) {
  return String(desc || "")
    .replace(PENDING_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function odooJsonRpc(env, service, method, args) {
  const url = String(env.ODOO_URL || "").replace(/\/$/, "");
  const resp = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
    }),
  });
  const json = await resp.json();
  if (json?.error) {
    throw new Error(
      String(json.error?.data?.message || json.error?.message || "odoo_error").slice(0, 400)
    );
  }
  return json.result;
}


// --- STAFF_OUTBOUND_DEDUPE ---
function normalizeOutboundCompare(text) {
  return compact(text).toLowerCase();
}

function staffDedupeEnabled(env) {
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

async function isDuplicateStaffOutbound(env, toDigits, intendedText) {
  if (!staffDedupeEnabled(env)) return { duplicate: false, reason: "dedupe_disabled" };
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

function templateCompareKey({ templateName, client, orderSummary, value, conversationId }) {
  return normalizeOutboundCompare(
    `${templateName || "template"}|${client || ""}|${orderSummary || ""}|${value || ""}|${conversationId || ""}`
  );
}
// --- END STAFF_OUTBOUND_DEDUPE ---

// --- STAFF_NOTIFY_HANDOFF (lib/kapso_staff_handoff.js) ---
const STAFF_HANDOFF_WORKFLOW_ID = "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6";

function staffHandoffEnabled(env) {
  return !["0", "false", "no", "off"].includes(
    String(env?.LIFE_STAFF_NOTIFY_HANDOFF ?? "true").toLowerCase().trim()
  );
}

async function openCustomerConversationForStaff(env, conversationId) {
  const convId = compact(conversationId);
  if (!convId || !staffHandoffEnabled(env) || !compact(env.KAPSO_API_KEY)) {
    return { ok: false, skipped: "skip" };
  }
  const workflowId =
    compact(env.LIFE_WORKFLOW_ID) || compact(env.KAPSO_WORKFLOW_ID) || STAFF_HANDOFF_WORKFLOW_ID;
  const base = compact(env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-API-Key": compact(env.KAPSO_API_KEY),
  };
  try {
    const qs = new URLSearchParams({ whatsapp_conversation_id: convId, per_page: "20" });
    const listResp = await fetch(
      `${base}/platform/v1/workflows/${workflowId}/executions?${qs}`,
      { headers }
    );
    const listJson = await listResp.json().catch(() => ({}));
    const rows = Array.isArray(listJson.data)
      ? listJson.data
      : Array.isArray(listJson.executions)
        ? listJson.executions
        : [];
    const exec = rows
      .filter((e) => compact(e.whatsapp_conversation_id) === convId)
      .sort(
        (a, b) =>
          Date.parse(b.updated_at || b.created_at || 0) -
          Date.parse(a.updated_at || a.created_at || 0)
      )[0];
    if (!exec?.id) return { ok: false, skipped: "no_execution" };
    const fromStatus = compact(exec.status).toLowerCase();
    if (fromStatus === "handoff") return { ok: true, skipped: "already_handoff" };
    if (!["waiting", "running", "ended", "failed"].includes(fromStatus)) {
      return { ok: false, skipped: `status_${fromStatus}` };
    }
    const patchResp = await fetch(`${base}/platform/v1/workflow_executions/${exec.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ workflow_execution: { status: "handoff" } }),
    });
    if (!patchResp.ok) {
      return { ok: false, error: `patch_${patchResp.status}` };
    }
    return { ok: true, execution_id: exec.id, from: fromStatus, to: "handoff" };
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 120) };
  }
}
// --- END STAFF_NOTIFY_HANDOFF ---

async function sendWhatsAppText(env, toDigits, body) {
  const apiKey = compact(env.KAPSO_API_KEY);
  const phoneNumberId = compact(
    env.KAPSO_PHONE_NUMBER_ID ||
      env.LIFE_WHATSAPP_PHONE_NUMBER_ID ||
      "1095603153637786"
  );
  if (!apiKey) return { ok: false, error: "missing_kapso_api_key" };
  if (!toDigits || toDigits.length < 10) return { ok: false, error: "invalid_to" };
  const bodyStr = String(body).slice(0, 4000);
  const dup = await isDuplicateStaffOutbound(env, toDigits, bodyStr);
  if (dup.duplicate) {
    return {
      ok: true,
      skipped: true,
      duplicate: true,
      reason: "duplicate_last_outbound",
      last_message_id: dup.last_message_id || null,
    };
  }
  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toDigits,
      type: "text",
      text: { body: bodyStr },
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      error: String(json?.error?.message || resp.statusText || "wa_failed").slice(0, 160),
    };
  }
  return { ok: true, message_id: json?.messages?.[0]?.id || null };
}

async function sendWhatsAppTemplate(env, toDigits, { client, orderSummary, value, conversationId }) {
  const apiKey = compact(env.KAPSO_API_KEY);
  const phoneNumberId = compact(
    env.KAPSO_PHONE_NUMBER_ID ||
      env.LIFE_WHATSAPP_PHONE_NUMBER_ID ||
      "1095603153637786"
  );
  if (!apiKey) return { ok: false, error: "missing_kapso_api_key" };
  if (!toDigits || toDigits.length < 10) return { ok: false, error: "invalid_to" };
  if (!conversationId) return { ok: false, error: "missing_conversation_id" };
  const templateName =
    compact(env.LIFE_SALES_NOTIFY_TEMPLATE) || "alerta_oportunidad_ventas_kapso_v2";
  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toDigits,
      type: "template",
      template: {
        name: templateName,
        language: { code: "es" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: String(client || "cliente").slice(0, 120) },
              { type: "text", text: String(orderSummary || "pedido").slice(0, 160) },
              { type: "text", text: String(value || "por confirmar").slice(0, 60) },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: String(conversationId) }],
          },
        ],
      },
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      error: String(json?.error?.message || resp.statusText || "wa_template_failed").slice(0, 160),
    };
  }
  return { ok: true, message_id: json?.messages?.[0]?.id || null };
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const dryRun = [true, "true", "1", "yes", "on"].includes(
    body.dry_run ?? body.input?.dry_run ?? false
  );
  const lookbackHours = Number(body.lookback_hours || body.input?.lookback_hours || 96) || 96;
  const notifyEnabled = ["1", "true", "yes", "on"].includes(
    String(env.LIFE_SALES_NOTIFY_ENABLED || "").toLowerCase().trim()
  );

  if (!notifyEnabled && !dryRun) {
    return new Response(
      JSON.stringify({
        ok: true,
        skipped: true,
        reason: "LIFE_SALES_NOTIFY_ENABLED_false",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  if (!dryRun && !staffNotifyOk()) {
    return new Response(
      JSON.stringify({
        ok: true,
        skipped: true,
        reason: "staff_quiet_hours",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const uid = await odooJsonRpc(env, "common", "authenticate", [
      env.ODOO_DB,
      env.ODOO_USERNAME,
      env.ODOO_PASSWORD,
      {},
    ]);
    if (!uid) throw new Error("odoo_auth_failed");

    const since = new Date(Date.now() - lookbackHours * 3600 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);

    const leads = await odooJsonRpc(env, "object", "execute_kw", [
      env.ODOO_DB,
      uid,
      env.ODOO_PASSWORD,
      "crm.lead",
      "search_read",
      [
        [
          ["type", "=", "opportunity"],
          ["active", "=", true],
          ["write_date", ">=", since],
          ["description", "ilike", "kapso:pending_staff_notify"],
        ],
      ],
      {
        fields: ["id", "name", "phone", "description", "write_date"],
        limit: 80,
        order: "id asc",
      },
    ]);

    const sent = [];
    const skipped = [];
    const failed = [];

    for (const lead of leads || []) {
      const payload = parsePendingPayload(lead.description);
      if (!payload) {
        skipped.push({ lead_id: lead.id, reason: "payload_parse_failed" });
        continue;
      }
      const to = digits(payload.assignee_phone || "");
      if (to.length < 10) {
        skipped.push({ lead_id: lead.id, reason: "missing_assignee_phone" });
        continue;
      }

      const client =
        compact(payload.customer_name || payload.client_label || lead.name) || "cliente";
      const resumen = compact(payload.order_summary) || "pedido";
      const phoneDigits = digits(payload.customer_phone || "");
      const waMe =
        phoneDigits.length >= 11
          ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
              "Hola, le escribo de Life Deportes para confirmar su pedido."
            )}`
          : null;
      const kapsoUrl = payload.conversation_id
        ? `https://inbox.kapso.ai/projects/b470d474-6a7a-4d84-a214-6cd4b198b4f3?conversation_id=${encodeURIComponent(
            payload.conversation_id
          )}`
        : null;
      const detail =
        compact(payload.detail_text) ||
        (waMe
          ? [`Nueva oportunidad · ${client} · ${resumen}`, waMe, kapsoUrl]
              .filter(Boolean)
              .join("\n")
          : [
              `Nueva oportunidad · ${client} · ${resumen} — teléfono no público`,
              kapsoUrl,
            ]
              .filter(Boolean)
              .join("\n"));

      const orderForTemplate = waMe
        ? `${resumen} · Tel ${phoneDigits.slice(-10)}`.slice(0, 160)
        : resumen;

      let wa = { ok: false, skipped: true };
      if (!dryRun) {
        // Intentar texto completo (wa.me + Kapso); si falla ventana 24h → template con Tel.
        wa = await sendWhatsAppText(env, to, detail);
        if (!wa.ok && payload.conversation_id) {
          wa = {
            ...(await sendWhatsAppTemplate(env, to, {
              client: payload.client_label || payload.customer_name || lead.name,
              orderSummary: orderForTemplate,
              value: payload.value_label || "por confirmar",
              conversationId: payload.conversation_id,
            })),
            method: "template",
          };
        }
      } else {
        wa = { ok: true, dry_run: true };
      }

      if (!wa.ok) {
        failed.push({ lead_id: lead.id, to, error: wa.error || "send_failed" });
        continue;
      }

      if (!dryRun) {
        const nextDesc = stripPendingMarker(lead.description);
        await odooJsonRpc(env, "object", "execute_kw", [
          env.ODOO_DB,
          uid,
          env.ODOO_PASSWORD,
          "crm.lead",
          "write",
          [[lead.id], { description: nextDesc }],
        ]);
        if (payload.conversation_id) {
          await openCustomerConversationForStaff(env, payload.conversation_id);
        }
      }

      sent.push({
        lead_id: lead.id,
        to,
        assignee: payload.assignee_name || null,
        method: wa.dry_run ? "dry_run" : wa.message_id ? "wa" : "ok",
        message_id: wa.message_id || null,
        conversation_id: payload.conversation_id || null,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        at: new Date().toISOString(),
        dry_run: dryRun,
        lookback_hours: lookbackHours,
        scanned: (leads || []).length,
        sent,
        skipped,
        failed,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err?.message || err).slice(0, 300) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

{ handler };
