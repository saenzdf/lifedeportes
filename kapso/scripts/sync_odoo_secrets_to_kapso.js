#!/usr/bin/env node
/**
 * Sync Odoo credentials into Kapso function secrets (Platform API).
 *
 * Kapso no expone API para "Environment variables" Development/Production del
 * workflow; los secrets van por function y aplican a todas las ejecuciones.
 *
 * Usage (from lifedeportes/, lee .env):
 *   node kapso/scripts/sync_odoo_secrets_to_kapso.js --target test
 *   node kapso/scripts/sync_odoo_secrets_to_kapso.js --target prod
 *   node kapso/scripts/sync_odoo_secrets_to_kapso.js --target test --dry-run
 */
const fs = require("fs");
const path = require("path");

const STATIC_ODOO_FUNCTIONS = [
  { id: "4503ca5c-7114-4442-bada-112be3ddf67e", name: "odoo-search-product-price", extra: ["ODOO_SHOP_PUBLIC_URL"] },
  // Continuidad de sesión: necesita KAPSO_* para rehidratar quote entre conversaciones ended.
  {
    id: "93d89e4c-603b-49fc-96f9-0b1c13df86be",
    name: "classify-contact-odoo",
    extra: ["KAPSO_API_BASE_URL", "KAPSO_API_KEY", "KAPSO_WORKFLOW_ID"],
  },
  { id: "8a7b731d-480c-4abc-8a72-f965856d7515", name: "odoo-create-lead-and-so", extra: ["LIFE_DESIGN_PRODUCT_ID", "FORMULARIO_FILL_MODE"] },
  { id: "2fb9ca35-31f7-4b3a-84c7-8c03dc0a1775", name: "get-customer-card-scoped-odoo" },
  { id: "d889689a-c8bc-4183-a4ec-a793a5268b64", name: "get-customer-design-references-scoped-odoo" },
];

function loadCorrectionFunctionIds() {
  try {
    const p = path.join(__dirname, "..", "docs", "order_detail_function_ids.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const out = [];
    if (j.buscar_pedido_odoo) out.push({ id: j.buscar_pedido_odoo, name: "buscar-pedido-odoo" });
    if (j.corregir_pedido_odoo) out.push({ id: j.corregir_pedido_odoo, name: "corregir-pedido-odoo" });
    if (j.compile_staff_order_draft)
      out.push({ id: j.compile_staff_order_draft, name: "compile-staff-order-draft" });
    if (j.sync_order_draft_from_odoo)
      out.push({ id: j.sync_order_draft_from_odoo, name: "sync-order-draft-from-odoo" });
    return out;
  } catch {
    return [];
  }
}

function loadUnifiedPurchaseFunctionIds() {
  try {
    const p = path.join(__dirname, "..", "docs", "unified_staff_function_ids.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const out = [];
    if (j.crear_compra_odoo) out.push({ id: j.crear_compra_odoo, name: "crear-compra-odoo" });
    return out;
  } catch {
    return [];
  }
}

function odooFunctionsForSync() {
  const seen = new Set();
  const merged = [];
  for (const fn of [
    ...STATIC_ODOO_FUNCTIONS,
    ...loadCorrectionFunctionIds(),
    ...loadUnifiedPurchaseFunctionIds(),
  ]) {
    if (seen.has(fn.id)) continue;
    seen.add(fn.id);
    merged.push(fn);
  }
  return merged;
}

const BASE_SECRETS = ["ODOO_URL", "ODOO_DB", "ODOO_USERNAME", "ODOO_PASSWORD"];

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function resolveOdooEnv(localEnv, target) {
  if (target === "prod") {
    return {
      ODOO_URL: localEnv.ODOO_LIFEDEPORTES_PROD_URL,
      ODOO_DB: localEnv.ODOO_LIFEDEPORTES_PROD_DB,
      ODOO_USERNAME: localEnv.ODOO_LIFEDEPORTES_PROD_USERNAME || localEnv.ODOO_USERNAME,
      ODOO_PASSWORD: localEnv.ODOO_LIFEDEPORTES_PROD_PASSWORD || localEnv.ODOO_PASSWORD,
      LIFE_DESIGN_PRODUCT_ID: localEnv.LIFE_DESIGN_PRODUCT_ID_PROD || localEnv.LIFE_DESIGN_PRODUCT_ID || "504",
      FORMULARIO_FILL_MODE: localEnv.FORMULARIO_FILL_MODE || "both",
      ODOO_SHOP_PUBLIC_URL:
        localEnv.ODOO_LIFEDEPORTES_PROD_SHOP_URL ||
        "https://lifedeportes.odoo.com",
    };
  }
  return {
    ODOO_URL: localEnv.ODOO_URL || localEnv.ODOO_LIFEDEPORTES_URL,
    ODOO_DB: localEnv.ODOO_DB || localEnv.ODOO_LIFEDEPORTES_DB,
    ODOO_USERNAME: localEnv.ODOO_USERNAME || localEnv.ODOO_LIFEDEPORTES_USERNAME,
    ODOO_PASSWORD: localEnv.ODOO_PASSWORD || localEnv.ODOO_LIFEDEPORTES_PASSWORD,
    LIFE_DESIGN_PRODUCT_ID: localEnv.LIFE_DESIGN_PRODUCT_ID || "504",
    FORMULARIO_FILL_MODE: localEnv.FORMULARIO_FILL_MODE || "both",
    ODOO_SHOP_PUBLIC_URL: localEnv.ODOO_SHOP_PUBLIC_URL || localEnv.ODOO_URL || "",
  };
}

async function kapsoFetch(apiPath, init = {}) {
  const base = process.env.KAPSO_API_BASE_URL?.replace(/\/$/, "");
  const key = process.env.KAPSO_API_KEY;
  if (!base || !key) throw new Error("Missing KAPSO_API_BASE_URL or KAPSO_API_KEY");
  const resp = await fetch(`${base}${apiPath}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": key,
      ...(init.headers || {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await resp.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, json };
}

async function listSecretNames(functionId) {
  const res = await kapsoFetch(`/platform/v1/functions/${functionId}/secrets`);
  if (!res.ok) throw new Error(`list secrets ${functionId}: ${res.status}`);
  return (res.json?.data?.secrets || []).map((s) => s.name);
}

async function upsertSecret(functionId, name, value, dryRun) {
  if (dryRun) return { action: "dry-run", name };
  const existing = await listSecretNames(functionId);
  if (existing.includes(name)) {
    const del = await kapsoFetch(
      `/platform/v1/functions/${functionId}/secrets/${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );
    if (!del.ok && del.status !== 404) {
      throw new Error(`delete ${name} on ${functionId}: ${del.status}`);
    }
  }
  const create = await kapsoFetch(`/platform/v1/functions/${functionId}/secrets`, {
    method: "POST",
    body: { secret: { name, value: String(value) } },
  });
  if (!create.ok) {
    throw new Error(`create ${name} on ${functionId}: ${create.status} ${JSON.stringify(create.json)}`);
  }
  return { action: existing.includes(name) ? "replaced" : "created", name };
}

async function waitForFunctionDeployed(functionId, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await kapsoFetch(`/platform/v1/functions/${functionId}`);
    const status = res.json?.data?.status || res.json?.data?.data?.status;
    if (status === "deployed" || status === "active") return true;
    if (status === "error") {
      throw new Error(`function ${functionId} deploy error`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`function ${functionId} deploy timeout`);
}

async function deployFunction(functionId, dryRun) {
  if (dryRun) return { deployed: false };
  const res = await kapsoFetch(`/platform/v1/functions/${functionId}/deploy`, {
    method: "POST",
    body: {},
  });
  if (!res.ok && res.status !== 202) {
    throw new Error(`deploy ${functionId}: ${res.status}`);
  }
  await waitForFunctionDeployed(functionId);
  return { deployed: true, status: res.status };
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.includes("--prod") || args.includes("--target") && args[args.indexOf("--target") + 1] === "prod"
    ? "prod"
    : "test";
  const dryRun = args.includes("--dry-run");

  const envPath = path.join(__dirname, "..", "..", ".env");
  const localEnv = { ...loadEnvFile(envPath), ...process.env };
  const odoo = resolveOdooEnv(localEnv, target);

  for (const key of [...BASE_SECRETS, "LIFE_DESIGN_PRODUCT_ID", "ODOO_SHOP_PUBLIC_URL"]) {
    if (!odoo[key] && key !== "ODOO_SHOP_PUBLIC_URL" && key !== "LIFE_DESIGN_PRODUCT_ID") {
      throw new Error(`Missing ${key} for target=${target} (check .env)`);
    }
  }

  const ODOO_FUNCTIONS = odooFunctionsForSync();

  const report = {
    target,
    dry_run: dryRun,
    odoo_url: odoo.ODOO_URL,
    odoo_db: odoo.ODOO_DB,
    odoo_username: odoo.ODOO_USERNAME,
    functions: [],
  };

  const kapsoExtras = {
    KAPSO_API_BASE_URL: localEnv.KAPSO_API_BASE_URL,
    KAPSO_API_KEY: localEnv.KAPSO_API_KEY,
    KAPSO_WORKFLOW_ID:
      localEnv.KAPSO_WORKFLOW_ID || "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6",
  };
  const secretValues = { ...odoo, ...kapsoExtras };

  for (const fn of ODOO_FUNCTIONS) {
    const secretNames = [
      ...BASE_SECRETS,
      ...(fn.extra || []).filter((n) => secretValues[n] != null && secretValues[n] !== ""),
    ];
    const results = [];
    for (const name of secretNames) {
      results.push(await upsertSecret(fn.id, name, secretValues[name], dryRun));
    }
    const deploy = await deployFunction(fn.id, dryRun);
    report.functions.push({ ...fn, secrets: results, deploy });
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
