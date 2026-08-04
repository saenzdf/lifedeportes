/**
 * odoo-send-wa-template — webhook Odoo (botones en crm.lead).
 *
 * Templates Meta APPROVED (WABA Life, idioma es):
 *   - retomar_pedido_v2
 *   - abono_50_cuentas
 *
 * Auth: Header X-Life-Webhook-Secret | Query ?secret=
 * Secrets: LIFE_ODOO_WEBHOOK_SECRET (o LIFE_WA_TEMPLATE_WEBHOOK_SECRET),
 *          KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID
 * public_endpoint=true
 *
 * Payload ejemplo:
 * {
 *   "template": "retomar_pedido_v2",
 *   "lead_id": 3607,
 *   "customer_phone": "57300…",
 *   "customer_name": "Emmanuelle"
 * }
 */

const ALLOWED = {
  retomar_pedido_v2: { name: "retomar_pedido_v2", language: "es" },
  abono_50_cuentas: { name: "abono_50_cuentas", language: "es" },
};

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function extractSecret(request, url) {
  return (
    compact(request.headers.get("x-life-webhook-secret")) ||
    compact(request.headers.get("X-Life-Webhook-Secret")) ||
    compact(url.searchParams.get("secret")) ||
    compact(url.searchParams.get("token"))
  );
}

function normalizePhone(raw) {
  let d = digits(raw);
  if (d.length === 10 && d.startsWith("3")) d = `57${d}`;
  if (d.length === 12 && d.startsWith("57")) return d;
  if (d.length >= 10 && d.length <= 15) return d;
  return "";
}

function phoneNumberId(env) {
  return compact(
    env.KAPSO_PHONE_NUMBER_ID ||
      env.LIFE_WHATSAPP_PHONE_NUMBER_ID ||
      "1095603153637786"
  );
}

function expectedSecret(env) {
  return compact(
    env.LIFE_WA_TEMPLATE_WEBHOOK_SECRET ||
      env.LIFE_ODOO_WEBHOOK_SECRET ||
      env.LIFE_PRESUPUESTO_WEBHOOK_SECRET ||
      ""
  );
}

async function sendTemplate(env, { to, templateName, language }) {
  const apiKey = compact(env.KAPSO_API_KEY);
  const pnid = phoneNumberId(env);
  if (!apiKey) return { ok: false, error: "missing_kapso_api_key" };

  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${pnid}/messages`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: language || "es" },
      },
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      error: String(json?.error?.message || resp.statusText || "send_failed").slice(0, 240),
      code: json?.error?.code,
      raw: json,
    };
  }
  return { ok: true, message_id: json?.messages?.[0]?.id || null };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handler(request, env) {
  const url = new URL(request.url);
  const now = new Date().toISOString();

  if (request.method === "GET") {
    return jsonResponse({
      ok: true,
      service: "odoo-send-wa-template",
      templates: Object.keys(ALLOWED),
      at: now,
    });
  }

  const want = expectedSecret(env);
  const got = extractSecret(request, url);
  if (want && got !== want) {
    return jsonResponse(
      { ok: false, error: "unauthorized", message: "Invalid webhook secret" },
      401
    );
  }

  const raw = await request.json().catch(() => ({}));
  const p = raw?.input || raw?.payload || raw || {};
  const templateKey = compact(p.template || p.template_name || p.action || "")
    .toLowerCase()
    .replace(/\s+/g, "_");

  let resolvedKey = templateKey;
  if (templateKey === "retomar" || templateKey === "retomar_pedido") {
    resolvedKey = "retomar_pedido_v2";
  }
  if (
    templateKey === "abono" ||
    templateKey === "abono_50" ||
    templateKey === "abono50" ||
    templateKey === "cuentas"
  ) {
    resolvedKey = "abono_50_cuentas";
  }

  const tpl = ALLOWED[resolvedKey];
  if (!tpl) {
    return jsonResponse(
      {
        ok: false,
        error: "unknown_template",
        message: `Template no permitido: ${templateKey || "(vacío)"}`,
        allowed: Object.keys(ALLOWED),
      },
      400
    );
  }

  const to = normalizePhone(p.customer_phone || p.partner_phone || p.phone || p.mobile || "");
  if (!to) {
    return jsonResponse(
      {
        ok: false,
        error: "missing_phone",
        message: "Falta customer_phone / phone de la oportunidad",
        lead_id: p.lead_id || p._id || null,
      },
      400
    );
  }

  const send = await sendTemplate(env, {
    to,
    templateName: tpl.name,
    language: tpl.language,
  });

  if (!send.ok) {
    return jsonResponse(
      {
        ok: false,
        error: "send_failed",
        message: send.error,
        template: tpl.name,
        to,
        lead_id: p.lead_id || null,
        code: send.code || null,
      },
      502
    );
  }

  return jsonResponse({
    ok: true,
    status: "sent",
    template: tpl.name,
    to,
    message_id: send.message_id,
    lead_id: p.lead_id || p._id || null,
    customer_name: compact(p.customer_name || p.partner_name || "") || null,
    at: now,
  });
}

export { handler };
