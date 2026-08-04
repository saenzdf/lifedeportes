/**
 * snapshot_upload_fidelity — congela borrador Kapso tras odoo-create (KPI).
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const kapso_snapshot = buildKapsoSnapshot(vars, now);
  const order = vars.order || {};

  const fidelity = {
    ...(vars.fidelity || {}),
    kapso_snapshot,
    odoo_order_id: order.id || null,
    odoo_order_name: order.name || null,
    uploaded_at: now,
    pass_clean: null,
    retention_pct: null,
    correction_burden: null,
    last_compared_at: null,
  };

  return new Response(
    JSON.stringify({
      ok: true,
      message: `Snapshot fidelidad guardado${order.name ? ` para ${order.name}` : ""}.`,
      vars: {
        fidelity,
        service: {
          last_call_name: "snapshot_upload_fidelity",
          last_call_status: "ready",
          last_call_at: now,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

function compact(v) {
  if (v == null) return "";
  return String(v).trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildKapsoSnapshot(vars, now) {
  const orderDraft = vars.order_draft || {};
  const quote = vars.quote || {};
  const draft = quote.draft_payload || {};
  const resolved =
    orderDraft.commercial?.resolved_lines ||
    draft.resolved_lines ||
    draft.rows ||
    orderDraft.commercial?.lines ||
    [];

  return {
    schema_version: "fidelity_kapso_v1",
    uploaded_at: now,
    upload_source: vars.staff?.upload_source || null,
    fingerprint: orderDraft.write?.fingerprint || vars.staff?.confirmation_fingerprint || null,
    product_text: quote.product_text || draft.product_text || null,
    quantity: quote.quantity || draft.quantity || null,
    customer_wa_id: quote.customer_wa_id || draft.customer_wa_id || null,
    customer_display_name: quote.customer_display_name || draft.customer_display_name || null,
    resolved_lines: Array.isArray(resolved)
      ? resolved.map((line) => ({
          product_variant_id: num(line.product_variant_id || line.odoo_product_id || line.product_id),
          product_text: compact(line.product_text || line.product_base || line.name),
          quantity: num(line.quantity),
          unit_cop: num(line.unit_cop || line.price_unit),
          attributes: line.attributes || null,
          category: line.category || null,
        }))
      : [],
  };
}
