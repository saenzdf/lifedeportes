/**
 * enviar-ubicacion — Pin nativo de Google Maps por WhatsApp (carril cliente).
 *
 * Cuándo: el cliente indica que va a / ya llegó a la fábrica (dijo dirección antes).
 * Qué hace:
 *   1) Envía un mensaje WhatsApp `type: "location"` con el punto de la fábrica
 *      (lat/long + nombre + dirección → abre en Google Maps).
 *   2) Asegura/crea la oportunidad CRM (crm.lead) para seguimiento del staff.
 *      Si `notify_staff: true` (llegada / puerta): avisa a **un** asesor
 *      (`Asignado a` sticky). Nunca a Paola y Javier a la vez.
 *
 * Secrets: KAPSO_API_KEY, KAPSO_PHONE_NUMBER_ID (opt), ODOO_* (para CRM seed).
 * Coordenadas fábrica: lat 4.6968498, lon -74.1208615 (Cl. 66a #98a 12, Los Álamos).
 */

const FACTORY = {
  name: "Life Deportes",
  address: "Cl. 66a #98a 12, barrio Los Álamos, Engativá, Bogotá",
  latitude: 4.6968498,
  longitude: -74.1208615,
};

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
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

function phoneNumberId(env) {
  return compact(
    env.KAPSO_PHONE_NUMBER_ID ||
      env.LIFE_WHATSAPP_PHONE_NUMBER_ID ||
      "1095603153637786"
  );
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

/** Envía el pin nativo de ubicación (type: location). */
async function sendLocation(env, to) {
  const apiKey = compact(env.KAPSO_API_KEY);
  const pnid = phoneNumberId(env);
  if (!apiKey) return { ok: false, error: "missing_kapso_api_key" };
  if (!to || to.length < 10) return { ok: false, error: "invalid_to" };

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
      type: "location",
      location: {
        name: FACTORY.name,
        address: FACTORY.address,
        latitude: FACTORY.latitude,
        longitude: FACTORY.longitude,
      },
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      error: String(json?.error?.message || resp.statusText || "send_failed").slice(0, 220),
      code: json?.error?.code,
      raw: json,
    };
  }
  return { ok: true, message_id: json?.messages?.[0]?.id || null };
}

/**
 * Asegura la oportunidad CRM (crea o reusa por phone / conversation_id).
 * Sin aviso a staff (sin notificación WA); solo deja el lead listo para seguimiento.
 */
async function ensureCrmOpportunity(env, { phone, customerName, conversationId }) {
  if (!env.ODOO_URL || !env.ODOO_DB || !env.ODOO_USERNAME || !env.ODOO_PASSWORD) {
    return { ok: false, skipped: true, reason: "missing_odoo_secrets" };
  }
  try {
    const uid = await odooJsonRpc(env, "common", "authenticate", [
      env.ODOO_DB,
      env.ODOO_USERNAME,
      env.ODOO_PASSWORD,
      {},
    ]);
    if (!uid) return { ok: false, error: "odoo_auth_failed" };
    const executeKw = (model, method, positionalArgs = [], kw = {}) =>
      odooJsonRpc(env, "object", "execute_kw", [
        env.ODOO_DB,
        uid,
        env.ODOO_PASSWORD,
        model,
        method,
        positionalArgs,
        kw,
      ]);

    const normDigits = digits(phone);
    const local10 = normDigits.slice(-10);
    let lead = null;
    if (local10 && local10.length === 10) {
      const rows =
        (await executeKw(
          "crm.lead",
          "search_read",
          [
            [
              ["type", "=", "opportunity"],
              ["active", "=", true],
              "|",
              ["phone", "ilike", local10],
              ["partner_id.phone", "ilike", local10],
            ],
          ],
          { fields: ["id", "name", "phone"], limit: 1, order: "id desc" }
        )) || [];
      if (rows[0]?.id) lead = rows[0];
    }
    // fallback por conversation_id en description
    if (!lead && conversationId) {
      const rows =
        (await executeKw(
          "crm.lead",
          "search_read",
          [[["description", "ilike", conversationId], ["active", "=", true]]],
          { fields: ["id", "name", "phone"], limit: 1, order: "id desc" }
        )) || [];
      if (rows[0]?.id) lead = rows[0];
    }

    const name = compact(customerName) || `WA ${local10 || "cliente"}`;
    const now = new Date().toISOString();
    let leadId = null;
    let created = false;
    if (lead) {
      leadId = lead.id;
      await executeKw("crm.lead", "write", [[leadId], { phone: normDigits ? `+${normDigits}` : false }]);
    } else {
      const partnerRows =
        (await executeKw(
          "res.partner",
          "search_read",
          [[["phone", "ilike", local10]]],
          { fields: ["id"], limit: 1 }
        )) || [];
      let partnerId = partnerRows[0]?.id || null;
      if (!partnerId) {
        partnerId = await executeKw("res.partner", "create", [
          { name, phone: normDigits ? `+${normDigits}` : false, type: "contact" },
        ]);
      }
      const noteBits = ["Cliente indicó que va / llegó a la fábrica."];
      if (conversationId) noteBits.push(`conv=${conversationId}`);
      leadId = await executeKw("crm.lead", "create", [
        {
          name,
          partner_id: partnerId,
          phone: normDigits ? `+${normDigits}` : false,
          type: "opportunity",
          stage_id: Number(env.LIFE_CRM_SEED_STAGE_ID || 6) || 6,
          description: `<p>${noteBits.join("<br/>")}</p>`,
        },
      ]);
      created = true;
    }
    return { ok: true, lead_id: leadId, created, at: now };
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 240) };
  }
}

const STAFF = [
  { phone: "573213988464", name: "Paola" },
  { phone: "573103362484", name: "Javier" },
];

function parseAssigneeName(desc) {
  const m = String(desc || "").match(/Asignado a:\s*(Paola|Javier)/i);
  if (!m) return null;
  return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
}

function phoneForAssigneeName(name) {
  return name === "Paola" ? "573213988464" : name === "Javier" ? "573103362484" : null;
}

function pickOneByHash(key, phones) {
  const s = String(key || "x");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return phones[h % phones.length];
}

/**
 * Un cliente = un asesor. Reusa `Asignado a` (incl. archivados); si no hay,
 * round-robin global y lo pega en el lead. Nunca devuelve dos teléfonos.
 */
async function resolveOneStaffPhone(env, { customerName, phone, conversationId, leadId }) {
  const allPhones = STAFF.map((s) => s.phone);
  const fallback = pickOneByHash(conversationId || phone || customerName, allPhones);
  if (!env.ODOO_URL || !env.ODOO_DB || !env.ODOO_USERNAME || !env.ODOO_PASSWORD) {
    return { phone: fallback, name: STAFF.find((s) => s.phone === fallback)?.name || null, reused: false };
  }
  try {
    const uid = await odooJsonRpc(env, "common", "authenticate", [
      env.ODOO_DB,
      env.ODOO_USERNAME,
      env.ODOO_PASSWORD,
      {},
    ]);
    if (!uid) return { phone: fallback, name: STAFF.find((s) => s.phone === fallback)?.name || null, reused: false };
    const executeKw = (model, method, positionalArgs = [], kw = {}) =>
      odooJsonRpc(env, "object", "execute_kw", [
        env.ODOO_DB,
        uid,
        env.ODOO_PASSWORD,
        model,
        method,
        positionalArgs,
        kw,
      ]);
    const searchKw = {
      fields: ["id", "name", "phone", "description", "active"],
      limit: 8,
      order: "id desc",
      context: { active_test: false },
    };
    const byId = new Map();
    const addRows = (found) => {
      for (const r of found || []) if (r?.id) byId.set(r.id, r);
    };
    if (conversationId) {
      addRows(await executeKw("crm.lead", "search_read", [[["description", "ilike", conversationId]]], searchKw));
    }
    const local10 = digits(phone).slice(-10);
    if (local10.length >= 7) {
      addRows(await executeKw("crm.lead", "search_read", [[["phone", "ilike", local10]]], searchKw));
    }
    const person = compact(customerName);
    if (person.length >= 8) {
      addRows(
        await executeKw(
          "crm.lead",
          "search_read",
          [[["name", "ilike", person.slice(0, 40)], ["type", "=", "opportunity"]]],
          searchKw
        )
      );
    }
    if (leadId) {
      addRows(
        await executeKw("crm.lead", "read", [[leadId]], {
          fields: ["id", "name", "phone", "description", "active"],
        })
      );
    }
    const rows = [...byId.values()];
    const assigned = rows
      .filter((r) => r.active !== false && parseAssigneeName(r.description))
      .sort((a, b) => Number(b.id) - Number(a.id));
    const stickyName = assigned[0] ? parseAssigneeName(assigned[0].description) : null;
    let chosenName = stickyName;
    let reused = Boolean(stickyName);
    if (!chosenName) {
      const lastRows =
        (await executeKw(
          "crm.lead",
          "search_read",
          [[["type", "=", "opportunity"], ["description", "ilike", "Asignado a:"]]],
          { fields: ["id", "description"], limit: 1, order: "id desc", context: { active_test: false } }
        )) || [];
      const lastName = parseAssigneeName(lastRows[0]?.description || "");
      const lastPhone = phoneForAssigneeName(lastName);
      const idx = lastPhone ? allPhones.indexOf(lastPhone) : -1;
      const nextPhone = idx >= 0 ? allPhones[(idx + 1) % allPhones.length] : fallback;
      chosenName = STAFF.find((s) => s.phone === nextPhone)?.name || "Paola";
    }
    const chosenPhone = phoneForAssigneeName(chosenName) || fallback;
    const targetId = leadId || assigned[0]?.id || rows[0]?.id || null;
    if (targetId && chosenName) {
      const target = rows.find((r) => r.id === targetId);
      const desc = String(target?.description || "");
      if (!parseAssigneeName(desc)) {
        await executeKw("crm.lead", "write", [
          [targetId],
          { description: `${desc}\n<p><b>Asignado a: ${chosenName}</b></p>`.trim() },
        ]);
      }
    }
    return { phone: chosenPhone, name: chosenName, reused, lead_id: targetId };
  } catch (_err) {
    return { phone: fallback, name: STAFF.find((s) => s.phone === fallback)?.name || null, reused: false };
  }
}

/** Aviso interno a UN asesor cuando el cliente llegó / está en la puerta. */

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

async function notifyStaff(env, { customerName, phone, conversationId, leadId }) {
  if (!staffNotifyOk()) {
    if (leadId) {
      try {
        const uid = await odooJsonRpc(env, "common", "authenticate", [
          env.ODOO_DB,
          env.ODOO_USERNAME,
          env.ODOO_PASSWORD,
          {},
        ]);
        if (uid) {
          const rows = await odooJsonRpc(env, "object", "execute_kw", [
            env.ODOO_DB,
            uid,
            env.ODOO_PASSWORD,
            "crm.lead",
            "read",
            [[leadId], ["description"]],
          ]);
          const current = String(rows?.[0]?.description || "").replace(
            /<!--\s*kapso:pending_staff_notify(?:=[\s\S]*?)?\s*-->/gi,
            ""
          );
          const assignee = await resolveOneStaffPhone(env, {
            customerName,
            phone,
            conversationId,
            leadId,
          });
          const client = compact(customerName) || `WA ${digits(phone).slice(-10) || "cliente"}`;
          const detail = `Cliente ${client} llegó a la fábrica y necesita atención (está en la puerta / no responde el timbre). Por favor atiéndanlo.`;
          const payload = {
            assignee_phone: digits(assignee.phone || ""),
            assignee_name: assignee.name || null,
            customer_name: client,
            customer_phone: digits(phone),
            conversation_id: conversationId || null,
            order_summary: "llegó a la fábrica",
            detail_text: detail,
            created_at: new Date().toISOString(),
          };
          const json = JSON.stringify(payload).replace(/--/g, "\\u002d\\u002d");
          await odooJsonRpc(env, "object", "execute_kw", [
            env.ODOO_DB,
            uid,
            env.ODOO_PASSWORD,
            "crm.lead",
            "write",
            [[leadId], { description: `${current}\n<!-- kapso:pending_staff_notify=${json} -->`.trim() }],
          ]);
        }
      } catch (_err) {
        /* queue best-effort */
      }
    }
    return { ok: true, skipped: true, reason: "staff_quiet_hours", queued: true };
  }

  const apiKey = compact(env.KAPSO_API_KEY);
  const pnid = phoneNumberId(env);
  if (!apiKey) return { ok: false, skipped: true, reason: "missing_kapso_api_key" };

  const assignee = await resolveOneStaffPhone(env, { customerName, phone, conversationId, leadId });
  const to = digits(assignee.phone || "");
  if (to.length < 10) return { ok: false, skipped: true, reason: "no_staff_phone" };

  const client = compact(customerName) || `WA ${digits(phone).slice(-10) || "cliente"}`;
  const body = `Cliente ${client} llegó a la fábrica y necesita atención (está en la puerta / no responde el timbre). Por favor atiéndanlo.`;
  const dup = await isDuplicateStaffOutbound(env, to, body);
  if (dup.duplicate) {
    return {
      ok: true,
      skipped: true,
      duplicate: true,
      reason: "duplicate_last_outbound",
      last_message_id: dup.last_message_id || null,
    };
  }
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
      type: "text",
      text: { body: body.slice(0, 1024) },
    }),
  }).catch(() => null);
  const json = resp ? await resp.json().catch(() => ({})) : {};
  return {
    ok: Boolean(resp?.ok),
    to,
    assignee: assignee.name,
    reused: assignee.reused,
    error: resp?.ok ? null : String(json?.error?.message || "send_failed").slice(0, 160),
  };
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || body?.vars || {};
  const input = body?.input || {};
  const whatsapp = body?.whatsapp_context || {};
  const now = new Date().toISOString();

  const to = digits(
    input.customer_phone ||
      input.to ||
      input.phone ||
      vars.user?.wa_id ||
      vars.quote?.customer_phone ||
      whatsapp?.conversation?.phone_number ||
      whatsapp?.phone_number ||
      ""
  );
  if (to.length < 10) {
    return jsonResponse({
      status: "error",
      message: "No pude resolver el WhatsApp del chat para enviar la ubicación.",
      vars: {
        service: {
          last_call_name: "enviar_ubicacion",
          last_call_status: "error",
          last_call_at: now,
          fallback_message: "Falta el teléfono del chat.",
        },
      },
    });
  }

  const send = customerSendOk()
    ? await sendLocation(env, to)
    : { ok: true, skipped: true, reason: "quiet_hours", message_id: null };

  const customerName = compact(
    input.customer_name ||
      vars.user?.name ||
      vars.quote?.customer_display_name ||
      whatsapp?.conversation?.contact_name ||
      ""
  );
  const conversationId = compact(
    input.conversation_id ||
      whatsapp?.conversation?.id ||
      vars.kapso?.conversation_id ||
      ""
  );

  const crm = await ensureCrmOpportunity(env, {
    phone: to,
    customerName,
    conversationId,
  });

  // Llegada / puerta: avisar a UN asesor (Asignado a). Consulta simple → notify_staff false.
  const notify_staff = input.notify_staff === true || input.notify_staff === "true";
  let staff = { ok: false, skipped: true, reason: "not_requested" };
  if (notify_staff) {
    staff = await notifyStaff(env, {
      customerName,
      phone: to,
      conversationId,
      leadId: crm?.lead_id || null,
    });
  }

  if (!send.ok && !send.skipped) {
    const windowHint =
      /window|24|re-engage|template/i.test(String(send.error || "")) ||
      send.code === 131047 ||
      send.code === 131026;
    return jsonResponse({
      status: "error",
      message: windowHint
        ? `WhatsApp rechazó la ubicación a ${to} (posible ventana 24h). Use template de retoma o escriba el cliente primero.`
        : `Fallo al enviar la ubicación a ${to}: ${send.error}`,
      detail: { to, send, crm },
      vars: {
        service: {
          last_call_name: "enviar_ubicacion",
          last_call_status: "error",
          last_call_at: now,
          fallback_message: send.error,
        },
      },
    });
  }

  return jsonResponse({
    status: send.skipped ? "deferred" : "ok",
    message: send.skipped
      ? "Fuera de horario de envío al cliente; la ubicación se manda a partir de las 6:00 a.m."
      : "Ubicación de la fábrica enviada.",
    to,
    location: FACTORY,
    message_id: send.message_id,
    crm,
    staff,
    vars: {
      service: {
        last_call_name: "enviar_ubicacion",
        last_call_status: "ok",
        last_call_at: now,
        fallback_message: null,
      },
    },
  });
}

export { handler };
