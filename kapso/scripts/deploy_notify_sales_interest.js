#!/usr/bin/env node
/** One-shot: patch+deploy notify-sales-interest + CRM secrets */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const FN = "a2236fdc-8afa-40ab-a09f-d231c2b638cd";
const CODE = path.join(ROOT, "kapso/functions/notify_sales_interest_deploy.js");

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
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
  const base = (process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(
    /\/$/,
    ""
  );
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

async function upsertSecret(name, value) {
  if (!value) {
    console.log("skip secret", name);
    return;
  }
  const list = await kapso(`/platform/v1/functions/${FN}/secrets`);
  const names = (list.json?.data?.secrets || list.json?.data || []).map(
    (s) => s.name || s
  );
  if (names.includes(name)) {
    await kapso(
      `/platform/v1/functions/${FN}/secrets/${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );
  }
  const create = await kapso(`/platform/v1/functions/${FN}/secrets`, {
    method: "POST",
    body: { secret: { name, value: String(value) } },
  });
  console.log("secret", name, create.ok ? "ok" : create.status);
}

async function main() {
  loadEnv();
  const code = fs.readFileSync(CODE, "utf8");
  // keep notify.js in sync
  fs.writeFileSync(
    path.join(ROOT, "kapso/functions/notify_sales_interest.js"),
    code
  );

  const patch = await kapso(`/platform/v1/functions/${FN}`, {
    method: "PATCH",
    body: { function: { name: "notify-sales-interest", code } },
  });
  console.log("patch", patch.status, patch.ok);

  let dep = await kapso(`/platform/v1/functions/${FN}/deploy`, {
    method: "POST",
    body: {},
  });
  console.log("deploy", dep.status, JSON.stringify(dep.json).slice(0, 200));

  let status = "unknown";
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const g = await kapso(`/platform/v1/functions/${FN}`);
    const data = g.json?.data?.data || g.json?.data || {};
    status = data.status;
    console.log("status", status);
    if (status === "deployed" || status === "active") break;
    if (status === "error" && i > 4) break;
  }

  if (status !== "deployed" && status !== "active") {
    console.error("deploy_failed", status);
    process.exit(1);
  }

  await upsertSecret(
    "ODOO_URL",
    process.env.ODOO_LIFEDEPORTES_PROD_URL || process.env.ODOO_URL
  );
  await upsertSecret(
    "ODOO_DB",
    process.env.ODOO_LIFEDEPORTES_PROD_DB || "lifedeportes"
  );
  await upsertSecret(
    "ODOO_USERNAME",
    process.env.ODOO_LIFEDEPORTES_PROD_USERNAME
  );
  await upsertSecret(
    "ODOO_PASSWORD",
    process.env.ODOO_LIFEDEPORTES_PROD_PASSWORD
  );
  await upsertSecret("LIFE_CRM_SEED_ENABLED", "true");
  await upsertSecret("LIFE_CRM_DEFAULT_CLOSE_DAYS", "4");
  await upsertSecret("LIFE_CRM_SEED_STAGE_ID", "6");
  await upsertSecret("LIFE_CRM_WON_STAGE_ID", "3");
  await upsertSecret("LIFE_CRM_LOST_STAGE_ID", "5");

  // secrets require redeploy
  dep = await kapso(`/platform/v1/functions/${FN}/deploy`, {
    method: "POST",
    body: {},
  });
  console.log("redeploy_secrets", dep.status);
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const g = await kapso(`/platform/v1/functions/${FN}`);
    const data = g.json?.data?.data || g.json?.data || {};
    console.log("status", data.status);
    if (data.status === "deployed" || data.status === "active") {
      console.log("done");
      return;
    }
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
