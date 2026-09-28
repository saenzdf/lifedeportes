#!/usr/bin/env node
// RETIRADO 2026-09-16 — seed-crm-awaiting se borró de Kapso (carril staff = Hermes local).
console.error("RETIRADO: deploy_seed_crm_awaiting.js ya no aplica (ver kapso/docs/staff_hermes_bridge.md).");
process.exit(1);
/**
 * Inline seed lib → seed_crm_awaiting.js, upsert Kapso function, secrets, deploy, optional invoke.
 *
 * Usage:
 *   node kapso/scripts/deploy_seed_crm_awaiting.js
 *   node kapso/scripts/deploy_seed_crm_awaiting.js --invoke scratch/seed_crm_emily_payload.json
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const FN_NAME = "seed-crm-awaiting";
const FN_ID_FILE = path.join(ROOT, "scratch", "seed_crm_awaiting_function_id.txt");
const CODE_OUT = path.join(ROOT, "scratch", "seed_crm_awaiting_bundled.js");
const SRC_FN = path.join(ROOT, "kapso", "functions", "seed_crm_awaiting.js");
const SRC_SEED = path.join(ROOT, "kapso", "functions", "lib", "seed_crm_opportunity_inline.js");

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

async function kapso(apiPath, init = {}) {
  const base = (process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const key = process.env.KAPSO_API_KEY;
  const res = await fetch(`${base}${apiPath}`, {
    ...init,
    headers: {
      "X-API-Key": key,
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

function bundle() {
  let seed = fs
    .readFileSync(SRC_SEED, "utf8")
    .replace(/^\/\*\*[\s\S]*?\*\//, "")
    .replace(/if \(typeof globalThis[\s\S]*$/m, "");
  let fn = fs.readFileSync(SRC_FN, "utf8");
  const START = "// --- LIFE_CRM_SEED_INLINE_START ---";
  const END = "// --- LIFE_CRM_SEED_INLINE_END ---";
  if (!fn.includes(START)) throw new Error("missing inline markers");
  fn = fn.replace(
    new RegExp(`${START}[\\s\\S]*?${END}`),
    `${START}\n${seed}\n${END}`
  );
  fs.mkdirSync(path.dirname(CODE_OUT), { recursive: true });
  fs.writeFileSync(CODE_OUT, fn);
  return fn;
}

async function upsertSecret(fnId, name, value) {
  const list = await kapso(`/platform/v1/functions/${fnId}/secrets`);
  const names = (list.json?.data?.secrets || list.json?.data || []).map((s) => s.name || s);
  if (names.includes(name)) {
    await kapso(`/platform/v1/functions/${fnId}/secrets/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
  }
  const create = await kapso(`/platform/v1/functions/${fnId}/secrets`, {
    method: "POST",
    body: { secret: { name, value: String(value) } },
  });
  if (!create.ok) {
    throw new Error(`secret ${name}: ${create.status} ${JSON.stringify(create.json)}`);
  }
}

async function resolveOrCreate(code) {
  if (fs.existsSync(FN_ID_FILE)) {
    const id = fs.readFileSync(FN_ID_FILE, "utf8").trim();
    if (id) {
      const patch = await kapso(`/platform/v1/functions/${id}`, {
        method: "PATCH",
        body: { function: { name: FN_NAME, code } },
      });
      if (patch.ok) return id;
    }
  }
  const list = await kapso(`/platform/v1/functions`);
  const rows = list.json?.data || [];
  const hit = rows.find((f) => f.name === FN_NAME);
  if (hit?.id) {
    await kapso(`/platform/v1/functions/${hit.id}`, {
      method: "PATCH",
      body: { function: { name: FN_NAME, code } },
    });
    fs.writeFileSync(FN_ID_FILE, hit.id + "\n");
    return hit.id;
  }
  const created = await kapso(`/platform/v1/functions`, {
    method: "POST",
    body: {
      function: {
        name: FN_NAME,
        code,
        description: "Seed CRM opportunity from awaiting Kapso conversations (test/backlog)",
      },
    },
  });
  if (!created.ok) {
    throw new Error(`create fn: ${created.status} ${JSON.stringify(created.json)}`);
  }
  const id = created.json?.data?.id || created.json?.data?.data?.id;
  if (!id) throw new Error("no function id");
  fs.writeFileSync(FN_ID_FILE, id + "\n");
  return id;
}

async function waitDeployed(fnId) {
  for (let i = 0; i < 25; i++) {
    const g = await kapso(`/platform/v1/functions/${fnId}`);
    const data = g.json?.data?.data || g.json?.data || {};
    const st = data.status;
    console.log("status", st);
    if (st === "deployed" || st === "active") return data;
    if (st === "error") throw new Error("deploy error");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("deploy timeout");
}

async function main() {
  loadEnv();
  const invokeFile = (() => {
    const i = process.argv.indexOf("--invoke");
    return i >= 0 ? process.argv[i + 1] : null;
  })();

  const code = bundle();
  console.log("bundled", CODE_OUT, "bytes", code.length);

  const fnId = await resolveOrCreate(code);
  console.log("function_id", fnId);

  await kapso(`/platform/v1/functions/${fnId}`, {
    method: "PATCH",
    body: { function: { public_endpoint: false } },
  });

  // Deploy first — Kapso requires deployed function before secrets
  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  let data = await waitDeployed(fnId);
  console.log("deployed(initial)", { id: fnId, endpoint: data.endpoint_url || null });

  const secrets = {
    ODOO_URL: process.env.ODOO_LIFEDEPORTES_PROD_URL,
    ODOO_DB: process.env.ODOO_LIFEDEPORTES_PROD_DB,
    ODOO_USERNAME: process.env.ODOO_LIFEDEPORTES_PROD_USERNAME,
    ODOO_PASSWORD: process.env.ODOO_LIFEDEPORTES_PROD_PASSWORD,
    LIFE_CRM_SEED_ENABLED: "true",
    LIFE_CRM_DEFAULT_CLOSE_DAYS: "4",
    LIFE_CRM_SEED_STAGE_ID: "6",
  };
  for (const [k, v] of Object.entries(secrets)) {
    if (!v) {
      console.log("skip secret", k);
      continue;
    }
    await upsertSecret(fnId, k, v);
    console.log("secret", k, "ok");
  }

  // Redeploy so secrets bind
  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  data = await waitDeployed(fnId);
  console.log("deployed", { id: fnId, endpoint: data.endpoint_url || null });

  if (invokeFile) {
    const payload = JSON.parse(fs.readFileSync(invokeFile, "utf8"));
    const inv = await kapso(`/platform/v1/functions/${fnId}/invoke`, {
      method: "POST",
      body: payload,
    });
    console.log("invoke", inv.status, JSON.stringify(inv.json, null, 2));
    if (!inv.ok) process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
