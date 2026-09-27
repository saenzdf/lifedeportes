/**
 * resolve-business-hours — Reloj comercial + ventanas de envío.
 *
 * Corre al inicio del carril cliente. Escribe vars.service.*:
 *   business_mode     — in_hours / off_hours (hoy mismo vs mañana)
 *   customer_send_ok  — 06:00–22:00 todos los días (vendedor)
 *   staff_notify_ok   — 08:00–18:00 lun–sáb
 *
 * Horario comercial Life (America/Bogota):
 *   Lun–Vie  8:30–17:00
 *   Sáb      8:30–14:00
 *   Dom + festivos = off_hours
 */

const BOGOTA_TZ = "America/Bogota";
const COMMERCIAL_OPEN_MIN = 8 * 60 + 30; // 8:30 a.m.

function bogotaParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BOGOTA_TZ,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const hour = Number(map.hour);
  const minute = Number(map.minute);
  return {
    weekday: map.weekday,
    ymd: `${map.year}-${map.month}-${map.day}`,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
  };
}

function customerSendOk(now) {
  const { minutesOfDay } = bogotaParts(now);
  return minutesOfDay >= 6 * 60 && minutesOfDay < 22 * 60;
}

function staffNotifyOk(now) {
  const { weekday, minutesOfDay } = bogotaParts(now);
  if (weekday === "Sunday") return false;
  return minutesOfDay >= 8 * 60 && minutesOfDay < 18 * 60;
}

function nextCustomerSendHint(now) {
  const { minutesOfDay } = bogotaParts(now);
  if (minutesOfDay >= 22 * 60) return "mañana 6:00 a.m.";
  if (minutesOfDay < 6 * 60) return "hoy 6:00 a.m.";
  return null;
}

function computeNextOpenHint(now) {
  const { weekday, minutesOfDay } = bogotaParts(now);
  if (weekday === "Saturday" && minutesOfDay >= 14 * 60) return "lunes 8:30 a.m.";
  if (weekday === "Sunday") return "lunes 8:30 a.m.";
  if (minutesOfDay >= 17 * 60) {
    if (weekday === "Friday") return "sábado 8:30 a.m.";
    return "mañana 8:30 a.m.";
  }
  if (minutesOfDay < COMMERCIAL_OPEN_MIN) return "hoy 8:30 a.m.";
  return "próximo día hábil 8:30 a.m.";
}

async function handler(request, env) {
  const body = await request.json().catch(() => ({}));
  const vars = body?.execution_context?.vars || body?.vars || {};
  const now = new Date();

  // Allow override from vars (e.g. test or manual set)
  const sendOk = customerSendOk(now);
  const notifyOk = staffNotifyOk(now);

  const override = vars?.service?.business_mode_override;
  if (override && override !== "auto") {
    const inHours = override === "in_hours";
    return new Response(
      JSON.stringify({
        vars: {
          service: {
            ...(vars.service || {}),
            business_hours: inHours,
            business_mode: inHours ? "in_hours" : "off_hours",
            business_hours_label: inHours ? "horario comercial" : "fuera de horario",
            timezone: BOGOTA_TZ,
            next_open_hint: inHours ? null : computeNextOpenHint(now),
            customer_send_ok: sendOk,
            staff_notify_ok: notifyOk,
            next_customer_send_hint: sendOk ? null : nextCustomerSendHint(now),
            checked_at: now.toISOString(),
            source: "override",
          },
        },
        status: "ready",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const { weekday, minutesOfDay } = bogotaParts(now);

  let inHours = false;
  let reason = "";

  if (weekday === "Sunday") {
    inHours = false;
    reason = "domingo";
  } else if (weekday === "Saturday") {
    inHours = minutesOfDay >= COMMERCIAL_OPEN_MIN && minutesOfDay < 14 * 60;
    reason = inHours ? "sábado en horario" : "sábado fuera de horario";
  } else {
    // Mon–Fri
    inHours = minutesOfDay >= COMMERCIAL_OPEN_MIN && minutesOfDay < 17 * 60;
    reason = inHours ? "entre semana en horario" : "entre semana fuera de horario";
  }

  return new Response(
    JSON.stringify({
      vars: {
        service: {
          ...(vars.service || {}),
          business_hours: inHours,
          business_mode: inHours ? "in_hours" : "off_hours",
          business_hours_label: inHours ? "horario comercial" : "fuera de horario",
          timezone: BOGOTA_TZ,
          reason,
          next_open_hint: inHours ? null : computeNextOpenHint(now),
          customer_send_ok: sendOk,
          staff_notify_ok: notifyOk,
          next_customer_send_hint: sendOk ? null : nextCustomerSendHint(now),
          checked_at: now.toISOString(),
          copy_key: inHours ? "cierre_in_hours" : "cierre_off_hours",
          source: "resolve-business-hours",
        },
      },
      status: "ready",
      message: inHours ? "in_hours" : "off_hours",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

{ handler };
