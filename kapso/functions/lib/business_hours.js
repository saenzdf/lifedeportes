/**
 * Horario comercial + ventanas de envío Life Deportes (America/Bogota).
 *
 * Comercial (in_hours / off_hours): lun–vie 8:30–17:00, sáb 8:30–14:00.
 * Envío vendedor al cliente: 06:00–22:00 todos los días.
 * Staff proactivo: 08:00–18:00 lun–sáb.
 */
const BOGOTA_TZ = "America/Bogota";
const COMMERCIAL_OPEN_MIN = 8 * 60 + 30; // 8:30

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

export function customerSendOk(now = new Date()) {
  const { minutesOfDay } = bogotaParts(now);
  return minutesOfDay >= 6 * 60 && minutesOfDay < 22 * 60;
}

export function staffNotifyOk(now = new Date()) {
  const { weekday, minutesOfDay } = bogotaParts(now);
  if (weekday === "Sunday") return false;
  return minutesOfDay >= 8 * 60 && minutesOfDay < 18 * 60;
}

export function resolveBusinessHours(now = new Date(), options = {}) {
  const holidays = options.holidayDates || options.holidays || new Set();
  const { weekday, ymd, minutesOfDay } = bogotaParts(now);

  if (holidays.has(ymd) || weekday === "Sunday") {
    return buildResult(false, "off_hours", "domingo o festivo", now);
  }

  if (weekday === "Saturday") {
    const open = minutesOfDay >= COMMERCIAL_OPEN_MIN && minutesOfDay < 14 * 60;
    return buildResult(
      open,
      open ? "in_hours" : "off_hours",
      open ? "sábado en horario" : "sábado fuera de horario",
      now
    );
  }

  if (isWeekday(weekday)) {
    const open = minutesOfDay >= COMMERCIAL_OPEN_MIN && minutesOfDay < 17 * 60;
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
  const sendOk = customerSendOk(now);
  return {
    business_hours: businessHours,
    business_mode: businessMode,
    timezone: BOGOTA_TZ,
    reason,
    checked_at: now.toISOString(),
    next_open_hint: businessHours ? null : computeNextOpenHint(now),
    customer_send_ok: sendOk,
    staff_notify_ok: staffNotifyOk(now),
    next_customer_send_hint: sendOk ? null : nextCustomerSendHint(now),
    copy_key: businessMode === "in_hours" ? "cierre_in_hours" : "cierre_off_hours",
  };
}

function nextCustomerSendHint(now) {
  const { minutesOfDay } = bogotaParts(now);
  if (minutesOfDay >= 22 * 60) return "mañana 6:00 a.m.";
  if (minutesOfDay < 6 * 60) return "hoy 6:00 a.m.";
  return null;
}

function computeNextOpenHint(now) {
  const { weekday, minutesOfDay } = bogotaParts(now);
  if (weekday === "Saturday" && minutesOfDay >= 14 * 60) {
    return "lunes 8:30 a.m.";
  }
  if (weekday === "Sunday") {
    return "lunes 8:30 a.m.";
  }
  if (minutesOfDay >= 17 * 60) {
    if (weekday === "Friday") return "sábado 8:30 a.m.";
    return "mañana 8:30 a.m.";
  }
  if (minutesOfDay < COMMERCIAL_OPEN_MIN) {
    return "hoy 8:30 a.m.";
  }
  return "próximo día hábil 8:30 a.m.";
}

export { bogotaParts, BOGOTA_TZ, COMMERCIAL_OPEN_MIN };
