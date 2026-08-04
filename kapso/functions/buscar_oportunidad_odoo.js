/**
 * buscar-oportunidad-odoo — staff retoma CRM creado a mano (Canal Ventas / Asistente Kapso).
 *
 * Input: name | phone | lead_id | query (texto libre del hilo)
 * Output: vars.lead.id + vars.crm.opportunity_id para que odoo-create-lead-and-so reutilice.
 *
 * Secrets: ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD
 */

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function stripOppPrefix(name) {
  return compact(name).replace(/^oportunidad\s+de\s+/i, "").trim();
}

function normalizeTeamKey(name) {
  return stripOppPrefix(name)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
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

function extractFromThread(body) {
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const msgs = body?.whatsapp_context?.messages || [];
  const texts = [];
  for (const m of [...msgs].reverse().slice(0, 8)) {
    const t =
      (typeof m?.text === "string" && m.text) ||
      m?.text?.body ||
      m?.kapso?.content ||
      "";
    if (t) texts.push(String(t));
  }
  const blob = [input.query, input.name, vars?.staff?.last_inbound_text, ...texts]
    .filter(Boolean)
    .join("\n");

  const idMatch = blob.match(/\b(?:opp|oportunidad|lead|crm)\s*#?\s*(\d{3,5})\b/i);
  const phoneMatch = blob.match(/\+?57\s*\d[\d\s-]{8,14}|\b3\d{9}\b/);
  // "retomar CHINO" / "oportunidad ACEROS" / "presupuesto de Emmanuelle" / "completar LEMUS"
  const nameMatch = blob.match(
    /(?:(?:haz|has|hace|crear?|crea|subir|pasa(?:r)?)\s+(?:el\s+)?presupuesto(?:\s+(?:de|del|para))?|(?:presupuesto|propuesta)\s+(?:de|del|para)|retomar|completar|seguir|llenar|oportunidad(?:\s+de)?|cliente)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s.&_-]{1,48})/i
  );

  return {
    lead_id: Number(input.lead_id || input.opportunity_id || vars?.lead?.id || vars?.crm?.opportunity_id || (idMatch && idMatch[1]) || 0) || null,
    name: compact(input.name || input.customer_name || (nameMatch && nameMatch[1]) || ""),
    phone: compact(input.phone || input.customer_phone || (phoneMatch && phoneMatch[0]) || ""),
    query: compact(input.query || ""),
  };
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  if (vars?.user?.role && vars.user.role !== "staff") {
    return json({ ok: false, error: "staff_only" }, 403);
  }

  if (!env.ODOO_URL || !env.ODOO_DB || !env.ODOO_USERNAME || !env.ODOO_PASSWORD) {
    return json({ ok: false, error: "missing_odoo_secrets" }, 500);
  }

  const resolved = extractFromThread(body);
  try {
    const uid = await odooJsonRpc(env, "common", "authenticate", [
      env.ODOO_DB,
      env.ODOO_USERNAME,
      env.ODOO_PASSWORD,
      {},
    ]);
    if (!uid) return json({ ok: false, error: "odoo_auth_failed" }, 500);

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

    const fields = [
      "id",
      "name",
      "phone",
      "partner_id",
      "stage_id",
      "expected_revenue",
      "description",
      "order_ids",
      "won_status",
    ];

    let hits = [];

    if (resolved.lead_id) {
      const rows = await executeKw(
        "crm.lead",
        "search_read",
        [[["id", "=", resolved.lead_id], ["type", "=", "opportunity"]]],
        { fields, limit: 1, context: { active_test: false } }
      );
      hits = rows || [];
    }

    if (!hits.length && (resolved.name || resolved.phone || resolved.query)) {
      const needle = stripOppPrefix(resolved.name || resolved.query);
      const phoneDigits = digitsOnly(resolved.phone);
      const local10 = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : "";
      const domain = [
        ["type", "=", "opportunity"],
        ["active", "=", true],
        ["won_status", "=", "pending"],
      ];
      const or = [];
      if (needle) {
        or.push(["name", "ilike", needle]);
        or.push(["name", "ilike", `Oportunidad de ${needle}`]);
        or.push(["partner_id.name", "ilike", needle]);
      }
      if (local10) {
        or.push(["phone", "ilike", local10]);
      }
      if (or.length === 1) domain.push(or[0]);
      else if (or.length > 1) {
        domain.push(...Array(or.length - 1).fill("|"), ...or);
      }
      hits = await executeKw("crm.lead", "search_read", [domain], {
        fields,
        limit: 8,
        order: "write_date desc",
      });

      // Prefer exact team key match
      if (needle && hits.length > 1) {
        const key = normalizeTeamKey(needle);
        const exact = hits.filter((h) => normalizeTeamKey(h.name) === key);
        if (exact.length) hits = exact;
      }
    }

    if (!hits.length) {
      return json({
        ok: false,
        status: "not_found",
        message:
          "No encontré oportunidad abierta. Indique nombre (ej. CHINO), teléfono o id CRM.",
        resolved,
      });
    }

    const primary = hits[0];
    const stageName = Array.isArray(primary.stage_id) ? primary.stage_id[1] : "";
    const partnerName = Array.isArray(primary.partner_id) ? primary.partner_id[1] : "";
    const hasOrders = Array.isArray(primary.order_ids) && primary.order_ids.length > 0;
    const brief = String(primary.description || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);

    const mapped = hits.map((h) => ({
      lead_id: h.id,
      name: h.name,
      phone: h.phone || null,
      partner: Array.isArray(h.partner_id) ? h.partner_id[1] : null,
      partner_id: Array.isArray(h.partner_id) ? h.partner_id[0] : null,
      stage: Array.isArray(h.stage_id) ? h.stage_id[1] : null,
      stage_id: Array.isArray(h.stage_id) ? h.stage_id[0] : null,
      expected_revenue: h.expected_revenue || 0,
      has_orders: Array.isArray(h.order_ids) && h.order_ids.length > 0,
      order_ids: h.order_ids || [],
      url: `${String(env.ODOO_URL || "").replace(/\/$/, "")}/odoo/crm/${h.id}`,
    }));

    const displayName =
      stripOppPrefix(primary.name) || partnerName || compact(primary.name);

    return json({
      ok: true,
      status: "ready",
      message: `${primary.name} · ${stageName}${hasOrders ? " · ya tiene SO" : " · sin presupuesto"}`,
      opportunities: mapped,
      vars: {
        lead: {
          id: primary.id,
          name: primary.name,
          phone: primary.phone || null,
          partner_id: Array.isArray(primary.partner_id) ? primary.partner_id[0] : null,
        },
        crm: {
          opportunity_id: primary.id,
          opportunity_name: primary.name,
          stage: stageName,
          partner_name: partnerName,
          has_orders: hasOrders,
          brief_preview: brief || null,
        },
        // Nombre listo para validate/writer — no pedir de nuevo si la opp ya existe.
        quote: {
          customer_display_name: displayName,
        },
        order_draft: {
          customer_display_name: displayName,
        },
        order_session: {
          display_name: displayName,
          odoo_lead_id: primary.id,
        },
        service: {
          last_call_name: "buscar_oportunidad_odoo",
          last_call_status: "ready",
          last_call_at: now,
          fallback_message: null,
        },
      },
    });
  } catch (err) {
    return json({
      ok: false,
      error: "odoo_error",
      message: String(err?.message || err).slice(0, 240),
    });
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
