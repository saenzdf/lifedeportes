/**
 * Pure helpers: expire customer-lane Kapso executions stuck in waiting.
 * Used by expire_stale_waiting.js (Kapso worker) and unit tests.
 */

const DEFAULT_TTL_HOURS = 3;
const DEFAULT_MAX_END = 50;
const WORKFLOW_ID = "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6";
const VENDOR_STEP = "agent_orquestador_1745500003000";

const STAFF_STEPS = new Set([
  "agent_1780762885818",
  "wait_staff_burst_1745500019200",
  "wait_staff_lane_1745500019050",
]);

const STAFF_PHONES_10 = new Set([
  "3103362484", // Javier
  "3213988464", // Paola
  "3000000046", // Sebastián
  "3000000047", // Diego
]);

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function last10Digits(value) {
  const d = String(value ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

function stepId(exec) {
  return compact(
    exec?.current_step?.identifier ||
      exec?.current_step_identifier ||
      exec?.current_step?.id ||
      ""
  );
}

function isStaffStep(step) {
  const s = compact(step);
  if (!s) return false;
  if (STAFF_STEPS.has(s)) return true;
  if (/staff/i.test(s) && !/customer/i.test(s)) return true;
  return false;
}

function isCustomerWaitingStep(step) {
  const s = compact(step);
  if (!s) return false;
  if (s === VENDOR_STEP) return true;
  if (s.includes("orquestador")) return true;
  if (s.includes("wait_customer")) return true;
  if (/historico|histórico/i.test(s)) return true;
  return false;
}

function isStaffPhone(phone) {
  const d = last10Digits(phone);
  return Boolean(d && STAFF_PHONES_10.has(d));
}

function parseTs(value) {
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

function lastActivityMs(exec) {
  return (
    parseTs(exec?.last_event_at) ||
    parseTs(exec?.updated_at) ||
    parseTs(exec?.started_at) ||
    0
  );
}

function waitingAgeMs(exec, nowMs) {
  const last = lastActivityMs(exec);
  if (!last) return 0;
  return Math.max(0, nowMs - last);
}

/**
 * @returns {string} expire | skip_status | skip_staff_step | skip_staff_phone | skip_other_step | skip_fresh | skip_quiet_hours
 */
function classifyWaitingExec(exec, { nowMs, ttlMs, phone } = {}) {
  const status = compact(exec?.status).toLowerCase();
  if (status && status !== "waiting") return "skip_status";
  const step = stepId(exec);
  if (isStaffStep(step)) return "skip_staff_step";
  if (isStaffPhone(phone)) return "skip_staff_phone";
  const when = new Date(nowMs || Date.now());
  const { minutesOfDay } = (function bogotaClock(date) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const map = {};
    for (const p of fmt.formatToParts(date)) {
      if (p.type !== "literal") map[p.type] = p.value;
    }
    return { minutesOfDay: Number(map.hour) * 60 + Number(map.minute) };
  })(when);
  if (minutesOfDay < 6 * 60 || minutesOfDay >= 22 * 60) return "skip_quiet_hours";
  if (!step) {
    const age = waitingAgeMs(exec, nowMs || Date.now());
    if (age < ttlMs) return "skip_fresh";
    return "expire";
  }
  if (!isCustomerWaitingStep(step)) return "skip_other_step";
  const age = waitingAgeMs(exec, nowMs || Date.now());
  if (age < ttlMs) return "skip_fresh";
  return "expire";
}

function unwrapExecutions(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const data = payload.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.executions)) return data.executions;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(payload.executions)) return payload.executions;
  return [];
}

function pagingMeta(payload) {
  const meta = payload?.meta || payload?.data?.meta || {};
  const paging = payload?.paging || payload?.data?.paging || {};
  return {
    has_next: Boolean(meta.has_next || paging.next || paging.cursors?.after),
    next_page: Number(meta.next_page || 0) || null,
    after: paging.cursors?.after || paging.after || null,
  };
}

function parseInvokeBody(body) {
  const src = body?.input && typeof body.input === "object" ? { ...body, ...body.input } : body || {};
  const dryRaw = src.dry_run ?? src.dryRun ?? false;
  const dryRun = [true, "true", "1", "yes", "on"].includes(dryRaw);
  const ttlHours = Math.min(
    24,
    Math.max(0.25, Number(src.ttl_hours ?? src.ttlHours ?? DEFAULT_TTL_HOURS) || DEFAULT_TTL_HOURS)
  );
  const maxEnd = Math.min(
    80,
    Math.max(1, Number(src.max_end ?? src.maxEnd ?? DEFAULT_MAX_END) || DEFAULT_MAX_END)
  );
  return { dryRun, ttlHours, maxEnd, ttlMs: ttlHours * 3600 * 1000 };
}

const ExpireStaleWaiting = {
  DEFAULT_TTL_HOURS,
  DEFAULT_MAX_END,
  WORKFLOW_ID,
  VENDOR_STEP,
  STAFF_STEPS,
  STAFF_PHONES_10,
  compact,
  last10Digits,
  stepId,
  isStaffStep,
  isCustomerWaitingStep,
  isStaffPhone,
  lastActivityMs,
  waitingAgeMs,
  classifyWaitingExec,
  unwrapExecutions,
  pagingMeta,
  parseInvokeBody,
};

if (typeof module === "object" && module.exports) {
  module.exports = ExpireStaleWaiting;
}
