#!/usr/bin/env node
/**
 * Deploy on-contact-shared (webhook WhatsApp contacts → wa.me al asesor).
 *
 *   node kapso/scripts/deploy_on_contact_shared.js
 *
 * Crea/actualiza la function con public_endpoint=true, despliega, setea secrets
 * (KAPSO_API_KEY, ODOO_*, STAFF_PHONES, LIFE_WEBHOOK_SECRET), y registra la
 * invoke_url en service_registry.json + docs/contact_shared_function_id.json.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "..");
const FN_NAME = "on-contact-shared";
const FN_ID_FILE = path.join(ROOT, "scratch", "on_contact_shared_function_id.txt");
const SECRET_FILE = path.join(ROOT, "scratch", "contact_shared_webhook_secret.txt");
const SRC = path.join(ROOT, "kapso", "functions", "on_contact_shared.js");
const REG = path.join(ROOT, "kapso", "service_registry.json");
const IDS = path.join(ROOT, "kapso", "docs", "contact_shared_function_id.json");

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

function buildCode() {
  return fs.readFileSync(SRC, "utf8").replace(/\nexport \{ handler \};\s*$/, "\n");
}

function resolveSecret() {
  if (process.env.LIFE_WEBHOOK_SECRET) return process.env.LIFE_WEBHOOK_SECRET;
  if (process.env.LIFE_WA_TEMPLATE_WEBHOOK_SECRET) return process.env.LIFE_WA_TEMPLATE_WEBHOOK_SECRET;
  if (fs.existsSync(SECRET_FILE)) {
    const s = fs.readFileSync(SECRET_FILE, "utf8").trim();
    if (s) return s;
  }
  const generated = crypto.randomBytes(24).toString("hex");
  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  fs.writeFileSync(SECRET_FILE, generated + "\n");
  return generated;
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
}

async function resolveOrCreate(code) {
  if (fs.existsSync(FN_ID_FILE)) {
    const id = fs.readFileSync(FN_ID_FILE, "utf8").trim();
    if (id) {
      const patch = await kapso(`/platform/v1/functions/${id}`, {
        method: "PATCH",
        body: {
          function: {
            name: FN_NAME,
            code,
            public_endpoint: true,
            description:
              "Webhook WhatsApp contacts: captura el número compartido y envía wa.me al asesor asignado",
          },
        },
      });
      if (patch.ok) return id;
    }
  }
  const list = await kapso(`/platform/v1/functions`);
  const hit = (list.json?.data || []).find((f) => f.name === FN_NAME);
  if (hit?.id) {
    await kapso(`/platform/v1/functions/${hit.id}`, {
      method: "PATCH",
      body: { function: { name: FN_NAME, code, public_endpoint: true } },
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
        public_endpoint: true,
        description:
          "Webhook WhatsApp contacts: captura el número compartido y envía wa.me al asesor asignado",
      },
    },
  });
  if (!created.ok) {
    throw new Error(`create: ${created.status} ${JSON.stringify(created.json)}`);
  }
  const id = created.json?.data?.id || created.json?.data?.data?.id;
  if (!id) throw new Error("no function id");
  fs.writeFileSync(FN_ID_FILE, id + "\n");
  return id;
}

async function waitDeployed(fnId) {
  for (let i = 0; i < 30; i++) {
    const g = await kapso(`/platform/v1/functions/${fnId}`);
    const data = g.json?.data?.data || g.json?.data || {};
    console.log("status", data.status, "public", data.public_endpoint);
    if (data.status === "deployed" || data.status === "active") return data;
    if (data.status === "error" || data.status === "failed") {
      throw new Error("deploy error: " + JSON.stringify(data).slice(0, 500));
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("deploy timeout");
}

async function main() {
  loadEnv();
  const code = buildCode();
  const secret = resolveSecret();
  const fnId = await resolveOrCreate(code);
  console.log("function_id", fnId);

  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  const data = await waitDeployed(fnId);

  const secrets = {
    KAPSO_API_KEY: process.env.KAPSO_API_KEY,
    KAPSO_PHONE_NUMBER_ID:
      process.env.KAPSO_PHONE_NUMBER_ID ||
      process.env.LIFE_WHATSAPP_PHONE_NUMBER_ID ||
      "1095603153637786",
    ODOO_URL: process.env.ODOO_LIFEDEPORTES_PROD_URL || process.env.ODOO_URL,
    ODOO_DB: process.env.ODOO_LIFEDEPORTES_PROD_DB || "lifedeportes",
    ODOO_USERNAME: process.env.ODOO_LIFEDEPORTES_PROD_USERNAME,
    ODOO_PASSWORD: process.env.ODOO_LIFEDEPORTES_PROD_PASSWORD,
    STAFF_PHONES: process.env.LIFE_SALES_NOTIFY_PHONES || "573213988464,573103362484",
    LIFE_WEBHOOK_SECRET: secret,
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
  await waitDeployed(fnId);

  const invokeUrl =
    data.endpoint_url ||
    `https://api.kapso.ai/platform/v1/functions/${fnId}/invoke`;

  const reg = JSON.parse(fs.readFileSync(REG, "utf8"));
  reg.functions = reg.functions || {};
  reg.functions.on_contact_shared = {
    kapso_function_name: FN_NAME,
    kapso_function_id: fnId,
    local_path: "kapso/functions/on_contact_shared.js",
    public_endpoint: true,
    invoke_url: invokeUrl,
    note: "Webhook WhatsApp contacts → wa.me al asesor asignado",
  };
  fs.writeFileSync(REG, JSON.stringify(reg, null, 2) + "\n");

  fs.mkdirSync(path.dirname(IDS), { recursive: true });
  fs.writeFileSync(IDS, JSON.stringify({ on_contact_shared: fnId, invoke_url: invokeUrl }, null, 2) + "\n");

  console.log("DONE", FN_NAME, fnId);
  console.log("invoke_url", invokeUrl);
  console.log("secret_file", SECRET_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
