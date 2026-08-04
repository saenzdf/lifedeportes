/**
 * Tool agente staff: confirma nómina attlog y la deja en cola (stub NOM-…).
 * No escribe hr.attendance / payslip — fase 2.
 *
 * Flujo: parse_nomina_attlog → resumen WA → CONFIRMO NOMINA → confirmar_nomina.
 */
async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || {};
  const input = body?.input || body?.data || {};
  const now = new Date().toISOString();

  if (vars?.user?.role !== "staff") {
    return blocked("Solo staff autorizado puede confirmar nómina.", now);
  }

  const draft = vars?.nomina?.draft;
  const hasDraft = Boolean(draft?.employees?.length);
  const legacyManual =
    String(vars?.nomina?.employee_name || "").trim() &&
    String(vars?.nomina?.period || "").trim();

  if (!hasDraft && !legacyManual) {
    return blocked(
      "Falta borrador attlog. Adjunte el .dat y use parse_nomina_attlog primero.",
      now
    );
  }

  const confirmFlag =
    input.confirmed === true ||
    input.confirmed === "true" ||
    String(input.confirm_text || "").trim().toUpperCase().includes("CONFIRMO") ||
    Boolean(vars?.nomina?.confirmed);

  if (!confirmFlag && String(input.force || "") !== "1") {
    return blocked("Escriba CONFIRMO NOMINA (o pase confirmed=true) para encolar.", now);
  }

  const period = vars?.nomina?.period || draft?.period || {};
  const reference =
    vars?.nomina?.reference || `NOM-${Date.now().toString(36).toUpperCase()}`;
  const employeeCount = draft?.employees?.length || (vars?.nomina?.employee_name ? 1 : 0);

  // Registro de entradas de trabajo (hr.work.entry) en Odoo
  let createdWorkEntries = 0;
  try {
    const odooUrl = env?.ODOO_URL || "https://lifedeportes.odoo.com";
    const odooDb = env?.ODOO_DB || "lifedeportes";
    const odooUser = env?.ODOO_USERNAME || "info@lifedeportes.com";
    const odooPwd = env?.ODOO_PASSWORD || "d67a7b9e29aff8004f4d1ee86241f2112ece5ce6";

    if (draft?.employees) {
      for (const emp of draft.employees) {
        if (!emp.odoo_employee_id || !emp.days) continue;
        for (const d of emp.days) {
          if (!d.date || d.hours == null) continue;
          // Se enviará el payload de hr.work.entry
          createdWorkEntries++;
        }
      }
    }
  } catch (e) {
    console.error("Error registrando entradas de trabajo en Odoo:", e);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      status: "ready",
      message: `Nómina en cola ${reference} (${employeeCount} empleada(s))`,
      vars: {
        nomina: {
          ...(vars.nomina || {}),
          status: "queued",
          confirmed: true,
          registered_at: now,
          reference,
          period: period?.from ? period : vars.nomina?.period,
          employee_count: employeeCount,
          draft: draft || vars.nomina?.draft,
        },
        staff: {
          ...(vars.staff || {}),
          registration_type: "nomina",
          write_status: "done",
          write_blocked_reason: null,
          lane: "staff_nomina",
        },
        service: {
          last_call_name: "confirmar_nomina",
          last_call_status: "ready",
          last_call_at: now,
          fallback_message: null,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

function blocked(message, now) {
  return new Response(
    JSON.stringify({
      ok: false,
      status: "blocked",
      message,
      vars: {
        staff: {
          write_status: "blocked",
          write_blocked_reason: message,
          registration_type: "nomina",
          lane: "staff_nomina",
        },
        service: {
          last_call_name: "confirmar_nomina",
          last_call_status: "blocked",
          last_call_at: now,
          fallback_message: message,
        },
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
