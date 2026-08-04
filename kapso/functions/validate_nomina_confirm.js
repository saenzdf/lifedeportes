async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const now = new Date().toISOString();

  if (vars?.user?.role !== "staff") {
    return blocked("Solo staff autorizado puede registrar nómina.", now);
  }

  const confirmed = Boolean(vars?.nomina?.confirmed);
  const draft = vars?.nomina?.draft;
  const hasDraft = Boolean(draft?.employees?.length);
  const legacyManual =
    String(vars?.nomina?.employee_name || "").trim() &&
    String(vars?.nomina?.period || "").trim();

  if (!confirmed) {
    return blocked("Falta confirmacion (nomina.confirmed = true). Escriba CONFIRMO NOMINA.", now);
  }
  if (!hasDraft && !legacyManual) {
    return blocked("Falta borrador attlog o datos manuales de nomina.", now);
  }

  return ok(now, vars);
}

function ok(now, vars) {
  return new Response(
    JSON.stringify({
      vars: {
        staff: {
          ...(vars?.staff || {}),
          write_status: "ok",
          write_blocked_reason: null,
          registration_type: "nomina",
        },
        service: {
          last_call_name: "validate_nomina_confirm",
          last_call_status: "ready",
          last_call_at: now,
          fallback_message: null,
        },
      },
      status: "ready",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

function blocked(message, now) {
  return new Response(
    JSON.stringify({
      vars: {
        staff: {
          write_status: "blocked",
          write_blocked_reason: message,
          registration_type: "nomina",
        },
        service: {
          last_call_name: "validate_nomina_confirm",
          last_call_status: "blocked",
          last_call_at: now,
          fallback_message: message,
        },
      },
      status: "blocked",
      message,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
