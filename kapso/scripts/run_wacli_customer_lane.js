#!/usr/bin/env node
/**
 * E2E carril CLIENTE vía wacli (Diego → Life).
 * Requiere: Diego fuera del staff allowlist + staff_only_mode disable.
 *
 *   node kapso/scripts/run_wacli_customer_lane.js --profile P1
 *   node kapso/scripts/run_wacli_customer_lane.js --profile P2
 *   node kapso/scripts/run_wacli_customer_lane.js --all
 *
 * Por defecto: cierra handoff/waiting de Diego, reabre conversaciones,
 * y tras cada mensaje espera respuesta del bot (wacli + Kapso).
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const PROFILES = JSON.parse(
  fs.readFileSync(path.join(root, "kapso/tests/customer_lane_profiles_v1.json"), "utf8")
);
const LIFE_TO = PROFILES.life_wa;
const TESTER_WA = PROFILES.tester_wa;
const OUT = path.join(root, "scratch/e2e_customer_lane_2026-07-12");
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

function kapsoBase() {
  loadEnv();
  return {
    base: (process.env.KAPSO_API_BASE_URL || "").replace(/\/$/, ""),
    key: process.env.KAPSO_API_KEY || "",
  };
}

async function kapsoFetch(pathname, opts = {}) {
  const { base, key } = kapsoBase();
  if (!base || !key) throw new Error("missing KAPSO_API_BASE_URL/KAPSO_API_KEY");
  const res = await fetch(`${base}${pathname}`, {
    ...opts,
    headers: {
      "X-API-Key": key,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text, status: res.status };
  }
  return { ok: res.ok, status: res.status, json };
}

function listPackFiles(packRel, matchRe, limit) {
  if (!packRel) return [];
  const dir = path.join(root, packRel);
  if (!fs.existsSync(dir)) return [];
  const re = new RegExp(matchRe, "i");
  return fs
    .readdirSync(dir)
    .filter((f) => re.test(f) && !f.startsWith("~$"))
    .slice(0, limit)
    .map((f) => path.join(dir, f));
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
  return (arr || []).filter((c) => String(c.phone_number || "").includes(TESTER_WA.replace(/^57/, "")) || String(c.phone_number || "") === TESTER_WA);
}

async function reopenDiegoConversations() {
  const convs = await listDiegoConversations();
  const ids = convs.map((c) => c.id).filter(Boolean);
  if (!ids.length) {
    console.log("reopen: no Diego conversations found via q=");
    return [];
  }
  for (const id of ids) {
    const { json } = await kapsoFetch(`/platform/v1/whatsapp/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ whatsapp_conversation: { status: "active" } }),
    });
    console.log("reopen", id.slice(0, 8), json?.data?.status || "?");
  }
  return ids;
}

async function diegoConversationIds() {
  const convs = await listDiegoConversations();
  return new Set(convs.map((c) => c.id).filter(Boolean));
}

async function endBlockingDiegoExecs() {
  const diegoIds = await diegoConversationIds();
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
      const step = e?.current_step?.identifier || "";
      const isDiego = diegoIds.has(cid) || prefixes.some((p) => cid.startsWith(p));
      if (!isDiego) continue;
      if (status === "waiting" && !/history|orquestador|wait_customer|agent_/i.test(step || "agent_")) {
        // waiting without step id still end if Diego
      }
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
      console.log("ended", status, e.id.slice(0, 8), step || "(no-step)", cid.slice(0, 8));
    }
  }
}

async function prepareDiegoLane() {
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

async function fetchKapsoBotSnippets() {
  const convs = await listDiegoConversations();
  return convs
    .map((c) => {
      const k = c.kapso || {};
      return {
        id: c.id,
        status: c.status,
        last_out: k.last_outbound_at,
        text: String(k.last_message_text || ""),
        last_in: k.last_inbound_at,
      };
    })
    .filter((c) => c.text);
}

async function waitForBotReply(sinceIso, knownBotTexts, maxWaitS) {
  const deadline = Date.now() + maxWaitS * 1000;
  const known = new Set(knownBotTexts);
  while (Date.now() < deadline) {
    const msgs = await fetchWacliMsgs(sinceIso);
    const bots = msgs.filter((m) => !m.from_me && m.text);
    const fresh = bots.filter((m) => !known.has(m.text));
    if (fresh.length) return { source: "wacli", texts: fresh.map((m) => m.text) };

    const kapso = await fetchKapsoBotSnippets();
    const active = kapso.find((c) => c.status === "active") || kapso[0];
    if (active?.text && !known.has(active.text) && Date.parse(active.last_out || 0) >= Date.parse(sinceIso) - 5000) {
      return { source: "kapso", texts: [active.text] };
    }

    // still waiting on orquestador is healthy
    const list = sh(
      "node",
      [
        path.join(root, ".agents/skills/automate-whatsapp/scripts/list-executions.js"),
        "--workflow-id",
        WF_ID,
        "--status",
        "handoff",
        "--limit",
        "10",
      ],
      { timeout: 30000 }
    );
    try {
      const j = JSON.parse(list.stdout || "{}");
      const diegoIds = await diegoConversationIds();
      const hit = (j?.data?.executions || []).find((e) => diegoIds.has(e.whatsapp_conversation_id));
      if (hit) {
        return { source: "handoff", texts: [], handoff: true, exec: hit.id };
      }
    } catch {
      /* ignore */
    }
    await sleep(8000);
  }
  return { source: "timeout", texts: [] };
}

function scoreExpect(botText, expect) {
  const t = botText || "";
  const checks = {};
  checks.no_maintenance = !/mantenimiento temporalmente|le (estoy|estaremos) en mantenimiento/i.test(t);
  checks.no_staff_upload_ok = !/Pedido S0\d{4} ingresado|CONFIRMO SUBIR|SUBIR PEDIDO/i.test(t);
  // Precio real o mínimo 6 — no basta "cotización" + "camiseta" del agente historial
  checks.bot_mentions_price_or_min6 =
    /\$\s*\d|50\.?000|30\.?000|35\.?000|valor unitario|total\s*(ser[ií]a|es|quedar)/i.test(t) ||
    /m[ií]nimo\s*(de\s*)?6|desde\s*6\s*unidades/i.test(t);
  const failed = Object.entries(expect || {})
    .filter(([k, want]) => want && checks[k] === false)
    .map(([k]) => k);
  return { checks, failed, ok: failed.length === 0 };
}

async function runProfile(profile) {
  await prepareDiegoLane();
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

  for (const step of profile.steps) {
    const stepAt = new Date().toISOString();
    if (step.type === "text") {
      const send = wacliJson(
        ["send", "text", "--to", LIFE_TO, "--message", step.message, "--post-send-wait", "3s"],
        90000
      );
      push(`- send_text: ${step.message.slice(0, 80)} ok=${send.ok}`);
      if (!send.ok || send.data?.success === false) {
        return { ok: false, error: "send_text_failed", profile: profile.id, log, bot_snippets: botCollected };
      }
    } else if (step.type === "file") {
      const files = listPackFiles(profile.media_pack, step.match, step.limit || 1);
      if (!files.length) {
        return { ok: false, error: "no_media", profile: profile.id, log, bot_snippets: botCollected };
      }
      for (const file of files) {
        const send = wacliJson(
          [
            "send",
            "file",
            "--to",
            LIFE_TO,
            "--file",
            file,
            "--caption",
            step.caption || path.basename(file),
            "--post-send-wait",
            "4s",
          ],
          180000
        );
        push(`- send_file: ${path.basename(file)} ok=${send.ok}`);
        if (!send.ok || send.data?.success === false) {
          return { ok: false, error: "send_file_failed", profile: profile.id, log, bot_snippets: botCollected };
        }
        await sleep(2000);
      }
    }

    const waitS = Math.max(step.wait_s || 35, 35);
    push(`  … waiting bot up to ${waitS}s`);
    const reply = await waitForBotReply(stepAt, botCollected, waitS);
    if (reply.handoff) {
      push(`  ! handoff ${String(reply.exec || "").slice(0, 8)} — reabriendo para continuar`);
      // End handoff so next profile step can start a fresh run; keep collected bot text
      await endBlockingDiegoExecs();
      await reopenDiegoConversations();
      await sleep(3000);
    }
    for (const t of reply.texts || []) {
      if (!botCollected.includes(t)) botCollected.push(t);
      push(`  bot[${reply.source}]: ${t.slice(0, 160)}`);
    }
    if (!reply.texts?.length && !reply.handoff) {
      push(`  bot: (sin respuesta en ${waitS}s)`);
    }
  }

  const msgs = await fetchWacliMsgs(startedAt);
  fs.writeFileSync(path.join(caseOut, "messages.json"), JSON.stringify(msgs, null, 2));
  const botFromWacli = msgs.filter((m) => !m.from_me && m.text).map((m) => m.text);
  for (const t of botFromWacli) {
    if (!botCollected.includes(t)) botCollected.push(t);
  }
  const kapsoSnips = await fetchKapsoBotSnippets();
  fs.writeFileSync(path.join(caseOut, "kapso_convs.json"), JSON.stringify(kapsoSnips, null, 2));
  for (const c of kapsoSnips) {
    if (c.text && Date.parse(c.last_out || 0) >= Date.parse(startedAt) - 5000 && !botCollected.includes(c.text)) {
      botCollected.push(c.text);
    }
  }

  const botText = botCollected.join("\n---\n");
  const score = scoreExpect(botText, profile.expect);
  const result = {
    ok: score.ok,
    profile: profile.id,
    slug: profile.slug,
    started_at: startedAt,
    bot_snippets: botCollected.map((t) => t.slice(0, 220)),
    score,
    expect: profile.expect,
  };
  fs.writeFileSync(path.join(caseOut, "result.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(caseOut, "TRACE.md"), log.join("\n") + "\n\n## Bot\n\n" + botText.slice(0, 4000));
  push(`## ${score.ok ? "OK" : "FAIL"} ${profile.slug} failed=${JSON.stringify(score.failed)}`);
  push(`Bot: ${botCollected[0]?.slice(0, 180) || "(sin respuesta)"}`);
  return result;
}

async function main() {
  const argv = process.argv.slice(2);
  const all = argv.includes("--all");
  const only = argv.includes("--profile") ? argv[argv.indexOf("--profile") + 1] : null;
  fs.mkdirSync(OUT, { recursive: true });
  const selected = PROFILES.profiles.filter((p) => all || !only || p.id === only || p.slug === only);
  if (!selected.length) {
    console.error("No profile. Use --profile P1|P2|P3 or --all");
    process.exit(1);
  }
  console.log("Customer lane E2E →", LIFE_TO, "profiles", selected.map((p) => p.id).join(","));
  const results = [];
  for (const p of selected) {
    console.log("\n========", p.id, p.slug, "========");
    results.push(await runProfile(p));
    await sleep(8000);
  }
  const summary = {
    at: new Date().toISOString(),
    pass: results.filter((r) => r.ok).length,
    total: results.length,
    results,
  };
  fs.writeFileSync(path.join(OUT, "SUMMARY.json"), JSON.stringify(summary, null, 2));
  const md = [
    `# E2E customer lane ${summary.at.slice(0, 10)}`,
    "",
    `**${summary.pass}/${summary.total}** OK · tester ${PROFILES.tester_wa} → Life ${LIFE_TO}`,
    "",
    "| ID | Slug | OK | Fail checks | First bot |",
    "|----|------|----|-------------|-----------|",
    ...results.map(
      (r) =>
        `| ${r.profile} | ${r.slug} | ${r.ok ? "✓" : "✗"} | ${(r.score?.failed || []).join(",") || "—"} | ${(r.bot_snippets?.[0] || "").replace(/\|/g, "/").slice(0, 80)} |`
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
