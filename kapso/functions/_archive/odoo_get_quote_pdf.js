async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const input = body?.input || {};
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const orderId = Number(input.order_id || vars?.order?.id || 0);
  const orderName = String(input.order_name || vars?.order?.name || "").trim();
  const ODOO_URL = env.ODOO_URL;

  if (!ODOO_URL) {
    return errorResponse(500, "Missing ODOO_URL.", now);
  }
  if (!orderId && !orderName) {
    return errorResponse(400, "Missing order_id/order_name for quote PDF.", now);
  }

  const byIdUrl = orderId ? `${ODOO_URL}/report/pdf/sale.report_saleorder/${orderId}` : null;
  const byNameUrl = orderName
    ? `${ODOO_URL}/report/pdf/sale.report_saleorder/${encodeURIComponent(orderName)}`
    : null;

  return new Response(
    JSON.stringify({
      vars: {
        quote: {
          pdf_url: byIdUrl || byNameUrl,
          pdf_generated_at: now,
        },
        order: {
          quote_pdf_url: byIdUrl || byNameUrl,
        },
        service: {
          last_call_name: "odoo_get_quote_pdf",
          last_call_status: "ready",
          last_call_at: now,
          fallback_message: null,
        },
      },
      status: "ready",
      message: "URL del PDF nativo de cotizacion lista para envio al cliente.",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

function errorResponse(status, message, now) {
  return new Response(
    JSON.stringify({
      vars: {
        service: {
          last_call_name: "odoo_get_quote_pdf",
          last_call_status: "error",
          last_call_at: now,
          fallback_message:
            "No pude adjuntar el PDF ahora mismo. Te compartimos el numero de cotizacion mientras tanto.",
        },
      },
      status: "error",
      message,
    }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
