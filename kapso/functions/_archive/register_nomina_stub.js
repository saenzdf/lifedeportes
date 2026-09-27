// ARCHIVED 2026-09-16 — retirada del carril Kapso (Life Deportes)
// function: register-nomina-stub  id: 481fa039-0368-4983-bf44-6839cc29da42
// ultimo deploy: 2026-07-05T20:47:40-04:00  status: deployed
// motivo: nómina legacy (stub)
// Restaurar: recrear la function en Kapso con este código y volver a cablearla.

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  const draft = vars?.nomina?.draft || {};
  const period = vars?.nomina?.period || draft?.period || {};
  const reference = vars?.nomina?.reference || `NOM-${Date.now().toString(36).toUpperCase()}`;
  const employeeCount = draft?.employees?.length || (vars?.nomina?.employee_name ? 1 : 0);

  return new Response(
    JSON.stringify({
      vars: {
        nomina: {
          ...vars.nomina,
          status: "queued",
          confirmed: true,
          registered_at: now,
          reference,
          period: period?.from ? period : vars.nomina?.period,
          employee_count: employeeCount,
        },
        staff: {
          ...(vars.staff || {}),
          registration_type: "nomina",
          write_status: "done",
        },
        service: {
          last_call_name: "register_nomina_stub",
          last_call_status: "ready",
          last_call_at: now,
          fallback_message: null,
        },
      },
      status: "ready",
      message: `Nómina en cola (${employeeCount} empleada(s))`,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
