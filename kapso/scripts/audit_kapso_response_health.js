#!/usr/bin/env node
/**
 * Auditoría operativa del carril cliente Kapso Life Deportes.
 *
 * Revisa ejecuciones + mensajes recientes y aplica reglas de salud
 * (identidad, un asesor, seguimiento pedido, ensure-crm, ads/end-quiet,
 *  retomo cross-hilo transparente C-01).
 *
 * Uso:
 *   node kapso/scripts/audit_kapso_response_health.js
 *   node kapso/scripts/audit_kapso_response_health.js --since-hours 24
 *   node kapso/scripts/audit_kapso_response_health.js --since-iso 2026-08-30T11:51:00-04:00 --json
 *   node kapso/scripts/audit_kapso_response_health.js --since-hours 6 --fail-on warn
 *
 * Requiere: KAPSO_API_BASE_URL, KAPSO_API_KEY en .env
 * Opcional: kapso CLI para listar conversaciones/mensajes (más fiable).
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const WF_ID = "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6";
const LIFE_E164 = "+573222252942";
const STAFF_DIGITS = new Set([
  "573213988464",
  "573103362484",
  "573172575981",
  "573172273627",
]);

const RULES = {
  dual_advisor_numbers: {
    severity: "fail",
    re: /(310\s*336\s*2484|3103362484).*(321\s*398\s*8464|3213988464)|321.*310/i,
    desc: "Outbound pegó 310 y 321 juntos",
  },
  voluntary_assistant_identity: {
    severity: "fail",
    re: /soy el asistente|asistente virtual|asistente de life|soy una ia|inteligencia artificial/i,
    desc: "Se presentó como asistente/IA sin que preguntaran",
  },
  order_followup_registered_notify: {
    severity: "fail",
    inbound_re:
      /c[oó]mo van|contra entrega|cu[aá]nto tiempo|el equipo s[ií] quiere|salen hoy|el otro 50|ya pagamos|estado del pedido|listos\?/i,
    outbound_re: /pedido qued[oó] registrado/i,
    desc: "Seguimiento de pedido recibió copy de pedido registrado (notify)",
  },
  off_hours_copy_8am: {
    severity: "warn",
    re: /siguiente d[ií]a h[aá]bil a partir de las 8:00/i,
    desc: "Copy off-hours dice 8:00 en vez de 8:30 (comercial)",
  },
  /** C-01 / RT-08 — retomo cross-hilo transparente (2026-08-31) */
  transparent_resume_meta_leak: {
    severity: "fail",
    re: /\b(sigo con|retomo|qued[oó] pendiente|nueva sesi[oó]n|otro hilo|kapso|ventana de 24)\b/i,
    desc: "Outbound menciona corte interno / sesiones / Kapso al cliente (retomo debe ser invisible)",
  },
  transparent_resume_forced_recap: {
    severity: "warn",
    re: /\b(confirma(r)? el abono|le confirmo el pedido|quedaron registrados)\b/i,
    desc: "Recap o CTA de abono/pedido sin que el inbound lo pidiera (retomo transparente)",
  },
  transparent_resume_brand_reset: {
    severity: "fail",
    re: /fabricamos uniformes deportivos desde 6|¿qu[eé] uniforme o camiseta deportiva necesita/i,
    desc: "Saludo de prospecto nuevo en hilo que debería retomar (marca + discovery)",
  },
};

const PREFILL_ONLY = /^Hola, quiero cotizar uniformes de\s*$/i;

/** Quita metadata de adjuntos Kapso antes de lint (no es copy del agente al cliente). */
function stripOutboundLintNoise(text) {
  if (!text) return "";
  return String(text)
    .replace(/\s*Image attached\s*\([^)]*\)(?:\s*\[[^\]]*\])?(?:\s*URL:\s*\S+)?/gi, "")
    .replace(/\s*URL:\s*https:\/\/app\.kapso\.ai\/\S+/gi, "")
    .replace(/\s*Document attached\s*\([^)]*\)(?:\s*URL:\s*\S+)?/gi, "")
    .trim();
}

function loadEnv() {
  for (const p of [path.join(ROOT, ".env"), path.join(ROOT, "..", ".env")]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}

function parseArgs(argv) {
  const out = { sinceHours: 24, sinceIso: null, json: false, failOn: "fail", perPage: 50 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--since-hours") out.sinceHours = Number(argv[++i]) || 24;
    else if (a === "--since-iso") out.sinceIso = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a === "--fail-on") out.failOn = argv[++i] || "fail";
    else if (a === "--no-exit-on-findings") out.failOn = "none";
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function parseTs(value) {
  if (!value) return null;
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    return new Date(Number(value) * 1000);
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function kapsoFetch(apiPath, query) {
  const base = (process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const key = process.env.KAPSO_API_KEY;
  if (!key) throw new Error("missing KAPSO_API_KEY");
  const qs =
    query && Object.keys(query).length
      ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== "")).toString()}`
      : "";
  const res = await fetch(`${base}${apiPath}${qs}`, {
    headers: { "X-API-Key": key, Accept: "application/json" },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`Kapso ${res.status} ${apiPath}: ${text.slice(0, 200)}`);
  return json;
}

function kapsoCli(args) {
  const r = spawnSync("kapso", [...args, "--output", "json"], {
    encoding: "utf8",
    timeout: 90000,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) return { ok: false, error: (r.stderr || r.stdout || "").slice(0, 300) };
  try {
    return { ok: true, json: JSON.parse(r.stdout) };
  } catch {
    return { ok: false, error: "invalid JSON from kapso CLI" };
  }
}

async function listExecutions(since) {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const d = await kapsoFetch(`/platform/v1/workflows/${WF_ID}/executions`, {
      per_page: 50,
      page,
    });
    const batch = d.data || [];
    if (!batch.length) break;
    all.push(...batch);
    if (page >= (d.meta?.total_pages || 1)) break;
  }
  return all.filter((e) => {
    const t = parseTs(e.started_at || e.last_event_at);
    return t && t >= since;
  });
}

async function listConversations(since) {
  const cli = kapsoCli([
    "whatsapp",
    "conversations",
    "list",
    "--phone-number",
    LIFE_E164,
    "--per-page",
    "50",
  ]);
  if (!cli.ok) return [];
  const convs = cli.json?.data || [];
  return convs
    .filter((c) => {
      const t = parseTs(c.last_active_at || c.updated_at || c.created_at);
      return t && t >= since;
    })
    .map((c) => ({
      ...c,
      phone_local10: local10Digits(
        c.phone_number || c.phone || c.kapso?.phone_number || ""
      ),
    }));
}

function local10Digits(value) {
  const d = String(value || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

/** Mismo teléfono, 2+ hilos en ventana → el más nuevo no debe resetear saludo (C-01). */
function lintDuplicatePhoneThreads(threadsByPhone) {
  const findings = [];
  for (const [phone, rows] of Object.entries(threadsByPhone)) {
    if (!phone || rows.length < 2) continue;
    const sorted = [...rows].sort(
      (a, b) => Date.parse(b.last_active || 0) - Date.parse(a.last_active || 0)
    );
    const newest = sorted[0];
    const lastOut = newest.last_outbound || "";
    if (RULES.transparent_resume_brand_reset.re.test(lastOut)) {
      findings.push({
        severity: RULES.transparent_resume_brand_reset.severity,
        rule: "transparent_resume_brand_reset",
        desc: `${RULES.transparent_resume_brand_reset.desc} (${rows.length} hilos, tel …${phone.slice(-4)})`,
        name: newest.name,
        conversation_id: newest.conversation_id,
        text: lastOut.slice(0, 180),
        prior_threads: sorted.slice(1).map((r) => r.conversation_id?.slice(0, 8)),
      });
    }
  }
  return findings;
}

async function listMessages(conversationId, since) {
  const cli = kapsoCli([
    "whatsapp",
    "messages",
    "list",
    "--conversation",
    conversationId,
    "--limit",
    "80",
  ]);
  if (!cli.ok) return [];
  const msgs = cli.json?.data || [];
  return msgs
    .map((m) => {
      const direction = m.direction || m.kapso?.direction;
      let text = "";
      if (m.text && typeof m.text === "object") text = m.text.body || "";
      else if (typeof m.text === "string") text = m.text;
      text = text || m.kapso?.content || "";
      return {
        direction,
        text: String(text).replace(/\s+/g, " ").trim(),
        ts: parseTs(m.created_at || m.timestamp),
      };
    })
    .filter((m) => m.ts && m.ts >= since && m.text);
}

async function scanExecutionEvents(execId) {
  const d = await kapsoFetch(`/platform/v1/workflow_executions/${execId}/events`, {
    per_page: 120,
  });
  const events = d.data || [];
  const flags = [];
  for (const ev of events) {
    const et = ev.event_type || "";
    const step = ev.step?.identifier || "";
    const payload = JSON.stringify(ev.payload || {});
    if (/loop_guard/i.test(payload) || et === "execution_failed") {
      flags.push({ type: "loop_or_failed", event: et, step, snippet: payload.slice(0, 160) });
    }
    if (step.includes("fn_end_quiet_customer") || /quiet_end|end_quiet/i.test(payload)) {
      flags.push({ type: "end_quiet", event: et, step });
    }
    if (
      step.includes("fn_ensure_crm_from_quote") &&
      /handoff/i.test(et + payload)
    ) {
      flags.push({ type: "ensure_crm_handoff", event: et, step });
    }
  }
  return flags;
}

function lintThread({ name, conversationId, inbound, outbound }) {
  const findings = [];
  for (const ob of outbound) {
    const lintText = stripOutboundLintNoise(ob.text);
    for (const [ruleId, rule] of Object.entries(RULES)) {
      if (rule.inbound_re) continue;
      if (rule.re?.test(lintText)) {
        findings.push({
          severity: rule.severity,
          rule: ruleId,
          desc: rule.desc,
          name,
          conversation_id: conversationId,
          text: ob.text.slice(0, 180),
        });
      }
    }
  }
  const followRule = RULES.order_followup_registered_notify;
  const followIn = inbound.some((m) => followRule.inbound_re.test(m.text));
  const registeredOut = outbound.filter((m) => followRule.outbound_re.test(m.text));
  if (followIn && registeredOut.length) {
    findings.push({
      severity: followRule.severity,
      rule: "order_followup_registered_notify",
      desc: followRule.desc,
      name,
      conversation_id: conversationId,
      inbound: inbound[inbound.length - 1]?.text?.slice(0, 120),
      outbound: registeredOut.map((m) => m.text.slice(0, 120)),
    });
  }
  const forcedRecapRule = RULES.transparent_resume_forced_recap;
  const inboundAsksAbono = inbound.some((m) =>
    /\babono|50\s*%|confirmo|registrado|pedido\b/i.test(m.text || "")
  );
  if (!inboundAsksAbono) {
    for (const ob of outbound) {
      if (forcedRecapRule.re.test(stripOutboundLintNoise(ob.text))) {
        findings.push({
          severity: forcedRecapRule.severity,
          rule: "transparent_resume_forced_recap",
          desc: forcedRecapRule.desc,
          name,
          conversation_id: conversationId,
          text: ob.text.slice(0, 180),
        });
        break;
      }
    }
  }
  const realIn = inbound.filter((m) => m.text && !PREFILL_ONLY.test(m.text));
  if (realIn.length && !outbound.length) {
    findings.push({
      severity: "fail",
      rule: "no_outbound_after_real_inbound",
      desc: "Hubo mensaje real del cliente y cero respuesta outbound en la ventana",
      name,
      conversation_id: conversationId,
      inbound: realIn[realIn.length - 1].text.slice(0, 120),
    });
  }
  return findings;
}

function summarizeExecutions(execs) {
  const byStatus = {};
  for (const e of execs) byStatus[e.status] = (byStatus[e.status] || 0) + 1;
  return { total: execs.length, by_status: byStatus };
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      `Usage: node kapso/scripts/audit_kapso_response_health.js [--since-hours N] [--since-iso ISO] [--json] [--fail-on fail|warn|any|none] [--no-exit-on-findings]`
    );
    process.exit(0);
  }

  const since = args.sinceIso
    ? parseTs(args.sinceIso)
    : new Date(Date.now() - args.sinceHours * 3600 * 1000);
  if (!since) throw new Error("invalid since");

  const execs = await listExecutions(since);
  const convs = await listConversations(since);
  const findings = [];
  const threads = [];
  const threadsByPhone = {};

  for (const c of convs) {
    const name = (c.contact_name || c.kapso?.contact_name || "?").slice(0, 40);
    const msgs = await listMessages(c.id, since);
    const inbound = msgs.filter((m) => m.direction === "inbound");
    const outbound = msgs.filter((m) => m.direction === "outbound");
    const exec = execs.find((e) => e.whatsapp_conversation_id === c.id) || null;
    const row = {
      conversation_id: c.id,
      name,
      phone_local10: c.phone_local10 || "",
      last_active: c.last_active_at || c.updated_at || c.created_at,
      inbound_n: inbound.length,
      outbound_n: outbound.length,
      exec_id: exec?.id || null,
      exec_status: exec?.status || null,
      last_outbound: outbound[outbound.length - 1]?.text?.slice(0, 120) || null,
    };
    threads.push(row);
    if (row.phone_local10) {
      threadsByPhone[row.phone_local10] = threadsByPhone[row.phone_local10] || [];
      threadsByPhone[row.phone_local10].push(row);
    }
    findings.push(...lintThread({ name, conversationId: c.id, inbound, outbound }));
  }

  findings.push(...lintDuplicatePhoneThreads(threadsByPhone));

  for (const e of execs) {
    if (e.status === "failed") {
      findings.push({
        severity: "fail",
        rule: "execution_failed",
        desc: "Ejecución en failed",
        exec_id: e.id,
        conversation_id: e.whatsapp_conversation_id,
      });
    }
    const flags = await scanExecutionEvents(e.id);
    for (const f of flags) {
      findings.push({
        severity: f.type === "end_quiet" ? "info" : "fail",
        rule: f.type,
        desc: f.type,
        exec_id: e.id,
        conversation_id: e.whatsapp_conversation_id,
        detail: f,
      });
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    since: since.toISOString(),
    workflow_id: WF_ID,
    life_phone: LIFE_E164,
    executions: summarizeExecutions(execs),
    conversations_scanned: convs.length,
    threads,
    findings,
    counts: {
      fail: findings.filter((f) => f.severity === "fail").length,
      warn: findings.filter((f) => f.severity === "warn").length,
      info: findings.filter((f) => f.severity === "info").length,
    },
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Kapso response health — since ${report.since}`);
    console.log(
      `executions=${report.executions.total} status=${JSON.stringify(report.executions.by_status)} convs=${report.conversations_scanned}`
    );
    console.log(`findings fail=${report.counts.fail} warn=${report.counts.warn} info=${report.counts.info}`);
    if (threads.length) {
      console.log("\nThreads:");
      for (const t of threads) {
        console.log(
          `  - ${t.name} in=${t.inbound_n} out=${t.outbound_n} exec=${t.exec_status || "—"} | ${t.last_outbound || "(sin outbound)"}`
        );
      }
    }
    if (findings.length) {
      console.log("\nFindings:");
      for (const f of findings) {
        console.log(`  [${f.severity}] ${f.rule}: ${f.desc}${f.name ? ` (${f.name})` : ""}`);
        if (f.text) console.log(`    ${f.text}`);
      }
    } else {
      console.log("\nNo findings in window.");
    }
  }

  const threshold =
    args.failOn === "none"
      ? []
      : args.failOn === "any"
        ? ["fail", "warn"]
        : args.failOn === "warn"
          ? ["fail", "warn"]
          : ["fail"];
  const bad = findings.some((f) => threshold.includes(f.severity));
  process.exit(bad ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(2);
});
