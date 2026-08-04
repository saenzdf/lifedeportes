#!/usr/bin/env node
/**
 * Deploy buscar-oportunidad-odoo + Odoo secrets.
 * Usage: node kapso/scripts/deploy_buscar_oportunidad_odoo.js [--invoke scratch/payload.json]
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const FN_NAME = "buscar-oportunidad-odoo";
const FN_ID_FILE = path.join(ROOT, "scratch", "buscar_oportunidad_odoo_function_id.txt");
const CODE_FILE = path.join(ROOT, "kapso", "functions", "buscar_oportunidad_odoo.js");

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
  if (!create.ok) throw new Error(`secret ${name}: ${create.status} ${JSON.stringify(create.json)}`);
}

async function waitDeployed(fnId) {
  for (let i = 0; i < 25; i++) {
    const g = await kapso(`/platform/v1/functions/${fnId}`);
    const data = g.json?.data?.data || g.json?.data || {};
    if (data.status === "deployed" || data.status === "active") return data;
    if (data.status === "error") throw new Error("deploy error");
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
  const code = fs.readFileSync(CODE_FILE, "utf8");

  let fnId = fs.existsSync(FN_ID_FILE) ? fs.readFileSync(FN_ID_FILE, "utf8").trim() : "";
  if (fnId) {
    const patch = await kapso(`/platform/v1/functions/${fnId}`, {
      method: "PATCH",
      body: { function: { name: FN_NAME, code } },
    });
    if (!patch.ok) fnId = "";
  }
  if (!fnId) {
    const list = await kapso(`/platform/v1/functions`);
    const hit = (list.json?.data || []).find((f) => f.name === FN_NAME);
    if (hit?.id) {
      fnId = hit.id;
      await kapso(`/platform/v1/functions/${fnId}`, {
        method: "PATCH",
        body: { function: { name: FN_NAME, code } },
      });
    } else {
      const created = await kapso(`/platform/v1/functions`, {
        method: "POST",
        body: {
          function: {
            name: FN_NAME,
            code,
            description: "Staff: buscar/retomar oportunidad CRM (Canal Ventas)",
          },
        },
      });
      if (!created.ok) throw new Error(JSON.stringify(created.json));
      fnId = created.json?.data?.id || created.json?.data?.data?.id;
    }
    fs.writeFileSync(FN_ID_FILE, fnId + "\n");
  }
  console.log("function_id", fnId);

  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  await waitDeployed(fnId);

  const secrets = {
    ODOO_URL: process.env.ODOO_LIFEDEPORTES_PROD_URL,
    ODOO_DB: process.env.ODOO_LIFEDEPORTES_PROD_DB,
    ODOO_USERNAME: process.env.ODOO_LIFEDEPORTES_PROD_USERNAME,
    ODOO_PASSWORD: process.env.ODOO_LIFEDEPORTES_PROD_PASSWORD,
  };
  for (const [k, v] of Object.entries(secrets)) {
    if (!v) continue;
    await upsertSecret(fnId, k, v);
    console.log("secret", k);
  }
  await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  await waitDeployed(fnId);

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
