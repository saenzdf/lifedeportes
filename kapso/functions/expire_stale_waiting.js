/**
 * expire-stale-waiting — TTL de ejecuciones vendedor en `waiting`.
 *
 * Kapso no timeout-ea `enter_waiting`. Tras silencio (default 3 h) PATCH → ended
 * para liberar el inbox. No toca staff (Agent Staff / wait_staff_*).
 *
 * Invoke:
 *   POST /platform/v1/functions/{id}/invoke
 *   Body: { dry_run?: false, ttl_hours?: 3, max_end?: 40 }
 *
 * Secrets: KAPSO_API_KEY
 * Optional: KAPSO_API_BASE_URL, LIFE_WORKFLOW_ID, LIFE_WAITING_TTL_HOURS
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
  "3103362484",
  "3213988464",
  "3172273627",
  "3172575981",
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

function classifyWaitingExec(exec, { nowMs, ttlMs, phone } = {}) {
  const status = compact(exec?.status).toLowerCase();
  if (status && status !== "waiting") return "skip_status";
  const step = stepId(exec);
  if (isStaffStep(step)) return "skip_staff_step";
  if (isStaffPhone(phone)) return "skip_staff_phone";
  const when = new Date(nowMs || Date.now());
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(when)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const minutesOfDay = Number(map.hour) * 60 + Number(map.minute);
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

function kapsoBase(env) {
  return compact(env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
}

async function kapsoJson(env, method, path, body) {
  const apiKey = compact(env.KAPSO_API_KEY);
  if (!apiKey) throw new Error("missing_kapso_api_key");
  const resp = await fetch(`${kapsoBase(env)}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = compact(json?.error?.message || json?.error || resp.statusText || "kapso_error");
    const err = new Error(`${resp.status} ${msg}`.slice(0, 220));
    err.status = resp.status;
    err.json = json;
    throw err;
  }
  return json;
}

async function listWaiting(env, workflowId) {
  const out = [];
  let page = 1;
  let after = null;
  for (let i = 0; i < 12; i++) {
    const qs = new URLSearchParams({
      status: "waiting",
      per_page: "50",
      page: String(page),
      limit: "50",
    });
    if (after) qs.set("after", after);
    const json = await kapsoJson(
      env,
      "GET",
      `/platform/v1/workflows/${workflowId}/executions?${qs.toString()}`
    );
    const execs = unwrapExecutions(json);
    out.push(...execs);
    const pg = pagingMeta(json);
    if (!execs.length || (!pg.has_next && execs.length < 50)) break;
    if (pg.after) {
      after = pg.after;
    } else {
      page += 1;
    }
  }
  return out;
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handler(request, env) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = parseInvokeBody(body);
    const envTtl = Number(env.LIFE_WAITING_TTL_HOURS);
    const ttlHours =
      Number.isFinite(envTtl) && envTtl >= 0.25
        ? Math.min(24, envTtl)
        : parsed.ttlHours;
    const ttlMs = ttlHours * 3600 * 1000;
    const workflowId = compact(env.LIFE_WORKFLOW_ID) || WORKFLOW_ID;
    const nowMs = Date.now();

    const waiting = await listWaiting(env, workflowId);
    const scanned = [];
    const expired = [];
    const skipped = [];
    const failed = [];

    for (const exec of waiting) {
      const step = stepId(exec);
      const ageH = Math.round((waitingAgeMs(exec, nowMs) / 3600000) * 10) / 10;
      const decision = classifyWaitingExec(exec, { nowMs, ttlMs, phone: "" });
      const row = {
        id: exec.id,
        step,
        age_hours: ageH,
        last_event_at: exec.last_event_at || exec.updated_at || exec.started_at || null,
        decision,
      };
      scanned.push(row);

      if (decision !== "expire") {
        skipped.push(row);
        continue;
      }
      if (expired.length >= parsed.maxEnd) {
        skipped.push({ ...row, decision: "skip_cap" });
        continue;
      }
      if (parsed.dryRun) {
        expired.push({ ...row, dry_run: true });
        continue;
      }
      try {
        await kapsoJson(env, "PATCH", `/platform/v1/workflow_executions/${exec.id}`, {
          workflow_execution: { status: "ended" },
        });
        expired.push({ ...row, ended: true });
      } catch (err) {
        failed.push({ ...row, error: String(err?.message || err).slice(0, 180) });
      }
    }

    return jsonResponse({
      ok: failed.length === 0,
      at: new Date().toISOString(),
      dry_run: parsed.dryRun,
      ttl_hours: ttlHours,
      workflow_id: workflowId,
      waiting_total: waiting.length,
      expired: expired.length,
      skipped: skipped.length,
      failed: failed.length,
      expired_ids: expired.map((e) => e.id),
      failed_rows: failed,
      skipped_by: skipped.reduce((acc, row) => {
        acc[row.decision] = (acc[row.decision] || 0) + 1;
        return acc;
      }, {}),
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: String(err?.message || err).slice(0, 300) },
      500
    );
  }
}

{ handler };
