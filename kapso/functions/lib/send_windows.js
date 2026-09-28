/**
 * Ventanas de envío Kapso Life (America/Bogota). Distintas del horario comercial.
 *
 * customerSendOk  — 06:00–22:00 todos los días (solo carril vendedor). Fuera: no WhatsApp al cliente.
 * staffNotifyOk   — 08:00–18:00 lun–sáb. Desde 18:00 sin aviso proactivo staff; vendedor sigue hasta 22:00.
 *
 * Horario comercial (hoy mismo vs mañana) → lib/business_hours.js
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
  return {
    weekday: map.weekday,
    ymd: `${map.year}-${map.month}-${map.day}`,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
  };
}

const CUSTOMER_SEND_START_MIN = 6 * 60;
const CUSTOMER_SEND_END_MIN = 22 * 60; // 10:00 p.m. — solo agente vendedor

/** [06:00, 22:00) Bogotá, todos los días. */
function customerSendOk(now = new Date()) {
  const { minutesOfDay } = bogotaParts(now);
  return minutesOfDay >= CUSTOMER_SEND_START_MIN && minutesOfDay < CUSTOMER_SEND_END_MIN;
}

/** [08:00, 18:00) Bogotá, lun–sáb. Domingo = no. */
function staffNotifyOk(now = new Date()) {
  const { weekday, minutesOfDay } = bogotaParts(now);
  if (weekday === "Sunday") return false;
  return minutesOfDay >= 8 * 60 && minutesOfDay < 18 * 60;
}

function nextCustomerSendHint(now = new Date()) {
  const { minutesOfDay } = bogotaParts(now);
  if (minutesOfDay >= CUSTOMER_SEND_END_MIN) return "mañana 6:00 a.m.";
  if (minutesOfDay < 6 * 60) return "hoy 6:00 a.m.";
  return null;
}

function nextStaffNotifyHint(now = new Date()) {
  const { weekday, minutesOfDay } = bogotaParts(now);
  if (weekday === "Sunday") return "lunes 8:00 a.m.";
  if (minutesOfDay >= 18 * 60) {
    if (weekday === "Saturday") return "lunes 8:00 a.m.";
    return "mañana 8:00 a.m.";
  }
  if (minutesOfDay < 8 * 60) return "hoy 8:00 a.m.";
  return null;
}

const SendWindows = {
  BOGOTA_TZ,
  bogotaParts,
  customerSendOk,
  staffNotifyOk,
  nextCustomerSendHint,
  nextStaffNotifyHint,
};

if (typeof module === "object" && module.exports) {
  module.exports = SendWindows;
}
