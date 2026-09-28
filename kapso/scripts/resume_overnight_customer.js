#!/usr/bin/env node
/**
 * 06:00 Bogotá: reanuda waiting del vendedor con inbound sin reply (noche).
 *
 *   node kapso/scripts/resume_overnight_customer.js --dry-run
 *   node kapso/scripts/resume_overnight_customer.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const WORKFLOW_ID = "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6";
const VENDOR_STEP = "agent_orquestador_1745500003000";
const STAFF_STEPS = new Set([
  "agent_1780762885818",
  "wait_staff_burst_1745500019200",
  "wait_staff_lane_1745500019050",
]);
const STAFF_10 = new Set(["3103362484", "3213988464", "3000000046", "3000000047"]);

function loadEnv() {
  const candidates = [
    path.join(os.homedir(), "Library/Application Support/lifedeportes/resume_overnight_customer.env"),
    path.join(ROOT, ".env"),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}

function bogotaClock(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(now)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return Number(map.hour) * 60 + Number(map.minute);
}

function customerSendOk(now = new Date()) {
  const m = bogotaClock(now);
  return m >= 6 * 60 && m < 22 * 60;
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function last10(value) {
  const d = String(value ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

function stepId(exec) {
  return compact(exec?.current_step?.identifier || exec?.current_step_identifier || "");
}

function isVendorWaiting(exec) {
  if (compact(exec?.status).toLowerCase() !== "waiting") return false;
  const step = stepId(exec);
  if (STAFF_STEPS.has(step) || (/staff/i.test(step) && !/customer/i.test(step))) return false;
  if (!step) return true;
  if (step === VENDOR_STEP || step.includes("orquestador")) return true;
  if (step.includes("wait_customer")) return true;
  return false;
}

function unwrap(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const data = payload.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.executions)) return data.executions;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

async function kapso(apiPath, init = {}) {
  const base = (process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const res = await fetch(`${base}${apiPath}`, {
    ...init,
    headers: {
      "X-API-Key": process.env.KAPSO_API_KEY,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`${res.status} ${String(json?.error?.message || text).slice(0, 180)}`);
    err.status = res.status;
    err.json = json;
    throw err;
  }
  return json;
}

async function listWaiting() {
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
    const json = await kapso(`/platform/v1/workflows/${WORKFLOW_ID}/executions?${qs.toString()}`);
    const execs = unwrap(json);
    out.push(...execs);
    const paging = json?.paging || json?.data?.paging || {};
    const meta = json?.meta || json?.data?.meta || {};
    if (!execs.length) break;
    if (paging.cursors?.after) after = paging.cursors.after;
    else if (meta.has_next) page += 1;
    else break;
  }
  return out;
}

function lastInboundText(conv) {
  const k = conv?.kapso || conv || {};
  return compact(
    k.last_inbound_text ||
      conv?.last_inbound_text ||
      conv?.last_message?.text ||
      conv?.last_message?.content ||
      conv?.last_message?.body ||
      ""
  );
}

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[^\wñ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAdsPrefillOnly(text) {
  const t = fold(text);
  return (
    /^hola\s*quiero\s+cotizar\s+uniformes\s+de\s*$/.test(t) ||
    /^hola\s*quiero\s+cotizar\s+uniformes\s*$/.test(t)
  );
}

function shouldSkipSpam(exec, conv) {
  const spam = exec?.execution_context?.vars?.spam_profile || exec?.vars?.spam_profile || {};
  if (spam.is_spam || spam.ads_prefill_only) return "spam_profile";
  const text = lastInboundText(conv);
  if (isAdsPrefillOnly(text)) return "ads_prefill_text";
  return null;
}

function unanswered(conv) {
  const k = conv?.kapso || {};
  const lin = k.last_inbound_at ? Date.parse(k.last_inbound_at) : 0;
  const lout = k.last_outbound_at ? Date.parse(k.last_outbound_at) : 0;
  if (!lin) return false;
  return !lout || lin > lout;
}

async function main() {
  loadEnv();
  const dry = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  if (!process.env.KAPSO_API_KEY) {
    console.error("missing KAPSO_API_KEY");
    process.exit(1);
  }
  if (!force && !customerSendOk()) {
    console.log(JSON.stringify({ ok: true, skipped: "outside_customer_send_window" }));
    return;
  }

  const waiting = await listWaiting();
  const resumed = [];
  const skipped = [];

  for (const exec of waiting) {
    const convId = compact(exec.whatsapp_conversation_id || exec.conversation_id);
    const phone = last10(exec.phone_number || exec.whatsapp_phone_number || "");
    if (phone && STAFF_10.has(phone)) {
      skipped.push({ id: exec.id, reason: "staff_phone" });
      continue;
    }
    if (!isVendorWaiting(exec)) {
      skipped.push({ id: exec.id, reason: "not_vendor", step: stepId(exec) });
      continue;
    }
    if (!convId) {
      skipped.push({ id: exec.id, reason: "no_conversation" });
      continue;
    }
    let conv = null;
    try {
      conv = (await kapso(`/platform/v1/whatsapp/conversations/${convId}`)).data || null;
    } catch (err) {
      skipped.push({ id: exec.id, reason: "conv_error", error: err.message });
      continue;
    }
    if (!unanswered(conv)) {
      skipped.push({ id: exec.id, reason: "already_replied", conversation_id: convId });
      continue;
    }
    const spamSkip = shouldSkipSpam(exec, conv);
    if (spamSkip) {
      skipped.push({ id: exec.id, reason: spamSkip, conversation_id: convId });
      // Prefill/spam: terminar waiting para que no se reanime mañana otra vez
      if (!dry) {
        try {
          await kapso(`/platform/v1/workflow_executions/${exec.id}`, {
            method: "PATCH",
            body: { workflow_execution: { status: "ended" } },
          });
        } catch (_) {
          /* best effort */
        }
      }
      continue;
    }
    const text = lastInboundText(conv) || "Buenos días. Retomo su último mensaje.";
    const body = {
      message: { kind: "payload", data: text },
      variables: {
        service: {
          customer_send_ok: true,
          staff_notify_ok: false,
        },
      },
    };
    if (dry) {
      resumed.push({ id: exec.id, conversation_id: convId, dry: true, preview: text.slice(0, 80) });
      continue;
    }
    try {
      await kapso(`/platform/v1/workflow_executions/${exec.id}/resume`, {
        method: "POST",
        body,
      });
      resumed.push({ id: exec.id, conversation_id: convId, preview: text.slice(0, 80) });
    } catch (err) {
      skipped.push({ id: exec.id, reason: "resume_failed", error: err.message });
    }
  }

  const out = {
    ok: true,
    at: new Date().toISOString(),
    dry,
    waiting_total: waiting.length,
    resumed: resumed.length,
    skipped: skipped.length,
    resumed_ids: resumed.map((r) => r.id),
    skipped_by: skipped.reduce((acc, row) => {
      acc[row.reason] = (acc[row.reason] || 0) + 1;
      return acc;
    }, {}),
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
