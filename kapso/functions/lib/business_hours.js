/**
 * Horario comercial Life Deportes (America/Bogota).
 * Lun–vie 8:00–17:00, sáb 8:00–14:00. Dom + festivos = off_hours.
 *
 * Festivos: pasar optional `holidayDates` Set "YYYY-MM-DD" cuando exista calendario.
 */
const BOGOTA_TZ = "America/Bogota";

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
  const ymd = `${map.year}-${map.month}-${map.day}`;
  return {
    weekday: map.weekday,
    ymd,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
  };
}

function isWeekday(name) {
  return !["Saturday", "Sunday"].includes(name);
}

export function resolveBusinessHours(now = new Date(), options = {}) {
  const holidays = options.holidayDates || options.holidays || new Set();
  const { weekday, ymd, minutesOfDay } = bogotaParts(now);

  if (holidays.has(ymd) || weekday === "Sunday") {
    return buildResult(false, "off_hours", "domingo o festivo", now);
  }

  if (weekday === "Saturday") {
    const open = minutesOfDay >= 8 * 60 && minutesOfDay < 14 * 60;
    return buildResult(
      open,
      open ? "in_hours" : "off_hours",
      open ? "sábado en horario" : "sábado fuera de horario",
      now
    );
  }

  if (isWeekday(weekday)) {
    const open = minutesOfDay >= 8 * 60 && minutesOfDay < 17 * 60;
    return buildResult(
      open,
      open ? "in_hours" : "off_hours",
      open ? "entre semana en horario" : "entre semana fuera de horario",
      now
    );
  }

  return buildResult(false, "off_hours", "fuera de horario", now);
}

function buildResult(businessHours, businessMode, reason, now) {
  return {
    business_hours: businessHours,
    business_mode: businessMode,
    timezone: BOGOTA_TZ,
    reason,
    checked_at: now.toISOString(),
    next_open_hint: businessHours ? null : computeNextOpenHint(now),
    copy_key: businessMode === "in_hours" ? "cierre_in_hours" : "cierre_off_hours",
  };
}

function computeNextOpenHint(now) {
  // Heurística simple para mensajes al cliente (sin calendario festivo).
  const { weekday, minutesOfDay } = bogotaParts(now);
  if (weekday === "Saturday" && minutesOfDay >= 14 * 60) {
    return "lunes 8:00 a.m.";
  }
  if (weekday === "Sunday") {
    return "lunes 8:00 a.m.";
  }
  if (minutesOfDay >= 17 * 60) {
    if (weekday === "Friday") return "sábado 8:00 a.m.";
    return "mañana 8:00 a.m.";
  }
  if (minutesOfDay < 8 * 60) {
    return "hoy 8:00 a.m.";
  }
  return "próximo día hábil 8:00 a.m.";
}

export { bogotaParts, BOGOTA_TZ };
