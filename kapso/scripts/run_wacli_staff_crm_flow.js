#!/usr/bin/env node
/**
 * E2E staff CRM-first (jul 2026 ADR 0008):
 *   1) hola → menú (sin nombre personal)
 *   2) cliente + estimado → oportunidad CRM (sin SO)
 *   3) Excel + fotos → actualiza CRM
 *   4) HAZ PRESUPUESTO → SO draft + Formulario
 *
 *   node kapso/scripts/run_wacli_staff_crm_flow.js
 *   node kapso/scripts/run_wacli_staff_crm_flow.js --skip-hola
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const PACK = path.join(root, "scratch/kapso_staff_e2e_2026-07-12/case_01");
const OUT = path.join(root, "scratch/e2e_staff_crm_first");
const LIFE_TO = "573222252942";
const STAFF = "573172575981";
const LABEL = "PASTO";

function loadEnv(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    timeout: opts.timeout || 120000,
    maxBuffer: 20 * 1024 * 1024,
    ...opts,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
  };
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

async function odooRpc(env, service, method, args) {
  const resp = await fetch(`${env.ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args } }),
  });
  const json = await resp.json();
  if (json.error) throw new Error(json.error?.data?.message || json.error?.message || "rpc");
  return json.result;
}

async function makeKw(env) {
  const uid = await odooRpc(env, "common", "authenticate", [
    env.ODOO_DB,
    env.ODOO_USERNAME,
    env.ODOO_PASSWORD,
    {},
  ]);
  return (model, method, a = [], k = {}) =>
    odooRpc(env, "object", "execute_kw", [env.ODOO_DB, uid, env.ODOO_PASSWORD, model, method, a, k]);
}

function fetchMsgs() {
  return wacliJson(
    ["messages", "list", "--chat", LIFE_TO, "--limit", "25"],
    60000
  );
}

function extractTexts(data) {
  const msgs = data?.data?.messages || data?.messages || [];
  return msgs.map((m) => ({
    from_me: Boolean(m.FromMe),
    text: String(m.Text || m.DisplayText || m.MediaCaption || ""),
    ts: m.Timestamp || "",
  }));
}

function freshBotText(startedAt, data) {
  const startedMs = Date.parse(startedAt);
  return extractTexts(data)
    .filter((t) => {
      const ts = Date.parse(t.ts || 0);
      return (
        !t.from_me &&
        t.text &&
        (!Number.isFinite(startedMs) || !Number.isFinite(ts) || ts >= startedMs - 5000)
      );
    })
    .map((t) => t.text);
}

function listPackMedia() {
  if (!fs.existsSync(PACK)) return [];
  const files = fs.readdirSync(PACK);
  const xlsx = files.find((f) => /\.xlsx$/i.test(f) && !f.startsWith("~$"));
  const imgs = files.filter((f) => /\.(jpe?g|png)$/i.test(f)).slice(0, 2);
  const out = [];
  if (xlsx) out.push({ path: path.join(PACK, xlsx), kind: "xlsx", name: xlsx });
  for (const f of imgs) out.push({ path: path.join(PACK, f), kind: "image", name: f });
  return out;
}

function append(logPath, line) {
  fs.appendFileSync(logPath, line + "\n");
}

function assertGreeting(text) {
  const t = String(text || "");
  const checks = {
    starts_hola: /^\s*Hola\b/i.test(t) || /\bHola\b/.test(t),
    no_diego: !/\bDiego\b/i.test(t),
    menu_pedido: /Ingresar un pedido nuevo/i.test(t),
    menu_corregir: /Corregir un pedido/i.test(t),
    menu_consultar: /Consultar un pedido/i.test(t),
    menu_compra: /Ingresar una compra|ingresar.*compra/i.test(t),
    menu_nomina: /Ingresar n[oó]mina|ingresar.*n[oó]mina/i.test(t),
  };
  checks.ok = Object.values(checks).every(Boolean);
  return checks;
}

async function pollUntil(startedAt, pred, { attempts = 8, firstWait = 18000, nextWait = 12000 } = {}) {
  let last = [];
  for (let i = 1; i <= attempts; i++) {
    await sleep(i === 1 ? firstWait : nextWait);
    sh("wacli", ["sync", "--once", "--idle-exit", "6s"], { timeout: 60000 });
    const msgs = fetchMsgs();
    last = freshBotText(startedAt, msgs.data);
    if (pred(last.join("\n---\n"), last)) return { ok: true, attempt: i, texts: last };
  }
  return { ok: false, attempt: attempts, texts: last };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const skipHola = process.argv.includes("--skip-hola");
  const local = loadEnv(path.join(root, ".env"));
  const env = {
    ODOO_URL: local.ODOO_LIFEDEPORTES_URL || local.ODOO_URL,
    ODOO_DB: local.ODOO_LIFEDEPORTES_DB || local.ODOO_DB,
    ODOO_USERNAME: local.ODOO_LIFEDEPORTES_USERNAME || local.ODOO_USERNAME,
    ODOO_PASSWORD: local.ODOO_LIFEDEPORTES_PASSWORD || local.ODOO_PASSWORD,
  };
  const kw = await makeKw(env);
  const stamp = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "");
  const marker = `WACLI-CRM ${stamp}`;
  const logPath = path.join(OUT, "TRACE.md");
  const report = { marker, stamp, staff: STAFF, to: LIFE_TO, phases: {}, ok: false };
  fs.writeFileSync(logPath, `# Staff CRM-first E2E ${stamp}\n\n`);

  console.log("Odoo", env.ODOO_URL, "marker", marker);

  // --- Phase 0: hola / menú ---
  if (!skipHola) {
    const t0 = new Date().toISOString();
    append(logPath, `## Phase 0 hola ${t0}`);
    const send = wacliJson(
      ["send", "text", "--to", LIFE_TO, "--message", "hola", "--post-send-wait", "3s"],
      90000
    );
    if (!send.ok) throw new Error("wacli hola failed");
    const polled = await pollUntil(t0, (joined) => /carril de ingreso|Qu[eé] necesitas|quota|exceeded/i.test(joined), {
      attempts: 5,
      firstWait: 12000,
    });
    const greetingText = polled.texts[0] || "";
    if (/quota|exceeded your current|billing details/i.test(greetingText)) {
      report.phases.hola = { fail: "KAPSO_QUOTA", text: greetingText.slice(0, 400) };
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, "RESULT.json"), JSON.stringify(report, null, 2));
      console.error(
        "FAIL KAPSO_QUOTA — límite de tokens de esta conversación (p. ej. ~18k). No es falta de saldo. Usa otro chat o sube el límite; no reintentar en este número por ahora."
      );
      process.exit(3);
    }
    const g = assertGreeting(greetingText);
    report.phases.hola = { ...g, text: greetingText.slice(0, 500), poll_ok: polled.ok };
    append(logPath, `- greeting_checks: ${JSON.stringify(g)}`);
    append(logPath, `- bot: ${greetingText.slice(0, 400)}`);
    if (!g.ok) {
      fs.writeFileSync(path.join(OUT, "RESULT.json"), JSON.stringify(report, null, 2));
      console.error("FAIL greeting", g);
      process.exit(2);
    }
    console.log("OK phase0 greeting");
  }

  // --- Phase 1: estimado → oportunidad ---
  const t1 = new Date().toISOString();
  append(logPath, `\n## Phase 1 oportunidad ${t1}`);
  const intro = [
    `Subir pedido. Marker: ${marker}`,
    `Cliente: ${LABEL}`,
    `Estimado: 20 uniformes de futbol dry-fit.`,
    `Odoo TEST. Crear oportunidad CRM (aún sin lista completa). NO crear presupuesto todavía.`,
  ].join("\n");
  const s1 = wacliJson(
    ["send", "text", "--to", LIFE_TO, "--message", intro, "--post-send-wait", "3s"],
    90000
  );
  if (!s1.ok) throw new Error("wacli phase1 failed");

  const p1 = await pollUntil(
    t1,
    (joined) =>
      /Oportunidad CRM|odoo\/crm\/|crm\/\d+/i.test(joined) &&
      !/Pedido S0\d{4} ingresado|S0\d{4} borrador/i.test(joined),
    { attempts: 8, firstWait: 20000, nextWait: 15000 }
  );
  const bot1 = p1.texts.join("\n---\n");
  const leadMatch = bot1.match(/odoo\/crm\/(\d+)/i) || bot1.match(/crm\/(\d+)/i);
  const leadId = leadMatch ? Number(leadMatch[1]) : null;
  report.phases.opportunity = {
    poll_ok: p1.ok,
    lead_id_from_wa: leadId,
    bot: bot1.slice(0, 800),
    no_so_in_wa: !/Pedido S0\d{4}|S0\d{4} borrador/i.test(bot1),
  };
  append(logPath, `- lead_from_wa: ${leadId}`);
  append(logPath, `- bot: ${bot1.slice(0, 600)}`);

  // Odoo: lead exists; no new SO with marker
  const leads = await kw(
    "crm.lead",
    "search_read",
    [[["name", "ilike", LABEL], ["create_date", ">=", t1.slice(0, 19).replace("T", " ")]]],
    { fields: ["id", "name", "description", "create_date"], limit: 5, order: "id desc" }
  );
  const sosEarly = await kw(
    "sale.order",
    "search_read",
    [[["create_date", ">=", t1.slice(0, 19).replace("T", " ")], ["note", "ilike", marker]]],
    { fields: ["id", "name"], limit: 5 }
  );
  report.phases.opportunity.leads_odoo = leads.map((l) => ({ id: l.id, name: l.name }));
  report.phases.opportunity.sos_too_early = sosEarly.map((o) => o.name);
  if (!p1.ok && !leads.length) {
    fs.writeFileSync(path.join(OUT, "RESULT.json"), JSON.stringify(report, null, 2));
    console.error("FAIL phase1 no CRM");
    process.exit(2);
  }
  if (sosEarly.length) {
    report.phases.opportunity.fail = "SO created too early";
    fs.writeFileSync(path.join(OUT, "RESULT.json"), JSON.stringify(report, null, 2));
    console.error("FAIL phase1 SO too early", sosEarly);
    process.exit(2);
  }
  const leadIdFinal = leadId || leads[0]?.id || null;
  console.log("OK phase1 opportunity", leadIdFinal);

  // --- Phase 2: Excel + fotos → refine CRM ---
  const t2 = new Date().toISOString();
  append(logPath, `\n## Phase 2 refine ${t2}`);
  const media = listPackMedia();
  if (!media.length) throw new Error("no pack media in case_01");
  for (const m of media) {
    const caption =
      m.kind === "xlsx"
        ? `${marker} · Excel lista · ${LABEL} · actualizar oportunidad`
        : `${marker} · ref ${m.name}`;
    const fsSend = wacliJson(
      ["send", "file", "--to", LIFE_TO, "--file", m.path, "--caption", caption, "--post-send-wait", "4s"],
      180000
    );
    append(logPath, `- send_${m.kind}: ${fsSend.ok} ${m.name}`);
    if (!fsSend.ok) throw new Error(`send ${m.name} failed`);
    await sleep(2000);
  }

  const p2 = await pollUntil(
    t2,
    (joined) =>
      /actualic[eé]|oportunidad|crm\//i.test(joined) &&
      !/clasifico|parseo el Excel|Ahora busco|ID \d+/i.test(joined),
    { attempts: 8, firstWait: 25000, nextWait: 15000 }
  );
  const bot2 = p2.texts.join("\n---\n");
  const narrates = /clasifico|parseo el Excel|Ahora busco|fusiono el borrador|ID \d{2,}/i.test(bot2);
  report.phases.refine = {
    poll_ok: p2.ok,
    no_tool_narration: !narrates,
    bot: bot2.slice(0, 800),
  };
  append(logPath, `- refine_bot: ${bot2.slice(0, 600)}`);
  if (narrates) {
    console.warn("WARN phase2 still narrating tools");
  }
  console.log("OK phase2 refine (poll", p2.ok, "narration", narrates, ")");

  // --- Phase 3: HAZ PRESUPUESTO → SO ---
  const t3 = new Date().toISOString();
  append(logPath, `\n## Phase 3 presupuesto ${t3}`);
  const s3 = wacliJson(
    [
      "send",
      "text",
      "--to",
      LIFE_TO,
      "--message",
      "HAZ PRESUPUESTO. Lista y referencias listas. Marker " + marker,
      "--post-send-wait",
      "3s",
    ],
    90000
  );
  if (!s3.ok) throw new Error("wacli HAZ PRESUPUESTO failed");

  const p3 = await pollUntil(
    t3,
    (joined) => /S0\d{4}|borrador|Formulario/i.test(joined),
    { attempts: 10, firstWait: 25000, nextWait: 18000 }
  );
  const bot3 = p3.texts.join("\n---\n");
  const soMatch = bot3.match(/\b(S0\d{4})\b/);
  report.phases.presupuesto = { poll_ok: p3.ok, bot: bot3.slice(0, 800), so_from_wa: soMatch?.[1] || null };
  append(logPath, `- presupuesto_bot: ${bot3.slice(0, 600)}`);

  let soName = soMatch?.[1] || null;
  let so = null;
  if (soName) {
    const found = await kw(
      "sale.order",
      "search_read",
      [[["name", "=", soName]]],
      { fields: ["id", "name", "partner_id", "state", "opportunity_id", "amount_total"], limit: 1 }
    );
    so = found[0] || null;
  } else {
    const recent = await kw(
      "sale.order",
      "search_read",
      [[["create_date", ">=", t3.slice(0, 19).replace("T", " ")]]],
      {
        fields: ["id", "name", "partner_id", "state", "opportunity_id", "note", "create_date"],
        limit: 8,
        order: "id desc",
      }
    );
    so =
      recent.find((o) => String(Array.isArray(o.partner_id) ? o.partner_id[1] : "").includes(LABEL)) ||
      recent[0] ||
      null;
    soName = so?.name || null;
  }

  if (!so) {
    report.ok = false;
    report.error = "NO_SO_AFTER_HAZ_PRESUPUESTO";
    fs.writeFileSync(path.join(OUT, "RESULT.json"), JSON.stringify(report, null, 2));
    console.error("FAIL phase3 no SO");
    process.exit(2);
  }

  const sheets = await kw(
    "sale.order.spreadsheet",
    "search_read",
    [[["order_id", "=", so.id]]],
    { fields: ["id", "name"], limit: 1, order: "id desc" }
  );
  report.phases.presupuesto.so = {
    name: so.name,
    state: so.state,
    opportunity_id: so.opportunity_id,
    spreadsheet_id: sheets[0]?.id || null,
  };
  report.ok =
    so.state === "draft" &&
    Boolean(so.opportunity_id) &&
    report.phases.opportunity.no_so_in_wa !== false;

  fs.writeFileSync(path.join(OUT, "RESULT.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(OUT, "REPORT.md"),
    [
      `# Staff CRM-first ${stamp}`,
      "",
      `- OK: ${report.ok}`,
      `- Lead: ${leadIdFinal}`,
      `- SO: ${so.name} (opp=${JSON.stringify(so.opportunity_id)})`,
      `- Formulario sheet: ${sheets[0]?.id || "—"}`,
      "",
    ].join("\n")
  );
  append(logPath, `## OK ${so.name} lead=${leadIdFinal}`);
  console.log(report.ok ? `OK ${so.name}` : `PARTIAL ${so.name}`);
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
