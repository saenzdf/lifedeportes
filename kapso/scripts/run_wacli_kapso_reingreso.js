#!/usr/bin/env node
/**
 * E2E Kapso vía wacli — legado SO inmediato (pre CRM-first).
 * Para el flujo nuevo (oportunidad → refino → HAZ PRESUPUESTO) usar:
 *   node kapso/scripts/run_wacli_staff_crm_flow.js
 *
 *   node kapso/scripts/run_wacli_kapso_reingreso.js --only 1
 */
import fs from "fs";
import path from "path";
import { spawnSync, spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const PACK = path.join(root, "scratch/kapso_staff_e2e_2026-07-12");
const OUT = path.join(root, "scratch/e2e_wacli_kapso_2026-07-12");
const LIFE_TO = "573222252942";
const STAFF = "573172575981";

const MATRIX = [
  { case: 1, partner_mode: "history", label: "PASTO", ask: "Cliente PASTO (historia). Excel Life + fotos. Pedido borrador Odoo test." },
  { case: 2, partner_mode: "history", label: "JORGE DUEÑOS DEL BALON", ask: "Cliente JORGE DUEÑOS DEL BALON (historia). Solo Excel." },
  { case: 3, partner_mode: "new", label: "E2E NUEVO WA LUCU", ask: "Cliente NUEVO: E2E NUEVO WA LUCU. Excel + logo. Crear partner nuevo." },
  { case: 4, partner_mode: "history", label: "NELSON ELEFANTES", ask: "Cliente NELSON ELEFANTES (mucha historia). Excel urgente." },
  { case: 5, partner_mode: "history", label: "FORTALEZA OMAR", ask: "Cliente FORTALEZA OMAR (historia). Solo Excel." },
  { case: 6, partner_mode: "history", label: "ADRIAN", ask: "Cliente ADRIAN (historia). Excel NO es FORMATO LIFE — espejo en nota." },
  { case: 7, partner_mode: "new", label: "E2E NUEVO WA DAVID", ask: "Cliente NUEVO: E2E NUEVO WA DAVID. Excel + fotos." },
  { case: 8, partner_mode: "history", label: "WILLIAM", ask: "Cliente WILLIAM (historia). Excel + fotos jugadores." },
  { case: 9, partner_mode: "history", label: "JEAN CARLOS F", ask: "Cliente JEAN CARLOS F (historia). Excel; si pide mín.6 confirma." },
  { case: 10, partner_mode: "new", label: "E2E NUEVO WA CHUCHO", ask: "Cliente NUEVO: E2E NUEVO WA CHUCHO. Excel Life." },
];

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
    error: r.error ? String(r.error.message || r.error) : null,
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
    odooRpc(env, "object", "execute_kw", [
      env.ODOO_DB,
      uid,
      env.ODOO_PASSWORD,
      model,
      method,
      a,
      k,
    ]);
}

function caseDir(n) {
  return path.join(PACK, `case_${String(n).padStart(2, "0")}`);
}

function listMedia(n, entryHint) {
  const dir = caseDir(n);
  const files = fs.readdirSync(dir);
  const xlsx = files.find((f) => /\.xlsx$/i.test(f) && !f.startsWith("~$"));
  const imgs = files.filter((f) => /\.(jpe?g|png|jfif)$/i.test(f));
  const out = [];
  if (xlsx) out.push({ path: path.join(dir, xlsx), kind: "xlsx", name: xlsx });
  const maxImg = /solo|excel_only|excel_life$/i.test(entryHint || "") ? 0 : 2;
  for (const f of imgs.slice(0, maxImg)) {
    out.push({ path: path.join(dir, f), kind: "image", name: f });
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function appendLog(caseOut, line) {
  const p = path.join(caseOut, "TRACE.md");
  fs.appendFileSync(p, `${line}\n`);
  console.log(line);
}

async function fetchRecentStaffMessages() {
  // Sync once then query messages with Life
  sh("wacli", ["sync", "--once", "--idle-exit", "8s", "--lock-wait", "60s"], { timeout: 90000 });
  const r = wacliJson(
    ["messages", "list", "--chat", LIFE_TO, "--limit", "25"],
    60000
  );
  return r;
}

function extractTexts(msgPayload) {
  const root = msgPayload?.data || msgPayload || {};
  const arr = root.messages || root.items || (Array.isArray(root) ? root : []);
  return arr.map((m) => {
    const text = m.Text || m.DisplayText || m.text || m.body || m.MediaCaption || "";
    return {
      id: m.MsgID || m.id,
      from_me: Boolean(m.FromMe ?? m.from_me ?? m.fromMe),
      ts: m.Timestamp || m.timestamp,
      text: String(text),
      media: m.MediaType || m.Filename || "",
    };
  });
}

async function findNewOrdersSince(kw, sinceIso, marker) {
  const domain = [
    ["create_date", ">=", sinceIso.slice(0, 19).replace("T", " ")],
    "|",
    ["note", "ilike", marker],
    ["partner_id.name", "ilike", marker.slice(0, 40)],
  ];
  // Broader: recent drafts
  const recent = await kw(
    "sale.order",
    "search_read",
    [[["create_date", ">=", sinceIso.slice(0, 19).replace("T", " ")]]],
    {
      fields: ["id", "name", "partner_id", "state", "amount_total", "note", "create_date"],
      limit: 20,
      order: "id desc",
    }
  );
  return recent;
}

async function auditOrder(kw, env, orderId) {
  const so = (
    await kw("sale.order", "read", [[orderId]], {
      fields: ["id", "name", "partner_id", "note", "order_line", "state", "amount_total"],
    })
  )[0];
  const sheets = await kw(
    "sale.order.spreadsheet",
    "search_read",
    [[["order_id", "=", orderId]]],
    { fields: ["id", "name", "spreadsheet_snapshot"], limit: 1, order: "id desc" }
  );
  const lines = await kw("sale.order.line", "read", [so.order_line || []], {
    fields: ["name", "product_uom_qty"],
  });
  let formulario_names = 0;
  let formulario_sample = [];
  try {
    const raw = sheets[0]?.spreadsheet_snapshot;
    if (raw) {
      let s = raw;
      if (typeof s === "string" && !s.trim().startsWith("{")) {
        s = Buffer.from(s, "base64").toString("utf8");
      }
      const data = typeof s === "string" ? JSON.parse(s) : s;
      const sh =
        (data.sheets || []).find((x) => /formulario|aprobaci/i.test(x.name || "")) ||
        data.sheets?.[0];
      const cells = sh?.cells || {};
      for (const [addr, cell] of Object.entries(cells)) {
        if (!/^C\d+$/i.test(addr) || Number(addr.slice(1)) < 2) continue;
        const v = typeof cell === "string" ? cell : cell?.content ?? cell?.value ?? "";
        if (String(v).trim()) {
          formulario_names += 1;
          if (formulario_sample.length < 3) formulario_sample.push(String(v).trim());
        }
      }
    }
  } catch {
    /* ignore decode */
  }
  return {
    so_name: so.name,
    partner: so.partner_id,
    state: so.state,
    amount_total: so.amount_total,
    note_preview: String(so.note || "")
      .replace(/<[^>]+>/g, " ")
      .slice(0, 240),
    lines: lines.map((l) => ({
      qty: l.product_uom_qty,
      name: String(l.name || "").split("\n")[0].slice(0, 50),
    })),
    spreadsheet_id: sheets[0]?.id || null,
    spreadsheet_url: sheets[0]
      ? `${env.ODOO_URL}/odoo/sales/${orderId}/sale-order-spreadsheet/${sheets[0].id}`
      : null,
    formulario_names,
    formulario_sample,
  };
}

async function runCase(env, kw, spec, stamp) {
  const caseOut = path.join(OUT, `case_${String(spec.case).padStart(2, "0")}`);
  fs.mkdirSync(caseOut, { recursive: true });
  fs.writeFileSync(path.join(caseOut, "TRACE.md"), `# Case ${spec.case} TRACE\n\n`);
  const marker = `WACLI-KAPSO ${stamp} C${spec.case}`;
  const startedAt = new Date().toISOString();
  const debug = {
    case: spec.case,
    started_at: startedAt,
    marker,
    staff: STAFF,
    to: LIFE_TO,
    steps: [],
    ok: false,
    error: null,
    stop_reason: null,
  };

  function step(name, detail) {
    debug.steps.push({ at: new Date().toISOString(), name, ...detail });
    appendLog(caseOut, `- **${name}**: ${JSON.stringify(detail).slice(0, 500)}`);
  }

  try {
    const intro = [
      `Pedido staff E2E vía WhatsApp.`,
      `Marker: ${marker}`,
      `Modo partner: ${spec.partner_mode}`,
      spec.ask,
      `Odoo TEST. NO confirmar presupuesto.`,
      `Si hace falta confirmación de subida responde después con CONFIRMO SUBIR.`,
    ].join("\n");

    appendLog(caseOut, `## Start ${startedAt}`);
    const textSend = wacliJson(
      ["send", "text", "--to", LIFE_TO, "--message", intro, "--post-send-wait", "3s"],
      90000
    );
    step("send_text", {
      ok: textSend.ok,
      status: textSend.status,
      data: textSend.data,
      stderr: textSend.stderr?.slice(0, 300),
    });
    if (!textSend.ok || textSend.data?.success === false) {
      throw Object.assign(new Error("wacli_send_text_failed"), {
        code: "WACLI_SEND_TEXT",
        detail: textSend,
      });
    }

    await sleep(2000);
    const media = listMedia(spec.case, spec.ask);
    step("media_plan", { files: media.map((m) => m.name) });
    if (!media.length) {
      throw Object.assign(new Error("no_media_in_pack"), { code: "NO_MEDIA" });
    }

    for (const m of media) {
      const caption =
        m.kind === "xlsx"
          ? `${marker} · Excel lista · ${spec.label}`
          : `${marker} · ref ${m.name}`;
      const fileSend = wacliJson(
        [
          "send",
          "file",
          "--to",
          LIFE_TO,
          "--file",
          m.path,
          "--caption",
          caption,
          "--post-send-wait",
          "4s",
        ],
        180000
      );
      step(`send_${m.kind}`, {
        file: m.name,
        ok: fileSend.ok,
        success: fileSend.data?.success,
        id: fileSend.data?.data?.id,
        error: fileSend.data?.error || fileSend.stderr?.slice(0, 400),
      });
      if (!fileSend.ok || fileSend.data?.success === false) {
        throw Object.assign(new Error(`wacli_send_file_failed:${m.name}`), {
          code: "WACLI_SEND_FILE",
          detail: fileSend,
        });
      }
      await sleep(2500);
    }

    // Esperar respuesta Kapso / pedir CONFIRMO si hace falta
    let confirmoSent = false;
    let lastBot = "";
    for (let attempt = 1; attempt <= 6; attempt++) {
      appendLog(caseOut, `## Poll attempt ${attempt}`);
      await sleep(attempt === 1 ? 20000 : 15000);
      const msgs = await fetchRecentStaffMessages();
      fs.writeFileSync(
        path.join(caseOut, `messages_poll_${attempt}.json`),
        JSON.stringify(msgs.data || msgs, null, 2)
      );
      const texts = extractTexts(msgs.data);
      const startedMs = Date.parse(startedAt);
      const textsFresh = texts.filter((t) => {
        const ts = Date.parse(t.ts || 0);
        return !Number.isFinite(startedMs) || !Number.isFinite(ts) || ts >= startedMs - 5000;
      });
      const recentBot = textsFresh.filter((t) => !t.from_me && t.text).slice(0, 8);
      const recentMine = textsFresh.filter((t) => t.from_me && t.text).slice(0, 5);
      step(`poll_${attempt}`, {
        bot_snippets: recentBot.map((t) => t.text.slice(0, 180)),
        mine_snippets: recentMine.map((t) => t.text.slice(0, 120)),
      });
      lastBot = recentBot.map((t) => t.text).join("\n---\n");

      const hardBlocked = /minimo 6|m[ií]nimo 6|Pedido incompleto/i.test(lastBot);
      const needsConfirmo =
        !hardBlocked &&
        /CONFIRMO SUBIR|confirmaci[oó]n|ambiguedad|parseo parcial/i.test(lastBot);
      const blockedAgain =
        confirmoSent &&
        /Responde CONFIRMO SUBIR|ambiguedad o parseo parcial/i.test(lastBot);
      const doneHint = /Pedido S0\d{4} ingresado|ingresado en Odoo \(borrador\)/i.test(lastBot);

      if (hardBlocked && attempt >= 2) {
        throw Object.assign(new Error("staff_write_blocked_min_or_incomplete"), {
          code: "WRITE_BLOCKED",
          lastBot: lastBot.slice(0, 2000),
        });
      }

      if (blockedAgain && attempt >= 2) {
        throw Object.assign(new Error("confirmo_not_consumed_by_kapso"), {
          code: "CONFIRMO_NOT_CONSUMED",
          lastBot: lastBot.slice(0, 2000),
        });
      }

      if (needsConfirmo && !confirmoSent) {
        const conf = wacliJson(
          [
            "send",
            "text",
            "--to",
            LIFE_TO,
            "--message",
            "CONFIRMO SUBIR",
            "--post-send-wait",
            "3s",
          ],
          90000
        );
        confirmoSent = true;
        step("send_confirmo", { ok: conf.ok, data: conf.data, message: "CONFIRMO SUBIR" });
        if (!conf.ok) {
          throw Object.assign(new Error("confirmo_send_failed"), {
            code: "WACLI_CONFIRMO",
            detail: conf,
          });
        }
        continue;
      }

      if (doneHint && confirmoSent) break;
      if (doneHint && attempt >= 3) break;
    }

    // Buscar SO nuevo en Odoo
    const orders = await findNewOrdersSince(kw, startedAt, marker);
    fs.writeFileSync(path.join(caseOut, "odoo_recent.json"), JSON.stringify(orders, null, 2));
    step("odoo_recent", {
      count: orders.length,
      names: orders.slice(0, 8).map((o) => o.name),
    });

    // Heurística: partner name match or note marker — SOLO pedidos recientes
    const needle = spec.label.replace(/E2E NUEVO WA /i, "").slice(0, 20);
    let hit =
      orders.find((o) => String(o.note || "").includes(marker)) ||
      orders.find((o) =>
        String(Array.isArray(o.partner_id) ? o.partner_id[1] : "").includes(needle)
      ) ||
      orders.find((o) =>
        String(Array.isArray(o.partner_id) ? o.partner_id[1] : "").includes(spec.label.slice(0, 12))
      ) ||
      orders[0] ||
      null;

    if (!hit) {
      // Si Kapso respondió con S0xxxx en mensajes FRESH, extraer
      const m = lastBot.match(/Pedido (S0\d{4}) ingresado/);
      if (m) {
        const found = await kw(
          "sale.order",
          "search_read",
          [[["name", "=", m[1]]]],
          { fields: ["id", "name", "partner_id", "state", "note", "create_date"], limit: 1 }
        );
        const cand = found[0] || null;
        if (cand && String(cand.create_date) >= startedAt.slice(0, 19).replace("T", " ")) {
          hit = cand;
          step("so_from_bot_text", { so: m[1], hit: true });
        } else {
          step("so_from_bot_text_rejected_stale", { so: m?.[1], create_date: cand?.create_date });
        }
      }
    }

    if (!hit) {
      throw Object.assign(new Error("no_so_found_after_wacli"), {
        code: "NO_SO_IN_ODOO",
        lastBot: lastBot.slice(0, 1500),
        recent_orders: orders.slice(0, 5),
      });
    }

    const audit = await auditOrder(kw, env, hit.id);
    step("audit", audit);
    if (!audit.formulario_names) {
      throw Object.assign(new Error("formulario_empty_after_kapso_write"), {
        code: "FORMULARIO_EMPTY",
        detail: audit,
        lastBot: lastBot.slice(0, 1500),
      });
    }
    debug.ok = true;
    debug.order = audit;
    debug.last_bot = lastBot.slice(0, 2000);
    fs.writeFileSync(path.join(caseOut, "result.json"), JSON.stringify(debug, null, 2));
    appendLog(
      caseOut,
      `## OK ${audit.so_name} partner=${JSON.stringify(audit.partner)} formulario=${audit.formulario_names}`
    );
    return debug;
  } catch (e) {
    debug.ok = false;
    debug.error = String(e.message || e);
    debug.stop_reason = e.code || "UNKNOWN";
    debug.detail = e.detail || e.recent_orders || null;
    debug.lastBot = e.lastBot || null;
    fs.writeFileSync(path.join(caseOut, "result.json"), JSON.stringify(debug, null, 2));
    writeDebugPlan(debug, caseOut);
    appendLog(caseOut, `## FAIL ${debug.stop_reason}: ${debug.error}`);
    return debug;
  }
}

function writeDebugPlan(debug, caseOut) {
  const plan = `# DEBUG PLAN — Case ${debug.case} (${debug.stop_reason})

## Qué falló
- **Código:** \`${debug.stop_reason}\`
- **Error:** ${debug.error}
- **Marker:** \`${debug.marker}\`
- **Staff → Life:** ${debug.staff} → ${debug.to}
- **Started:** ${debug.started_at}

## Evidencia
- TRACE: \`TRACE.md\`
- Polls: \`messages_poll_*.json\`
- result.json (steps + detail)

## Hipótesis por código

| Código | Hipótesis | Chequeo |
|--------|-----------|---------|
| WACLI_SEND_TEXT / FILE | Sesión wacli / lock / desconexión | \`wacli doctor\`; \`wacli sync --once\` |
| WACLI_CONFIRMO | No llegó confirmación | Ver mensajes en chat Life |
| NO_SO_IN_ODOO | Kapso no corrió writer / wrong env / agent stuck | Kapso executions; secrets test; reply bot |
| NO_MEDIA | Pack sin xlsx | case dir |

## Pasos de debug sugeridos
1. \`wacli doctor\` + re-sync.
2. Leer últimos mensajes del chat Life (poll json).
3. Kapso dashboard: última execution staff inbound — ¿error function? ¿wait CONFIRMO?
4. Odoo test: \`sale.order\` create_date >= started_at; buscar marker en note.
5. Verificar secrets Kapso \`odoo-create-lead-and-so\` apuntan a **test**.
6. Si agent pidió dato y no respondimos: ampliar script con reply al ask.
7. Si Excel no Life (case 6): confirmar mensaje espejo vs bloqueo.

## Last bot text
\`\`\`
${(debug.lastBot || debug.detail?.lastBot || "").toString().slice(0, 2000)}
\`\`\`
`;
  fs.writeFileSync(path.join(caseOut, "DEBUG.md"), plan);
  fs.writeFileSync(path.join(OUT, "LAST_DEBUG.md"), plan);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const local = loadEnv(path.join(root, ".env"));
  const env = {
    ODOO_URL:
      local.ODOO_LIFEDEPORTES_TEST_URL ||
      local.ODOO_LIFEDEPORTES_URL ||
      local.ODOO_URL,
    ODOO_DB:
      local.ODOO_LIFEDEPORTES_TEST_DB ||
      local.ODOO_LIFEDEPORTES_DB ||
      local.ODOO_DB,
    ODOO_USERNAME:
      local.ODOO_LIFEDEPORTES_TEST_USERNAME ||
      local.ODOO_LIFEDEPORTES_USERNAME ||
      local.ODOO_USERNAME,
    ODOO_PASSWORD:
      local.ODOO_LIFEDEPORTES_TEST_PASSWORD ||
      local.ODOO_LIFEDEPORTES_PASSWORD ||
      local.ODOO_PASSWORD,
  };
  console.log("Odoo", env.ODOO_URL, "Life WA", LIFE_TO, "Staff", STAFF);

  const doc = sh("wacli", ["doctor"], { timeout: 15000 });
  fs.writeFileSync(path.join(OUT, "wacli_doctor.txt"), doc.stdout + doc.stderr);

  const argv = process.argv.slice(2);
  let from = 1;
  let to = 1;
  if (argv.includes("--only")) {
    from = to = Number(argv[argv.indexOf("--only") + 1]);
  } else if (argv.includes("--from")) {
    from = Number(argv[argv.indexOf("--from") + 1]);
    to = Number(argv[argv.indexOf("--to") + 1] || from);
  }
  const stopOnError = argv.includes("--stop-on-error") || true;

  const kw = await makeKw(env);
  const stamp = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "");
  const results = [];

  for (let n = from; n <= to; n++) {
    const spec = MATRIX.find((m) => m.case === n);
    console.log(`\n======== CASE ${n} ${spec.label} ========`);
    const r = await runCase(env, kw, spec, stamp);
    results.push(r);
    fs.writeFileSync(path.join(OUT, "PROGRESS.json"), JSON.stringify(results, null, 2));
    if (!r.ok && stopOnError) {
      console.error("STOP ON ERROR", r.stop_reason, r.error);
      fs.writeFileSync(
        path.join(OUT, "REPORT.md"),
        `# E2E wacli→Kapso — DETENIDO en case ${n}\n\nVer \`case_${String(n).padStart(2, "0")}/DEBUG.md\` y \`LAST_DEBUG.md\`.\n`
      );
      process.exit(2);
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const report = [
    `# E2E wacli→Kapso ${stamp}`,
    "",
    `Staff ${STAFF} → Life ${LIFE_TO} · **${ok}/${results.length}**`,
    "",
    "| # | Label | OK | SO | Partner | Formulario |",
    "|---|-------|----|----|---------|------------|",
    ...results.map((r) => {
      const a = r.order || {};
      return `| ${r.case} | ${MATRIX.find((m) => m.case === r.case)?.label} | ${r.ok ? "✓" : "✗"} | ${a.so_name || "—"} | ${JSON.stringify(a.partner) || "—"} | ${a.spreadsheet_id || "—"} |`;
    }),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "REPORT.md"), report);
  fs.writeFileSync(path.join(OUT, "SUMMARY.json"), JSON.stringify(results, null, 2));
  console.log(report);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
