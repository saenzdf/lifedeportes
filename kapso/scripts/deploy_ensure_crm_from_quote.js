#!/usr/bin/env node
/**
 * Bundle gate+seed into ensure_crm_from_quote, upsert Kapso function, secrets, deploy.
 *
 *   node kapso/scripts/deploy_ensure_crm_from_quote.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const FN_NAME = "ensure-crm-from-quote";
const FN_ID_FILE = path.join(ROOT, "scratch", "ensure_crm_from_quote_function_id.txt");
const CODE_OUT = path.join(ROOT, "scratch", "ensure_crm_from_quote_bundled.js");
const SRC_FN = path.join(ROOT, "kapso", "functions", "ensure_crm_from_quote.js");
const SRC_SEED = path.join(ROOT, "kapso", "functions", "lib", "seed_crm_opportunity_inline.js");
const SRC_GATE = path.join(ROOT, "kapso", "functions", "lib", "crm_interest_gate.js");
const REG = path.join(ROOT, "kapso", "service_registry.json");

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

function stripExports(src) {
  return src
    .replace(/^\/\*\*[\s\S]*?\*\//, "")
    .replace(/^export\s+/gm, "")
    .replace(/export\s*\{[^}]+\};?/g, "")
    .replace(/if \(typeof globalThis[\s\S]*$/m, "")
    .replace(/globalThis\.\w+\s*=\s*\w+;?\s*/g, "");
}

function bundle() {
  // IIFE avoids duplicate top-level `compact`/`digits` between gate + seed (CF Workers ESM).
  const seed = stripExports(fs.readFileSync(SRC_SEED, "utf8"));
  const gate = stripExports(fs.readFileSync(SRC_GATE, "utf8"));

  let fn = fs.readFileSync(SRC_FN, "utf8");
  const G_START = "// --- LIFE_CRM_GATE_INLINE_START ---";
  const G_END = "// --- LIFE_CRM_GATE_INLINE_END ---";
  const S_START = "// --- LIFE_CRM_SEED_INLINE_START ---";
  const S_END = "// --- LIFE_CRM_SEED_INLINE_END ---";
  if (!fn.includes(G_START) || !fn.includes(S_START)) {
    throw new Error("missing inline markers in ensure_crm_from_quote.js");
  }
  const iife = `${G_START}
const { shouldSeedCrmOpportunity, buildOrderSummaryFromQuote, seedCrmOpportunityFromQuote } = (() => {
${gate}
${seed}
return { shouldSeedCrmOpportunity, buildOrderSummaryFromQuote, seedCrmOpportunityFromQuote };
})();
${G_END}

${S_START}
/* seed+gate bundled above in gate IIFE */
${S_END}`;
  fn = fn
    .replace(new RegExp(`${G_START}[\\s\\S]*?${G_END}`), "/* GATE_PLACEHOLDER */")
    .replace(new RegExp(`${S_START}[\\s\\S]*?${S_END}`), "/* SEED_PLACEHOLDER */");
  fn = fn.replace("/* GATE_PLACEHOLDER */", iife.split(`${S_START}`)[0].trim());
  fn = fn.replace(
    "/* SEED_PLACEHOLDER */",
    `${S_START}\n/* seed+gate bundled in gate IIFE above */\n${S_END}`
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
        description:
          "Deterministic CRM seed from vars.quote before vendor agent (Asistente Kapso)",
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
    if (st === "error") throw new Error("deploy error: " + JSON.stringify(data));
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("deploy timeout");
}

async function main() {
  loadEnv();
  const code = bundle();
  console.log("bundled", CODE_OUT, "bytes", code.length);

  const fnId = await resolveOrCreate(code);
  console.log("function_id", fnId);

  await kapso(`/platform/v1/functions/${fnId}`, {
    method: "PATCH",
    body: { function: { public_endpoint: false } },
  });

  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  let data = await waitDeployed(fnId);

  const secrets = {
    ODOO_URL: process.env.ODOO_LIFEDEPORTES_PROD_URL,
    ODOO_DB: process.env.ODOO_LIFEDEPORTES_PROD_DB,
    ODOO_USERNAME: process.env.ODOO_LIFEDEPORTES_PROD_USERNAME,
    ODOO_PASSWORD: process.env.ODOO_LIFEDEPORTES_PROD_PASSWORD,
    LIFE_CRM_SEED_ENABLED: "true",
    LIFE_CRM_DEFAULT_CLOSE_DAYS: "4",
    LIFE_CRM_SEED_STAGE_ID: "6",
    LIFE_KAPSO_PROJECT_ID: "b470d474-6a7a-4d84-a214-6cd4b198b4f3",
  };
  for (const [k, v] of Object.entries(secrets)) {
    if (!v) {
      console.log("skip secret", k);
      continue;
    }
    await upsertSecret(fnId, k, v);
    console.log("secret", k, "ok");
  }

  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  data = await waitDeployed(fnId);
  console.log("deployed", { id: fnId, endpoint: data.endpoint_url || null });

  const reg = JSON.parse(fs.readFileSync(REG, "utf8"));
  reg.functions = reg.functions || {};
  reg.functions.ensure_crm_from_quote = {
    kapso_function_name: FN_NAME,
    kapso_function_id: fnId,
    local_path: "kapso/functions/ensure_crm_from_quote.js",
    note: "Deterministic CRM seed before agent_orquestador (customer lane)",
  };
  if (reg.customer_lane) {
    const gf = new Set(reg.customer_lane.graph_functions || []);
    gf.add(FN_NAME);
    reg.customer_lane.graph_functions = [...gf];
    reg.customer_lane.ensure_crm_function_id = fnId;
  }
  fs.writeFileSync(REG, JSON.stringify(reg, null, 2) + "\n");
  console.log("registry updated");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
