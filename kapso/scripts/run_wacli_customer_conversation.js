#!/usr/bin/env node
/**
 * E2E conversación fluida (C1/C2/C3) — debounce 30s + prompt v7.
 *
 *   node kapso/scripts/run_wacli_customer_conversation.js --profile C1
 *   node kapso/scripts/run_wacli_customer_conversation.js --all
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const PROFILES = JSON.parse(
  fs.readFileSync(path.join(root, "kapso/tests/customer_lane_conversation_v2.json"), "utf8")
);
const LIFE_TO = PROFILES.life_wa;
const TESTER_WA = PROFILES.tester_wa;
const OUT = path.join(root, "scratch/e2e_customer_conversation_2026-07-13");
const WF_ID = "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6";

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    timeout: opts.timeout || 120000,
    maxBuffer: 20 * 1024 * 1024,
    ...opts,
  });
  return { ok: r.status === 0, status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function wacliJson(args, timeout = 120000) {
  const r = sh("wacli", [...args, "--json", "--lock-wait", "60s"], { timeout });
  let data = null;
  try {
    data = JSON.parse(r.stdout || "{}");
  } catch {
    data = { raw: r.stdout };
  }
  return { ...r, data };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function kapsoFetch(pathname, opts = {}) {
  loadEnv();
  const base = (process.env.KAPSO_API_BASE_URL || "").replace(/\/$/, "");
  const key = process.env.KAPSO_API_KEY || "";
  const res = await fetch(`${base}${pathname}`, {
    ...opts,
    headers: {
      "X-API-Key": key,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, json: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, json: { raw: text } };
  }
}

async function listDiegoConversations() {
  const { ok, json } = await kapsoFetch(
    `/platform/v1/whatsapp/conversations?phone_number=${encodeURIComponent(TESTER_WA)}&limit=20`
  );
  if (!ok) return [];
  const data = json?.data;
  const arr = Array.isArray(data)
    ? data
    : data?.whatsapp_conversations || data?.conversations || [];
  return (arr || []).filter(
    (c) =>
      String(c.phone_number || "").includes(TESTER_WA.replace(/^57/, "")) ||
      String(c.phone_number || "") === TESTER_WA
  );
}

async function reopenDiegoConversations() {
  const convs = await listDiegoConversations();
  for (const c of convs) {
    await kapsoFetch(`/platform/v1/whatsapp/conversations/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ whatsapp_conversation: { status: "active" } }),
    });
    console.log("reopen", c.id.slice(0, 8));
  }
  return convs.map((c) => c.id);
}

async function endBlockingDiegoExecs() {
  const diegoIds = new Set((await listDiegoConversations()).map((c) => c.id));
  const prefixes = [...diegoIds].map((id) => id.slice(0, 8));
  for (const status of ["handoff", "waiting"]) {
    const list = sh(
      "node",
      [
        path.join(root, ".agents/skills/automate-whatsapp/scripts/list-executions.js"),
        "--workflow-id",
        WF_ID,
        "--status",
        status,
        "--limit",
        "40",
      ],
      { timeout: 60000 }
    );
    let j = {};
    try {
      j = JSON.parse(list.stdout || "{}");
    } catch {
      continue;
    }
    for (const e of j?.data?.executions || []) {
      const cid = e?.whatsapp_conversation_id || "";
      const isDiego = diegoIds.has(cid) || prefixes.some((p) => cid.startsWith(p));
      if (!isDiego) continue;
      sh(
        "node",
        [
          path.join(root, ".agents/skills/automate-whatsapp/scripts/update-execution-status.js"),
          e.id,
          "--status",
          "ended",
        ],
        { timeout: 30000 }
      );
      console.log("ended", status, e.id.slice(0, 8), (e?.current_step?.identifier || "").slice(0, 40));
    }
  }
}

async function prepare() {
  await reopenDiegoConversations();
  await endBlockingDiegoExecs();
  await reopenDiegoConversations();
  await sleep(4000);
}

async function fetchWacliMsgs(sinceIso) {
  sh("wacli", ["sync", "--once", "--idle-exit", "6s", "--lock-wait", "60s"], { timeout: 90000 });
  const r = wacliJson(["messages", "list", "--chat", LIFE_TO, "--limit", "40"], 60000);
  const rootMsg = r.data?.data || r.data || {};
  const arr = rootMsg.messages || rootMsg.items || [];
  const since = Date.parse(sinceIso);
  return arr
    .map((m) => ({
      from_me: Boolean(m.FromMe ?? m.from_me),
      ts: m.Timestamp || m.timestamp,
      text: String(m.Text || m.DisplayText || m.text || m.body || ""),
    }))
    .filter((m) => {
      const ts = Date.parse(m.ts || 0);
      return !Number.isFinite(since) || !Number.isFinite(ts) || ts >= since - 3000;
    });
}

async function waitForBot(sinceIso, known, maxWaitS) {
  const deadline = Date.now() + maxWaitS * 1000;
  const knownSet = new Set(known);
  while (Date.now() < deadline) {
    const msgs = await fetchWacliMsgs(sinceIso);
    const fresh = msgs.filter((m) => !m.from_me && m.text && !knownSet.has(m.text));
    if (fresh.length) return fresh.map((m) => m.text);
    await sleep(8000);
  }
  return [];
}

function scoreExpect(botSnippets, expect, meta = {}) {
  const t = (botSnippets || []).join("\n---\n");
  const checks = {};
  checks.no_maintenance = !/mantenimiento temporalmente/i.test(t);
  checks.no_staff_upload_ok = !/Pedido S0\d{4} ingresado|CONFIRMO SUBIR|SUBIR PEDIDO/i.test(t);
  checks.bot_mentions_price_or_min6 =
    /\$\s*\d|50\.?000|30\.?000|35\.?000|valor unitario|total\s*(ser[ií]a|es|quedar)|m[ií]nimo\s*(de\s*)?6/i.test(
      t
    );
  checks.no_early_order_confirm = !/ya tengo anotado su pedido|pedido anotado|ya dejé su conversación con un asesor/i.test(
    t
  );
  checks.no_handoff_confirm_phrase = checks.no_early_order_confirm;
  checks.mentions_abono_50 = /50\s*%|abono/i.test(t);
  const greetHits = (botSnippets || []).filter((s) =>
    /hola de nuevo|qu[eé] gusto saludarte|bienvenido de nuevo/i.test(s)
  ).length;
  checks.greeting_once_max = greetHits <= 1;
  const long = (botSnippets || []).filter((s) => s.split(/\n/).length > 6 || s.length > 520);
  checks.short_replies = long.length === 0;
  checks.single_reply_after_burst =
    meta.burstReplyCount == null ? true : meta.burstReplyCount <= 1;

  const failed = Object.entries(expect || {})
    .filter(([k, want]) => want && checks[k] === false)
    .map(([k]) => k);
  return { checks, failed, ok: failed.length === 0, greetHits };
}

async function runProfile(profile) {
  await prepare();
  const caseOut = path.join(OUT, profile.slug);
  fs.mkdirSync(caseOut, { recursive: true });
  const startedAt = new Date().toISOString();
  const log = [];
  const botCollected = [];
  const push = (line) => {
    log.push(line);
    console.log(line);
  };
  push(`# ${profile.id} ${profile.slug}`);
  push(`Start ${startedAt}`);

  let meta = {};

  if (profile.mode === "burst") {
    const burstAt = new Date().toISOString();
    for (const step of profile.steps) {
      const send = wacliJson(
        ["send", "text", "--to", LIFE_TO, "--message", step.message, "--post-send-wait", "1s"],
        90000
      );
      push(`- burst: ${step.message.slice(0, 80)} ok=${send.ok}`);
      await sleep((profile.burst_gap_s || 2) * 1000);
    }
    // No debe haber bot antes de ~25s
    await sleep(20000);
    const early = await fetchWacliMsgs(burstAt);
    const earlyBot = early.filter((m) => !m.from_me && m.text);
    push(`  early_bot_count@20s=${earlyBot.length}`);
    const waitS = profile.post_burst_wait_s || 55;
    push(`  … waiting consolidated reply up to ${waitS}s`);
    const replies = await waitForBot(burstAt, botCollected, waitS);
    for (const t of replies) {
      botCollected.push(t);
      push(`  bot: ${t.slice(0, 180)}`);
    }
    meta.burstReplyCount = replies.length;
    meta.earlyBotCount = earlyBot.length;
    if (earlyBot.length > 0) {
      push("  WARN: bot replied during burst window (<20s)");
    }
  } else {
    for (const step of profile.steps) {
      const stepAt = new Date().toISOString();
      const send = wacliJson(
        ["send", "text", "--to", LIFE_TO, "--message", step.message, "--post-send-wait", "3s"],
        90000
      );
      push(`- send: ${step.message.slice(0, 80)} ok=${send.ok}`);
      if (!send.ok) {
        return { ok: false, error: "send_failed", profile: profile.id, log, bot_snippets: botCollected };
      }
      const waitS = Math.max(step.wait_s || 50, 45);
      push(`  … waiting bot up to ${waitS}s (incl. debounce 30s)`);
      const replies = await waitForBot(stepAt, botCollected, waitS);
      for (const t of replies) {
        botCollected.push(t);
        push(`  bot: ${t.slice(0, 180)}`);
      }
      if (!replies.length) push("  bot: (sin respuesta)");
    }
  }

  const msgs = await fetchWacliMsgs(startedAt);
  fs.writeFileSync(path.join(caseOut, "messages.json"), JSON.stringify(msgs, null, 2));
  for (const m of msgs.filter((x) => !x.from_me && x.text)) {
    if (!botCollected.includes(m.text)) botCollected.push(m.text);
  }

  const score = scoreExpect(botCollected, profile.expect, meta);
  const result = {
    ok: score.ok,
    profile: profile.id,
    slug: profile.slug,
    started_at: startedAt,
    bot_snippets: botCollected.map((t) => t.slice(0, 280)),
    score,
    meta,
  };
  fs.writeFileSync(path.join(caseOut, "result.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(
    path.join(caseOut, "TRACE.md"),
    log.join("\n") + "\n\n## Bot\n\n" + botCollected.join("\n---\n").slice(0, 5000)
  );
  push(`## ${score.ok ? "OK" : "FAIL"} ${profile.slug} failed=${JSON.stringify(score.failed)}`);
  push(`Bot: ${botCollected[0]?.slice(0, 160) || "(sin respuesta)"}`);
  return result;
}

async function main() {
  const argv = process.argv.slice(2);
  const all = argv.includes("--all");
  const only = argv.includes("--profile") ? argv[argv.indexOf("--profile") + 1] : null;
  fs.mkdirSync(OUT, { recursive: true });
  const selected = PROFILES.profiles.filter((p) => all || !only || p.id === only || p.slug === only);
  if (!selected.length) {
    console.error("Use --profile C1|C2|C3 or --all");
    process.exit(1);
  }
  console.log("Conversation E2E →", LIFE_TO, selected.map((p) => p.id).join(","));
  const results = [];
  for (const p of selected) {
    console.log("\n========", p.id, p.slug, "========");
    results.push(await runProfile(p));
    await sleep(10000);
  }
  const summary = {
    at: new Date().toISOString(),
    pass: results.filter((r) => r.ok).length,
    total: results.length,
    results,
  };
  fs.writeFileSync(path.join(OUT, "SUMMARY.json"), JSON.stringify(summary, null, 2));
  const md = [
    `# E2E conversation lane ${summary.at.slice(0, 10)}`,
    "",
    `**${summary.pass}/${summary.total}** OK`,
    "",
    "| ID | Slug | OK | Fail | First bot |",
    "|----|------|----|------|-----------|",
    ...results.map(
      (r) =>
        `| ${r.profile} | ${r.slug} | ${r.ok ? "✓" : "✗"} | ${(r.score?.failed || []).join(",") || "—"} | ${(r.bot_snippets?.[0] || "").replace(/\|/g, "/").slice(0, 70)} |`
    ),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "REPORT.md"), md);
  console.log("\n" + md);
  if (summary.pass < summary.total) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
