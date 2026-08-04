/**
 * enviar_retomar_pedido — SOLO staff (tool / comando ENVIAR RETOMAR).
 * Envía template Meta `retomar_pedido_v2` (APPROVED, es) al WhatsApp del cliente.
 *
 * Input:
 *   customer_phone | to | phone
 *   query (opcional — texto del pedido staff)
 *
 * Secrets: KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID (opt)
 * Optional: LIFE_RETOMAR_TEMPLATE_NAME (default retomar_pedido_v2),
 *           LIFE_RETOMAR_TEMPLATE_LANG (default es)
 */

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function isStaffContext(vars, input) {
  const role = compact(vars.user?.role || input.role || "").toLowerCase();
  if (role === "staff") return true;
  if (vars.staff && typeof vars.staff === "object") return true;
  if (input.force_staff === true) return true;
  const blob = [
    input.staff_command,
    input.command,
    input.query,
    vars.staff?.last_inbound_text,
    vars.staff_lane_reply,
  ]
    .map((t) => compact(t))
    .join("\n");
  return /\b(ENVIAR\s+RETOMAR|retomar_pedido|manda(r)?\s+(template\s+)?retoma)\b/i.test(
    blob
  );
}

function resolveTo(vars, input) {
  return digits(
    input.customer_phone ||
      input.to ||
      input.phone ||
      vars.quote?.customer_phone ||
      vars.crm_seed?.customer_phone ||
      vars.lead?.phone ||
      vars.partner?.phone ||
      vars.order?.partner_phone ||
      vars.staff?.target_customer_phone ||
      ""
  );
}

function sendTemplate(env, { to }) {
  const apiKey = compact(env.KAPSO_API_KEY);
  const phoneNumberId = compact(
    env.KAPSO_PHONE_NUMBER_ID ||
      env.LIFE_WHATSAPP_PHONE_NUMBER_ID ||
      "1095603153637786"
  );
  const templateName = compact(env.LIFE_RETOMAR_TEMPLATE_NAME) || "retomar_pedido_v2";
  const lang = compact(env.LIFE_RETOMAR_TEMPLATE_LANG) || "es";
  if (!apiKey) return Promise.resolve({ ok: false, error: "missing_kapso_api_key" });

  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
  return fetch(url, {
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
        language: { code: lang },
      },
    }),
  }).then(async (resp) => {
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return {
        ok: false,
        error: String(json?.error?.message || resp.statusText || "template_failed").slice(
          0,
          220
        ),
        raw: json,
        code: json?.error?.code,
      };
    }
    return { ok: true, message_id: json?.messages?.[0]?.id || null };
  });
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || body?.vars || {};
  const input = body?.input || {};
  const now = new Date().toISOString();

  if (!isStaffContext(vars, input)) {
    return new Response(
      JSON.stringify({
        status: "blocked",
        message: "enviar_retomar_pedido solo bajo orden staff (ENVIAR RETOMAR).",
        vars: {
          service: {
            last_call_name: "enviar_retomar_pedido",
            last_call_status: "blocked",
            last_call_at: now,
            fallback_message: "Comando solo staff.",
          },
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const to = resolveTo(vars, input);
  if (to.length < 10) {
    return new Response(
      JSON.stringify({
        status: "error",
        message:
          "Falta teléfono WA del cliente. Busque la oportunidad o pase customer_phone.",
        vars: {
          service: {
            last_call_name: "enviar_retomar_pedido",
            last_call_status: "error",
            last_call_at: now,
            fallback_message: "Indique el teléfono WA del cliente.",
          },
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const result = await sendTemplate(env, { to });
  const templateName = compact(env.LIFE_RETOMAR_TEMPLATE_NAME) || "retomar_pedido_v2";

  return new Response(
    JSON.stringify({
      status: result.ok ? "ok" : "error",
      message: result.ok
        ? `Template ${templateName} enviado a ${to}.`
        : `No se pudo enviar: ${result.error}`,
      to,
      template: templateName,
      message_id: result.message_id || null,
      vars: {
        retomar_pedido: {
          sent_at: now,
          to,
          ok: result.ok,
          template: templateName,
          message_id: result.message_id || null,
          error: result.error || null,
        },
        quote: {
          ...(vars.quote || {}),
          customer_phone: vars.quote?.customer_phone || to,
          status: result.ok ? "retoma_enviada" : vars.quote?.status,
        },
        service: {
          last_call_name: "enviar_retomar_pedido",
          last_call_status: result.ok ? "ok" : "error",
          last_call_at: now,
          fallback_message: result.ok ? null : result.error,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

export { handler };
