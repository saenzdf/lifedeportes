/**
 * end-quiet-customer — hoja silenciosa del carril cliente.
 *
 * Prefill Ads / spam tras debounce: el decide `route-customer-burst-resume`
 * manda edge `end` aquí. Sin outgoing → la ejecución termina (ended),
 * no loop_guard en wait_customer_burst.
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || body?.vars || {};
  return new Response(
    JSON.stringify({
      vars: {
        service: {
          ...(vars.service || {}),
          last_call_name: "end_quiet_customer",
          last_call_status: "ready",
          last_call_at: new Date().toISOString(),
          quiet_end: true,
        },
      },
      status: "ready",
      message: "quiet_end_ads_or_spam",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
