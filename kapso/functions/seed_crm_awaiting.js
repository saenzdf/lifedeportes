/**
 * seed-crm-awaiting — prueba / barrido: crea crm.lead desde payload de conversación en espera.
 *
 * Invoke (API key Kapso):
 * POST /platform/v1/functions/<id>/invoke
 * {
 *   "phone": "3000000016",
 *   "conversation_id": "uuid",
 *   "customer_name": "Emily Zuluaga",
 *   "team_name": "Emily Zuluaga",
 *   "quote": {
 *     "product_text": "camiseta dry-fit",
 *     "quantity": 23,
 *     "unit_cop": 30000,
 *     "total_cop": 690000,
 *     "notes": "...",
 *     "media_refs": [{ "url": "https://...", "filename": "diseño_1.jpeg" }],
 *     "date_deadline": "2026-07-31",
 *     "status": "esperando_lista_abono"
 *   },
 *   "fingerprint": "awaiting:3000000016:2026-07-27"
 * }
 *
 * Secrets: ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, LIFE_CRM_SEED_ENABLED
 */

// --- LIFE_CRM_SEED_INLINE_START ---
/* inlined at deploy time by deploy_seed_crm_awaiting.js — placeholder */
async function seedCrmOpportunityFromQuote() {
  return { ok: false, error: "seed_not_inlined" };
}
// --- LIFE_CRM_SEED_INLINE_END ---

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || body || {};

  if (input.dry_run === true || body.dry_run === true) {
    return new Response(
      JSON.stringify({
        ok: true,
        dry_run: true,
        would_seed: {
          phone: input.phone || null,
          team_name: input.team_name || input.customer_name || null,
          quote: input.quote || null,
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const quote = input.quote && typeof input.quote === "object" ? { ...input.quote } : {};
  if (input.team_name) quote.team_name = input.team_name;
  if (input.description_html) quote.description_html = input.description_html;
  if (Array.isArray(input.media_refs)) quote.media_refs = input.media_refs;

  const result = await seedCrmOpportunityFromQuote(env, {
    quote,
    customerPhone: input.phone || input.customer_phone || quote.phone || "",
    customerName: input.customer_name || input.team_name || quote.team_name || "",
    conversationId: input.conversation_id || input.conversationId || "",
    statusOverride: quote.status || input.status || "esperando_respuesta",
    fingerprint:
      input.fingerprint ||
      `awaiting:${String(input.phone || "").replace(/\D/g, "")}:${(input.conversation_id || "").slice(0, 8)}`,
    source: input.source || "seed_crm_awaiting",
  });

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}
