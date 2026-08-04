#!/usr/bin/env node
/**
 * Deploy on-odoo-task-lista: bundle → upsert → secrets → public → deploy.
 * Usage:
 *   node kapso/scripts/deploy_on_odoo_task_lista.js
 *   node kapso/scripts/deploy_on_odoo_task_lista.js --invoke=2599
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const FN_FILE = path.join(ROOT, "scratch", "on_odoo_task_lista_function_id.txt");
const SECRET_FILE = path.join(ROOT, "scratch", "task_lista_webhook_secret.txt");
const PRESUPUESTO_SECRET = path.join(ROOT, "scratch", "presupuesto_webhook_secret.txt");
const BUNDLE = path.join(ROOT, "kapso", "functions", "on_odoo_task_lista_deploy.js");
const FN_NAME = "on-odoo-task-lista";

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
  if (value == null || value === "") return;
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
  for (let i = 0; i < 40; i++) {
    const g = await kapso(`/platform/v1/functions/${fnId}`);
    const data = g.json?.data?.data || g.json?.data || {};
    if (data.status === "deployed" || data.status === "active") return data;
    if (data.status === "error") throw new Error("function deploy error");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("deploy timeout");
}

async function resolveOrCreate(code) {
  let fnId = fs.existsSync(FN_FILE) ? fs.readFileSync(FN_FILE, "utf8").trim() : "";
  if (fnId) {
    const patch = await kapso(`/platform/v1/functions/${fnId}`, {
      method: "PATCH",
      body: { function: { name: FN_NAME, code, public_endpoint: true } },
    });
    if (patch.ok) return fnId;
  }
  const create = await kapso(`/platform/v1/functions`, {
    method: "POST",
    body: {
      function: {
        name: FN_NAME,
        code,
        public_endpoint: true,
        description: "Odoo task Acción: interpretar lista Excel/PDF/imagen → description + SO note",
      },
    },
  });
  if (!create.ok) {
    throw new Error(`create function: ${create.status} ${JSON.stringify(create.json)}`);
  }
  fnId =
    create.json?.data?.data?.id ||
    create.json?.data?.id ||
    create.json?.id ||
    "";
  if (!fnId) throw new Error(`no function id in ${JSON.stringify(create.json)}`);
  fs.mkdirSync(path.dirname(FN_FILE), { recursive: true });
  fs.writeFileSync(FN_FILE, fnId + "\n");
  return fnId;
}

function resolveSecret() {
  if (process.env.LIFE_TASK_LISTA_WEBHOOK_SECRET) {
    return process.env.LIFE_TASK_LISTA_WEBHOOK_SECRET;
  }
  if (fs.existsSync(SECRET_FILE)) {
    const s = fs.readFileSync(SECRET_FILE, "utf8").trim();
    if (s) return s;
  }
  if (fs.existsSync(PRESUPUESTO_SECRET)) {
    const s = fs.readFileSync(PRESUPUESTO_SECRET, "utf8").trim();
    if (s) return s;
  }
  if (process.env.LIFE_ODOO_WEBHOOK_SECRET) return process.env.LIFE_ODOO_WEBHOOK_SECRET;
  const generated = crypto.randomBytes(24).toString("base64url");
  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  fs.writeFileSync(SECRET_FILE, generated + "\n");
  return generated;
}

async function main() {
  loadEnv();
  execSync("node kapso/scripts/bundle_on_odoo_task_lista.js", { cwd: ROOT, stdio: "inherit" });
  const code = fs.readFileSync(BUNDLE, "utf8");
  const fnId = await resolveOrCreate(code);
  console.log("function", fnId);

  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  let data = await waitDeployed(fnId);
  console.log("deployed", data.endpoint_url || fnId);

  const secret = resolveSecret();
  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  fs.writeFileSync(SECRET_FILE, secret + "\n");

  const secrets = {
    LIFE_ODOO_WEBHOOK_SECRET: secret,
    LIFE_TASK_LISTA_WEBHOOK_SECRET: secret,
    ODOO_URL: process.env.ODOO_LIFEDEPORTES_PROD_URL,
    ODOO_DB: process.env.ODOO_LIFEDEPORTES_PROD_DB,
    ODOO_USERNAME: process.env.ODOO_LIFEDEPORTES_PROD_USERNAME,
    ODOO_PASSWORD: process.env.ODOO_LIFEDEPORTES_PROD_PASSWORD,
    LIFE_DESIGN_PRODUCT_ID: process.env.LIFE_DESIGN_PRODUCT_ID || "504",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
    GEMINI_MODEL: process.env.GEMINI_MODEL || process.env.PRINT_QC_GEMINI_MODEL || "gemini-2.5-flash",
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
  data = await waitDeployed(fnId);

  const invokeUrl = `https://api.kapso.ai/platform/v1/functions/${fnId}/invoke`;
  fs.writeFileSync(path.join(ROOT, "scratch", "odoo_task_lista_invoke.txt"), invokeUrl + "\n");

  const invokeArg = process.argv.find((a) => a === "--invoke" || a.startsWith("--invoke="));
  if (invokeArg) {
    const payload = { task_id: 0, force: true };
    if (invokeArg.startsWith("--invoke=") && invokeArg.length > 9) {
      payload.task_id = Number(invokeArg.slice(9));
    }
    const res = await fetch(invokeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Life-Webhook-Secret": secret,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log("invoke", res.status, text.slice(0, 2000));
  }

  // registry hint
  const regPath = path.join(ROOT, "kapso", "service_registry.json");
  if (fs.existsSync(regPath)) {
    try {
      const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
      reg.order_detail = reg.order_detail || {};
      reg.order_detail.on_odoo_task_lista = {
        kapso_function_id: fnId,
        invoke_url: invokeUrl,
        name: FN_NAME,
      };
      fs.writeFileSync(regPath, JSON.stringify(reg, null, 2) + "\n");
      console.log("updated service_registry.json");
    } catch (e) {
      console.log("registry skip", e.message);
    }
  }

  console.log(
    JSON.stringify(
      {
        function_id: fnId,
        endpoint: invokeUrl,
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
