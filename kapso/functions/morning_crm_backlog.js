/**
 * morning_crm_backlog — barrido ~7:00 Bogotá.
 * SOLO crea/actualiza oportunidades CRM + marca candidato_retomar_pedido en dossier.
 * NUNCA envía WhatsApp / templates al cliente.
 *
 * Invoke: cron externo o Kapso scheduled call con X-API-Key.
 * Body opcional: { lookback_hours: 72, mark_retoma_candidates: true }
 *
 * Secrets: ODOO_*, KAPSO_API_KEY (para listar convs / last activity), KAPSO_PHONE_NUMBER_ID
 * Flag: LIFE_CRM_SEED_ENABLED, LIFE_MORNING_BACKLOG_ENABLED (default true)
 */

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
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

async function markCandidatoRetoma(env, uid, lead) {
  const desc = String(lead.description || "");
  if (/estado:\s*candidato_retomar_pedido/i.test(desc)) {
    return { lead_id: lead.id, changed: false };
  }
  const now = new Date().toISOString();
  let next = desc;
  if (/estado:\s*[^\n<]+/i.test(desc)) {
    next = desc.replace(/estado:\s*[^\n<]+/i, "estado: candidato_retomar_pedido");
  } else if (desc.includes("LIFE_DOSSIER_v1")) {
    next = desc.replace(
      "LIFE_DOSSIER_v1",
      "LIFE_DOSSIER_v1\nestado: candidato_retomar_pedido"
    );
  } else {
    next = `${desc}\n\n<pre>LIFE_DOSSIER_v1\nestado: candidato_retomar_pedido\nupdated_at: ${now}</pre>`;
  }
  if (!/candidato_retomar|pendiente staff ENVIAR RETOMAR/i.test(next)) {
    next += `\nhistorial: ${now}: fuera_ventana_24h — pendiente staff ENVIAR RETOMAR`;
  }
  await odooJsonRpc(env, "object", "execute_kw", [
    env.ODOO_DB,
    uid,
    env.ODOO_PASSWORD,
    "crm.lead",
    "write",
    [[lead.id], { description: next }],
  ]);
  return { lead_id: lead.id, changed: true };
}

async function listRecentInterestLeads(env, uid, lookbackHours) {
  const since = new Date(Date.now() - lookbackHours * 3600 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  return odooJsonRpc(env, "object", "execute_kw", [
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
        "|",
        ["description", "ilike", "LIFE_DOSSIER_v1"],
        ["description", "ilike", "interes_confirmado"],
      ],
    ],
    {
      fields: ["id", "name", "phone", "partner_id", "description", "write_date"],
      limit: 80,
      order: "write_date asc",
    },
  ]);
}

async function conversationOutside24h(env, phoneDigits) {
  const apiKey = compact(env.KAPSO_API_KEY);
  if (!apiKey || !phoneDigits) return { unknown: true, outside: false };
  const phoneNumberId = compact(
    env.KAPSO_PHONE_NUMBER_ID || env.LIFE_WHATSAPP_PHONE_NUMBER_ID || "1095603153637786"
  );
  const url = new URL("https://api.kapso.ai/platform/v1/whatsapp/conversations");
  url.searchParams.set("phone_number_id", phoneNumberId);
  url.searchParams.set("phone", phoneDigits);
  url.searchParams.set("per_page", "5");
  const resp = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-API-Key": apiKey },
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) return { unknown: true, outside: false, error: resp.status };
  const convs = json?.data || [];
  const hit =
    convs.find((c) => digits(c.phone_number) === phoneDigits) || convs[0];
  if (!hit) return { unknown: true, outside: false };
  const lastActive = hit.last_active_at || hit.updated_at;
  if (!lastActive) return { unknown: true, outside: false };
  const ageMs = Date.now() - new Date(lastActive).getTime();
  const kapso = hit.kapso || {};
  const li = kapso.last_inbound_at ? new Date(kapso.last_inbound_at).getTime() : 0;
  const lo = kapso.last_outbound_at ? new Date(kapso.last_outbound_at).getTime() : 0;
  // Candidato: última actividad outbound hace >24h y no hay inbound más reciente
  const outside = ageMs > 24 * 3600 * 1000 && lo >= li;
  return { unknown: false, outside, conversation_id: hit.id, last_active_at: lastActive };
}

async function handler(request, env) {
  const enabled = !["0", "false", "no", "off"].includes(
    String(env.LIFE_MORNING_BACKLOG_ENABLED ?? "true").toLowerCase().trim()
  );
  const body = await request.json().catch(() => ({}));
  const lookbackHours = Number(body.lookback_hours || body.input?.lookback_hours || 72);
  const markRetoma = body.mark_retoma_candidates !== false;

  if (!enabled) {
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: "morning_backlog_disabled" }),
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

    const leads = await listRecentInterestLeads(env, uid, lookbackHours);
    const marked = [];
    const skipped = [];

    for (const lead of leads || []) {
      const phone = digits(lead.phone || "");
      const desc = String(lead.description || "");
      if (/estado:\s*candidato_retomar_pedido/i.test(desc)) {
        skipped.push({ lead_id: lead.id, reason: "already_candidate" });
        continue;
      }
      if (/estado:\s*(retoma_enviada|presupuesto|ganado|perdido)/i.test(desc)) {
        skipped.push({ lead_id: lead.id, reason: "terminal_or_progress" });
        continue;
      }
      if (!markRetoma) {
        skipped.push({ lead_id: lead.id, reason: "mark_disabled" });
        continue;
      }
      const win = await conversationOutside24h(env, phone);
      if (win.unknown || !win.outside) {
        skipped.push({
          lead_id: lead.id,
          reason: win.unknown ? "window_unknown" : "inside_24h_or_ball_customer",
        });
        continue;
      }
      marked.push(await markCandidatoRetoma(env, uid, lead));
    }

    return new Response(
      JSON.stringify({
        ok: true,
        at: new Date().toISOString(),
        lookback_hours: lookbackHours,
        scanned: (leads || []).length,
        marked_candidato_retoma: marked,
        skipped,
        note: "No WA enviado. Staff usa ENVIAR RETOMAR / tool enviar_retomar_pedido.",
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
