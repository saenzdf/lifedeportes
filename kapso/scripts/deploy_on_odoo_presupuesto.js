/**
 * Deploy on-odoo-presupuesto: bundle lista libs → upsert code → secrets → public → deploy.
 * Usage: node kapso/scripts/deploy_on_odoo_presupuesto.js [--invoke]
 *        node kapso/scripts/deploy_on_odoo_presupuesto.js --invoke=3578,2790
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const FN_FILE = path.join(ROOT, "scratch", "on_odoo_presupuesto_function_id.txt");
const SECRET_FILE = path.join(ROOT, "scratch", "presupuesto_webhook_secret.txt");
const BUNDLE = path.join(ROOT, "kapso", "functions", "on_odoo_presupuesto_deploy.js");
const FN_ID_DEFAULT = "ecc7008e-0f18-4af9-9753-02825037ddcc";

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
  return create.status;
}

async function waitDeployed(fnId) {
  for (let i = 0; i < 30; i++) {
    const g = await kapso(`/platform/v1/functions/${fnId}`);
    const data = g.json?.data?.data || g.json?.data || {};
    if (data.status === "deployed" || data.status === "active") return data;
    if (data.status === "error") throw new Error("function deploy error");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("deploy timeout");
}

async function main() {
  loadEnv();
  execSync("node kapso/scripts/bundle_on_odoo_presupuesto.js", { cwd: ROOT, stdio: "inherit" });
  const code = fs.readFileSync(BUNDLE, "utf8");
  let fnId = fs.existsSync(FN_FILE) ? fs.readFileSync(FN_FILE, "utf8").trim() : FN_ID_DEFAULT;
  if (!fnId) fnId = FN_ID_DEFAULT;

  let secret = process.env.LIFE_ODOO_WEBHOOK_SECRET || "";
  if (!secret && fs.existsSync(SECRET_FILE)) {
    secret = fs.readFileSync(SECRET_FILE, "utf8").trim();
  }
  if (!secret) {
    secret = crypto.randomBytes(24).toString("base64url");
  }
  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  fs.writeFileSync(SECRET_FILE, secret + "\n");

  const patch = await kapso(`/platform/v1/functions/${fnId}`, {
    method: "PATCH",
    body: { function: { name: "on-odoo-presupuesto", code, public_endpoint: true } },
  });
  if (!patch.ok) {
    throw new Error(`patch code: ${patch.status} ${JSON.stringify(patch.json)}`);
  }
  console.log("patched code", patch.status);

  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  const data = await waitDeployed(fnId);
  console.log("deployed", data.endpoint_url || data.id, "public", data.public_endpoint);

  const secrets = {
    LIFE_ODOO_WEBHOOK_SECRET: secret,
    ODOO_URL: process.env.ODOO_LIFEDEPORTES_PROD_URL,
    ODOO_DB: process.env.ODOO_LIFEDEPORTES_PROD_DB,
    ODOO_USERNAME: process.env.ODOO_LIFEDEPORTES_PROD_USERNAME,
    ODOO_PASSWORD: process.env.ODOO_LIFEDEPORTES_PROD_PASSWORD,
    LIFE_DESIGN_PRODUCT_ID: process.env.LIFE_DESIGN_PRODUCT_ID || "504",
    LIFE_SALE_ORDER_TEMPLATE_ID: "1",
  };
  for (const [k, v] of Object.entries(secrets)) {
    if (!v) {
      console.log("skip", k);
      continue;
    }
    const st = await upsertSecret(fnId, k, v);
    console.log("secret", k, st);
  }

  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  await waitDeployed(fnId);

  const invokeArg = process.argv.find((a) => a === "--invoke" || a.startsWith("--invoke="));
  if (invokeArg) {
    const payload = { lead_id: 3578, so_id: 2790, force_lista: true };
    if (invokeArg.startsWith("--invoke=") && invokeArg.length > 9) {
      const parts = invokeArg.slice(9).split(",");
      if (parts[0]) payload.lead_id = Number(parts[0]);
      if (parts[1]) payload.so_id = Number(parts[1]);
    }
    const endpoint = `https://api.kapso.ai/platform/v1/functions/${fnId}/invoke`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Life-Webhook-Secret": secret,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log("invoke", res.status, text.slice(0, 1500));
  }

  console.log(
    JSON.stringify(
      {
        function_id: fnId,
        endpoint: `https://api.kapso.ai/platform/v1/functions/${fnId}/invoke`,
        secret_file: SECRET_FILE,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
