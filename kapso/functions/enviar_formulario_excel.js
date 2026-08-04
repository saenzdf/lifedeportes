/**
 * enviar_formulario_excel — Formulario Life (.xlsx) por WhatsApp.
 *
 * Dos usos:
 * 1) Cliente (carril vendedor): pide cómo enviar lista/tallas → enviar al mismo chat.
 * 2) Staff: «ENVIAR EXCEL DETALLE» / «envíale el formato a X» → document al WA del cliente.
 *
 * Asset: kapso/assets/Formulario-detalle-pedido.xlsx (inyectado como B64 en deploy).
 * Secrets: KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID (opt), LIFE_FORMULARIO_MEDIA_ID (opt).
 */

const FILENAME = "Formulario-detalle-pedido-Life.xlsx";
const MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DEFAULT_CAPTION =
  "Formulario Life para la lista del pedido (nombre, talla, número, manga, género). Llénele y envíelo por este WhatsApp.";

/** Reemplazado en deploy por el base64 del xlsx. */
const FORMULARIO_XLSX_B64 = "__FORMULARIO_XLSX_B64__";

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

function isStaffContext(vars, input) {
  const role = compact(vars.user?.role || input.role || "").toLowerCase();
  if (role === "staff") return true;
  const blob = [
    input.staff_command,
    input.command,
    vars.staff?.last_inbound_text,
    vars.staff_lane_reply,
    input.query,
  ]
    .map((t) => compact(t))
    .join("\n");
  if (
    /\b(ENVIAR\s+EXCEL(\s+DETALLE)?|manda(r|le)?\s+(el\s+)?(excel|formato|formulario)|env[ií]a(le)?\s+(el\s+)?(excel|formato|formulario))\b/i.test(
      blob
    )
  ) {
    return true;
  }
  return false;
}

function resolveTo(vars, input, whatsapp, staffMode) {
  const explicit = digits(
    input.customer_phone || input.to || input.phone || input.wa_id || ""
  );
  if (explicit.length >= 10) return explicit;

  if (!staffMode) {
    const self = digits(
      vars.user?.wa_id ||
        vars.customer_phone ||
        whatsapp?.conversation?.phone_number ||
        whatsapp?.phone_number ||
        ""
    );
    if (self.length >= 10) return self;
  }

  return digits(
    vars.quote?.customer_phone ||
      vars.crm_seed?.customer_phone ||
      vars.lead?.phone ||
      vars.partner?.phone ||
      vars.order?.partner_phone ||
      vars.staff?.target_customer_phone ||
      ""
  );
}

async function uploadMedia(env, b64) {
  const apiKey = compact(env.KAPSO_API_KEY);
  const pnid = phoneNumberId(env);
  if (!apiKey) return { ok: false, error: "missing_kapso_api_key" };
  if (!b64 || b64.includes("__FORMULARIO")) {
    return { ok: false, error: "missing_formulario_b64" };
  }

  let bytes;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return { ok: false, error: "invalid_formulario_b64" };
  }

  const blob = new Blob([bytes], { type: MIME });
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", MIME);
  form.append("file", blob, FILENAME);

  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${pnid}/media`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
    body: form,
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      error: String(json?.error?.message || resp.statusText || "upload_failed").slice(
        0,
        220
      ),
      raw: json,
    };
  }
  const id = json?.id || json?.media_id || json?.data?.id || null;
  if (!id) return { ok: false, error: "upload_no_media_id", raw: json };
  return { ok: true, media_id: String(id) };
}

async function sendDocument(env, { to, mediaId, caption }) {
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
      type: "document",
      document: {
        id: mediaId,
        filename: FILENAME,
        caption: compact(caption || DEFAULT_CAPTION).slice(0, 1024),
      },
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      error: String(json?.error?.message || resp.statusText || "send_failed").slice(
        0,
        220
      ),
      raw: json,
      code: json?.error?.code,
    };
  }
  return { ok: true, message_id: json?.messages?.[0]?.id || null, raw: json };
}

async function resolveMediaId(env) {
  const cached = compact(env.LIFE_FORMULARIO_MEDIA_ID || "");
  if (cached) return { ok: true, media_id: cached, source: "env" };
  const up = await uploadMedia(env, FORMULARIO_XLSX_B64);
  if (!up.ok) return up;
  return { ok: true, media_id: up.media_id, source: "upload" };
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || body?.vars || {};
  const input = body?.input || {};
  const whatsapp = body?.whatsapp_context || {};
  const now = new Date().toISOString();
  const staffMode = isStaffContext(vars, input);

  const to = resolveTo(vars, input, whatsapp, staffMode);
  if (to.length < 10) {
    return new Response(
      JSON.stringify({
        status: "error",
        message: staffMode
          ? "Falta el teléfono WA del cliente. Busque la oportunidad o pase customer_phone."
          : "No pude resolver el WhatsApp del chat para enviar el Formulario.",
        vars: {
          service: {
            last_call_name: "enviar_formulario_excel",
            last_call_status: "error",
            last_call_at: now,
            fallback_message: staffMode
              ? "Indique teléfono del cliente o retome la oportunidad primero."
              : "No se pudo enviar el Excel.",
          },
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  let media = await resolveMediaId(env);
  let send = null;
  if (media.ok) {
    send = await sendDocument(env, {
      to,
      mediaId: media.media_id,
      caption: input.caption,
    });
  }

  // Media expirado / inválido → re-upload desde B64 y reintentar.
  if (!media.ok || !send?.ok) {
    const up = await uploadMedia(env, FORMULARIO_XLSX_B64);
    if (!up.ok) {
      return new Response(
        JSON.stringify({
          status: "error",
          message: `No pude preparar el Excel: ${up.error || media.error || "upload"}`,
          detail: { media, upload: up, send },
          vars: {
            service: {
              last_call_name: "enviar_formulario_excel",
              last_call_status: "error",
              last_call_at: now,
              fallback_message: "Fallo al subir el Formulario Life.",
            },
          },
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    media = { ok: true, media_id: up.media_id, source: "upload_retry" };
    send = await sendDocument(env, {
      to,
      mediaId: media.media_id,
      caption: input.caption,
    });
  }

  if (!send.ok) {
    const windowHint =
      /window|24|re-engage|template/i.test(String(send.error || "")) ||
      send.code === 131047 ||
      send.code === 131026;
    return new Response(
      JSON.stringify({
        status: "error",
        message: windowHint
          ? `WhatsApp rechazó el envío a ${to} (posible ventana 24h). Use template de retoma o escriba el cliente primero.`
          : `Fallo al enviar el Formulario a ${to}: ${send.error}`,
        detail: { to, media, send },
        vars: {
          service: {
            last_call_name: "enviar_formulario_excel",
            last_call_status: "error",
            last_call_at: now,
            fallback_message: send.error,
          },
          formulario_excel: {
            last_to: to,
            last_status: "error",
            last_error: send.error,
            last_at: now,
          },
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const who = staffMode ? `cliente ${to}` : "este chat";
  return new Response(
    JSON.stringify({
      status: "ok",
      message: `Formulario Life enviado a ${who}.`,
      to,
      message_id: send.message_id,
      media_id: media.media_id,
      media_source: media.source,
      filename: FILENAME,
      vars: {
        service: {
          last_call_name: "enviar_formulario_excel",
          last_call_status: "ok",
          last_call_at: now,
          fallback_message: null,
        },
        formulario_excel: {
          last_to: to,
          last_status: "ok",
          last_message_id: send.message_id,
          last_media_id: media.media_id,
          last_at: now,
          staff_mode: staffMode,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

export { handler };
