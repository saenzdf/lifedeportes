/**
 * request_contact_info — pide el número de WhatsApp a un cliente con número
 * privado (BSUID / username) para que un asesor pueda contactarlo y cerrar la
 * venta desde su WhatsApp personal.
 *
 * Cuándo usarla: el staff pide el contacto de WhatsApp de un cliente y NO hay
 * teléfono (solo business_scoped_user_id CO.xxx). `wa.me` no funciona con BSUID,
 * así que se le pide al cliente su número. Cuando el cliente comparte el número
 * (vía el botón o compartiendo contacto), llega un webhook de contacto con el
 * teléfono real → luego se arma el wa.me para el asesor.
 *
 * El mensaje al cliente explica que es SOLO para que un asesor lo contacte, y le
 * da 3 opciones: compartir su número, escribirle al asesor, o seguir siendo
 * atendido en el canal de ventas de Kapso.
 *
 * Estrategia de envío:
 *   - Template `compartir_contacto_asesor` (UTILITY, botón REQUEST_CONTACT_INFO):
 *     es el único que funciona FUERA de la ventana de 24h. Por defecto.
 *   - Interactive `request_contact_info`: solo funciona DENTRO de la ventana de
 *     24h. Se usa si `input.use_interactive` es true, o como fallback si el
 *     template aún no está aprobado / falla.
 *
 * Entrada (input):
 *   - customer_phone : teléfono WA del cliente (E.164) — opcional
 *   - recipient      : BSUID del cliente (CO.xxx) — usado si no hay teléfono
 *   - customer_name  : nombre del cliente (contexto, no se usa en el template)
 *   - order_summary  : resumen del pedido (contexto opcional)
 *   - asesor_name    : "Paola" | "Javier" (para la opción de escribirle)
 *   - asesor_wa      : teléfono del asesor para la opción "escribirle" (opcional)
 *   - use_interactive: true → forzar interactive (solo si ventana abierta)
 *
 * Secrets: KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID (opt, default 1095603153637786)
 *
 * Salida:
 *   - vars.request_contact_info.status : "sent" | "error" | "missing_recipient"
 *   - vars.request_contact_info.method : "template" | "interactive"
 *   - vars.request_contact_info.message_id
 *   - vars.request_contact_info.recipient (BSUID o teléfono usado)
 */

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function phoneNumberId(env) {
  return compact(
    env.KAPSO_PHONE_NUMBER_ID ||
      env.LIFE_WHATSAPP_PHONE_NUMBER_ID ||
      "1095603153637786"
  );
}

function isBsuid(value) {
  return /^[A-Z]{2}(\.ENT)?\.[A-Za-z0-9]+$/i.test(value);
}

/** Envía el template UTILITY `compartir_contacto_asesor` (funciona fuera de 24h). */
async function sendTemplate(env, { recipient }) {
  const apiKey = compact(env.KAPSO_API_KEY);
  const pnid = phoneNumberId(env);
  if (!apiKey) return { ok: false, error: "missing_kapso_api_key" };
  const templateName = compact(env.LIFE_REQUEST_CONTACT_TEMPLATE) || "compartir_contacto_asesor";
  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${pnid}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    type: "template",
    template: { name: templateName, language: { code: "es" } },
  };
  // BSUID → recipient; teléfono → to.
  if (isBsuid(recipient)) payload.recipient = recipient;
  else payload.to = digits(recipient);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      error: String(json?.error?.message || json?.error?.details || resp.statusText || "template_failed").slice(0, 220),
      code: json?.error?.code,
      raw: json,
    };
  }
  return { ok: true, message_id: json?.messages?.[0]?.id || null, raw: json };
}

/** Envía el interactive request_contact_info (solo dentro de ventana 24h). */
async function sendInteractive(env, { recipient }) {
  const apiKey = compact(env.KAPSO_API_KEY);
  const pnid = phoneNumberId(env);
  if (!apiKey) return { ok: false, error: "missing_kapso_api_key" };
  const body =
    "Hola, para que un asesor de Life Deportes pueda contactarte y ayudarte con tu pedido, " +
    "comparte tu número de WhatsApp. También puedes escribirle tú directamente a nuestro " +
    "asesor, o seguir siendo atendido por este canal de ventas.";
  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${pnid}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    type: "interactive",
    interactive: {
      type: "request_contact_info",
      body: { text: body.slice(0, 1024) },
      action: { name: "request_contact_info" },
    },
  };
  if (isBsuid(recipient)) payload.recipient = recipient;
  else payload.to = digits(recipient);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      error: String(json?.error?.message || json?.error?.details || resp.statusText || "interactive_failed").slice(0, 220),
      code: json?.error?.code,
      raw: json,
    };
  }
  return { ok: true, message_id: json?.messages?.[0]?.id || null, raw: json };
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const now = new Date().toISOString();

  const customerName = compact(input.customer_name);
  const asesorName = compact(input.asesor_name);
  const asesorWa = compact(input.asesor_wa);
  const useInteractive = [true, "true", "1", "yes", "on"].includes(input.use_interactive);

  const bsuid = compact(input.recipient || input.business_scoped_user_id);
  const phone = digits(input.customer_phone || input.to || input.phone || "");
  const recipient = bsuid || phone;

  const setVars = (status, extra = {}) => ({
    service: {
      last_call_name: "request_contact_info",
      last_call_status: status === "sent" ? "ok" : status,
      last_call_at: now,
      fallback_message: null,
    },
    request_contact_info: {
      status,
      at: now,
      recipient: recipient || null,
      ...extra,
    },
  });

  if (!recipient) {
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Falta el destinatario: pase business_scoped_user_id (BSUID) del cliente o su teléfono.",
        vars: setVars("missing_recipient"),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // Por defecto intentamos el template (fuera de 24h). Si se pide interactive o
  // el template falla por ventana/template, cae al interactive.
  let result;
  if (useInteractive) {
    result = await sendInteractive(env, { recipient });
    result.method = "interactive";
  } else {
    result = await sendTemplate(env, { recipient });
    result.method = "template";
    // Si el template falla (no aprobado / ventana), intentar el interactive.
    if (!result.ok) {
      const inter = await sendInteractive(env, { recipient });
      inter.method = "interactive";
      result = inter;
    }
  }

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        status: "error",
        message: `Fallo al pedir el contacto: ${result.error}`,
        detail: { recipient, send: result },
        vars: setVars("error", { error: result.error, code: result.code || null, method: result.method }),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const toStaff =
    `Le pedí a ${customerName || "el cliente"} su número de WhatsApp para que pueda contactarlo. ` +
    `Cuando lo comparta, le envío el enlace wa.me.` +
    (asesorName || asesorWa
      ? ` También le di la opción de escribirle directamente a${asesorName ? ` ${asesorName}` : ""}${asesorWa ? ` (${asesorWa})` : ""} o seguir en el canal de ventas.`
      : "");

  return new Response(
    JSON.stringify({
      status: "ok",
      message: toStaff,
      recipient,
      is_bsuid: isBsuid(recipient),
      method: result.method,
      message_id: result.message_id,
      vars: setVars("sent", { method: result.method, message_id: result.message_id, staff_reply: toStaff }),
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

export { handler };
