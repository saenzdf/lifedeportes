/**
 * ensure-crm-from-quote — seed determinista de oportunidad CRM (Asistente Kapso).
 *
 * Corre en el grafo ANTES del Agent Vendedor (tras debounce cliente).
 * Si vars.quote ya tiene interés/payload y no hay lead, siembra crm.lead.
 * No envía WhatsApp. No bloquea el turno: siempre deja pasar al agente.
 *
 * Secrets: ODOO_*, LIFE_CRM_SEED_ENABLED
 */

// --- LIFE_CRM_GATE_INLINE_START ---
function shouldSeedCrmOpportunity() {
  return { ok: false, reason: "gate_not_inlined" };
}
function buildOrderSummaryFromQuote() {
  return "";
}
// --- LIFE_CRM_GATE_INLINE_END ---

// --- LIFE_CRM_SEED_INLINE_START ---
async function seedCrmOpportunityFromQuote() {
  return { ok: false, error: "seed_not_inlined" };
}
// --- LIFE_CRM_SEED_INLINE_END ---

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function lastInboundText(body, vars) {
  const msgs = body?.whatsapp_context?.messages || vars?.context?.recent_inbound || [];
  if (Array.isArray(msgs) && msgs.length) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      const dir = m?.kapso?.direction || m?.direction || "";
      if (dir && dir !== "inbound") continue;
      const t =
        m?.kapso?.content ||
        m?.text?.body ||
        m?.text ||
        m?.body ||
        "";
      if (compact(t)) return compact(t);
    }
  }
  return compact(
    vars?.context?.last_inbound_text ||
      body?.whatsapp_context?.conversation?.kapso?.last_message_text ||
      ""
  );
}

function parseIfString(val) {
  if (!val) return {};
  if (typeof val === "object") return val;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch (e) {
      try {
        const normalized = val.replace(/=>/g, ":").replace(/\bnil\b/g, "null");
        return JSON.parse(normalized);
      } catch (e2) {
        return {};
      }
    }
  }
  return {};
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || body?.vars || {};
  const whatsapp = body?.whatsapp_context || {};
  const now = new Date().toISOString();
  const quote = parseIfString(vars.quote);

  const alreadyId =
    Number(vars.crm?.opportunity_id || vars.lead?.id || quote.crm_opportunity_id || 0) || 0;

  // --- Sync improvement: update existing lead when quote revision changes ---
  if (alreadyId > 0) {
    const quoteRevision = Number(quote.revision || 0) || 0;
    const lastSyncedRevision = Number(vars.crm?.last_synced_revision || 0) || 0;

    // No revision change → skip (nothing to update)
    if (quoteRevision > 0 && quoteRevision <= lastSyncedRevision) {
      return new Response(
        JSON.stringify({
          vars: {
            crm_seed_ensure: {
              at: now,
              skipped: true,
              reason: "already_has_lead",
              opportunity_id: alreadyId,
              quote_revision: quoteRevision,
              last_synced_revision: lastSyncedRevision,
            },
          },
          status: "ready",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Revision changed (or no last_synced_revision) → update existing lead
    const customerPhone = digits(
      vars.user?.wa_id ||
        vars.user?.phone ||
        whatsapp?.conversation?.phone_number ||
        quote.phone ||
        ""
    );
    const customerName = compact(
      quote.customer_display_name ||
        quote.customer_name ||
        quote.team_name ||
        vars.user?.explicit_name ||
        vars.user?.name ||
        whatsapp?.conversation?.contact_name ||
        ""
    );
    const conversationId = compact(
      whatsapp?.conversation?.id || vars.kapso?.conversation_id || ""
    );

    quote.status =
      quote.status && !/cotizando/i.test(String(quote.status))
        ? quote.status
        : "interes_confirmado";

    let updateResult;
    try {
      updateResult = await seedCrmOpportunityFromQuote(env, {
        quote,
        customerPhone,
        customerName,
        whatsappName: compact(whatsapp?.conversation?.contact_name || vars.user?.name || ""),
        conversationId,
        leadId: alreadyId,
        statusOverride: quote.status,
        fingerprint:
          vars.sales_notify?.fingerprint ||
          `ensure:${customerPhone}:${conversationId.slice(0, 8) || "na"}`,
        source: "ensure_crm_from_quote_update",
      });
    } catch (err) {
      updateResult = { ok: false, error: String(err?.message || err).slice(0, 300) };
    }

    const updatedLeadId = Number(updateResult?.lead_id || updateResult?.opportunity_id || alreadyId) || alreadyId;

    return new Response(
      JSON.stringify({
        vars: {
          quote: {
            ...quote,
            crm_opportunity_id: updatedLeadId,
            status: quote.status,
          },
          crm: {
            ...(vars.crm || {}),
            opportunity_id: updatedLeadId,
            last_synced_revision: quoteRevision || vars.crm?.last_synced_revision || 0,
            synced_by: "ensure_crm_from_quote_update",
            synced_at: now,
            update_result: updateResult,
          },
          lead: { id: updatedLeadId, ...(vars.lead || {}) },
          crm_seed_ensure: {
            at: now,
            skipped: false,
            reason: "updated_existing_lead",
            opportunity_id: updatedLeadId,
            quote_revision: quoteRevision,
            previous_synced_revision: lastSyncedRevision,
            result: updateResult,
            summary: buildOrderSummaryFromQuote(quote),
          },
        },
        status: "ready",
        message: updateResult?.ok
          ? `CRM updated #${updatedLeadId} (rev ${quoteRevision})`
          : `CRM update fail: ${updateResult?.error || "unknown"} — kept #${updatedLeadId}`,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const customerPhone = digits(
    vars.user?.wa_id ||
      vars.user?.phone ||
      whatsapp?.conversation?.phone_number ||
      quote.phone ||
      ""
  );
  const conversationId = compact(
    whatsapp?.conversation?.id || vars.kapso?.conversation_id || ""
  );
  const customerName = compact(
    quote.customer_display_name ||
      quote.customer_name ||
      quote.team_name ||
      vars.user?.explicit_name ||
      vars.user?.name ||
      whatsapp?.conversation?.contact_name ||
      ""
  );
  const lastText = lastInboundText(body, vars);

  const gate = shouldSeedCrmOpportunity({
    quote,
    note: quote.notes || "",
    lastCustomerText: lastText,
  });

  if (!gate.ok) {
    return new Response(
      JSON.stringify({
        vars: {
          crm_seed_ensure: {
            at: now,
            skipped: true,
            reason: gate.reason,
            message_es: gate.message_es || null,
          },
        },
        status: "ready",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  if (!customerPhone) {
    return new Response(
      JSON.stringify({
        vars: {
          crm_seed_ensure: {
            at: now,
            skipped: true,
            reason: "no_phone",
          },
        },
        status: "ready",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  quote.status =
    quote.status && !/cotizando/i.test(String(quote.status))
      ? quote.status
      : "interes_confirmado";

  let result;
  try {
    result = await seedCrmOpportunityFromQuote(env, {
      quote,
      customerPhone,
      customerName,
      whatsappName: compact(whatsapp?.conversation?.contact_name || vars.user?.name || ""),
      conversationId,
      statusOverride: quote.status,
      fingerprint:
        vars.sales_notify?.fingerprint ||
        `ensure:${customerPhone}:${conversationId.slice(0, 8) || "na"}`,
      source: "ensure_crm_from_quote",
    });
  } catch (err) {
    result = { ok: false, error: String(err?.message || err).slice(0, 300) };
  }

  const leadId = Number(result?.lead_id || result?.opportunity_id || 0) || null;

  return new Response(
    JSON.stringify({
      vars: {
        quote: {
          ...quote,
          crm_opportunity_id: leadId || quote.crm_opportunity_id || null,
          status: quote.status,
        },
        crm: {
          ...(vars.crm || {}),
          opportunity_id: leadId || vars.crm?.opportunity_id || null,
          seeded_by: "ensure_crm_from_quote",
          seeded_at: now,
          gate: gate.reason,
          result,
        },
        lead: leadId
          ? { id: leadId, ...(vars.lead || {}) }
          : vars.lead || undefined,
        crm_seed_ensure: {
          at: now,
          skipped: false,
          gate: gate.reason,
          result,
          summary: buildOrderSummaryFromQuote(quote),
        },
      },
      status: "ready",
      message: result?.ok
        ? `CRM seed #${leadId || "?"}`
        : `CRM ensure skip/fail: ${result?.error || result?.reason || "unknown"}`,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

{ handler };
