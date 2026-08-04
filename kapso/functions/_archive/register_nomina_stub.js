async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const employeeName = String(vars?.nomina?.employee_name || "").trim();
  const period = String(vars?.nomina?.period || "").trim();
  const amount = Number(vars?.nomina?.amount_cop || 0);

  return new Response(
    JSON.stringify({
      vars: {
        nomina: {
          ...vars.nomina,
          status: "queued",
          registered_at: now,
          reference: `NOM-${Date.now().toString(36).toUpperCase()}`,
        },
        service: {
          last_call_name: "register_nomina_stub",
          last_call_status: "ready",
          last_call_at: now,
          fallback_message: null,
        },
      },
      status: "ready",
      message: employeeName
        ? `Nómina en cola: ${employeeName}`
        : "Nómina en cola de procesamiento",
      summary: { employeeName, period, amount },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
