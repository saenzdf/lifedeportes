#!/usr/bin/env node
/**
 * Toggle notify ventas Paola/Javier vs solo CRM.
 *
 *   node kapso/scripts/set_sales_notify_mode.js --mode crm-only [--dry-run]
 *   node kapso/scripts/set_sales_notify_mode.js --mode production [--dry-run]
 *
 * Snapshot previo: kapso/ops/notify_mode.snapshot.json
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const SNAPSHOT = path.join(__dirname, "..", "ops", "notify_mode.snapshot.json");
const REGISTRY = path.join(__dirname, "..", "service_registry.json");

const MODES = {
  "crm-only": {
    LIFE_SALES_NOTIFY_ENABLED: "false",
    label: "Solo CRM — sin WA proactivo a Paola/Javier",
  },
  production: {
    LIFE_SALES_NOTIFY_ENABLED: "true",
    LIFE_SALES_NOTIFY_PHONES: "573213988464,573103362484",
    label: "Producción — notify + CRM",
  },
};

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
  const out = { dryRun: false, mode: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") out.dryRun = true;
    else if (argv[i] === "--mode") out.mode = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") out.help = true;
  }
  return out;
}

async function kapso(apiPath, init = {}) {
  const base = (process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const res = await fetch(`${base}${apiPath}`, {
    ...init,
    headers: {
      "X-API-Key": process.env.KAPSO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
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
  return { ok: res.ok, status: res.status, json };
}

async function listSecrets(fnId) {
  const list = await kapso(`/platform/v1/functions/${fnId}/secrets`);
  const rows = list.json?.data?.secrets || list.json?.data || [];
  return Object.fromEntries(
    rows.map((s) => {
      const name = s.name || s;
      return [name, s.value ?? s];
    })
  );
}

async function upsertSecret(fnId, name, value, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] ${fnId.slice(0, 8)} secret ${name}=${value}`);
    return { ok: true, dry: true };
  }
  const names = Object.keys(await listSecrets(fnId));
  if (names.includes(name)) {
    await kapso(`/platform/v1/functions/${fnId}/secrets/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
  }
  const create = await kapso(`/platform/v1/functions/${fnId}/secrets`, {
    method: "POST",
    body: { secret: { name, value: String(value) } },
  });
  if (!create.ok) throw new Error(`secret ${name} ${create.status}`);
  return create;
}

async function redeploy(fnId, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] redeploy ${fnId}`);
    return;
  }
  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const g = await kapso(`/platform/v1/functions/${fnId}`);
    const data = g.json?.data?.data || g.json?.data || {};
    if (data.status === "deployed" || data.status === "active") {
      console.log("deployed", fnId.slice(0, 8), data.status);
      return;
    }
  }
  throw new Error(`deploy timeout ${fnId}`);
}

function functionIds() {
  const reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  const ids = [];
  const notify = reg.functions?.notify_sales_interest?.kapso_function_id;
  if (notify) ids.push({ id: notify, label: "notify-sales-interest" });
  const flush = reg.functions?.morning_flush_staff_notifies?.kapso_function_id;
  if (flush) ids.push({ id: flush, label: "morning-flush-staff-notifies" });
  return ids;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.mode || !MODES[args.mode]) {
    console.log(`Usage: set_sales_notify_mode.js --mode crm-only|production [--dry-run]`);
    process.exit(args.help ? 0 : 1);
  }
  if (!process.env.KAPSO_API_KEY) {
    console.error("missing KAPSO_API_KEY");
    process.exit(2);
  }

  const target = MODES[args.mode];
  const fns = functionIds();
  if (!fns.length) throw new Error("no function ids in service_registry");

  const primary = fns[0].id;
  let before = {};
  try {
    before = await listSecrets(primary);
  } catch (err) {
    console.warn("could not read secrets:", err.message);
  }

  if (!args.dryRun) {
    fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
    fs.writeFileSync(
      SNAPSHOT,
      JSON.stringify(
        {
          saved_at: new Date().toISOString(),
          mode_before: before.LIFE_SALES_NOTIFY_ENABLED || "unknown",
          secrets: {
            LIFE_SALES_NOTIFY_ENABLED: before.LIFE_SALES_NOTIFY_ENABLED ?? null,
            LIFE_SALES_NOTIFY_PHONES: before.LIFE_SALES_NOTIFY_PHONES ?? null,
          },
        },
        null,
        2
      ) + "\n"
    );
    console.log("snapshot", SNAPSHOT);
  }

  console.log("mode", args.mode, "—", target.label);
  for (const fn of fns) {
    for (const [k, v] of Object.entries(target)) {
      if (k === "label") continue;
      await upsertSecret(fn.id, k, v, args.dryRun);
    }
    if (args.mode === "crm-only") {
      await upsertSecret(fn.id, "LIFE_CRM_SEED_ENABLED", "true", args.dryRun);
    }
    await redeploy(fn.id, args.dryRun);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dry_run: args.dryRun,
        mode: args.mode,
        functions: fns.map((f) => f.label),
        secrets_set: Object.keys(target).filter((k) => k !== "label"),
        rollback: "node kapso/scripts/set_sales_notify_mode.js --mode production",
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
