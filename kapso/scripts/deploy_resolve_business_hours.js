#!/usr/bin/env node
/**
 * Patch + deploy resolve-business-hours.
 *
 *   node kapso/scripts/deploy_resolve_business_hours.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CODE = path.join(ROOT, "kapso/functions/resolve_business_hours.js");
const REGISTRY = path.join(ROOT, "kapso/service_registry.json");
const NAME = "resolve-business-hours";
const FN_ID = "979e5610-6848-4201-96ad-b46304413886";

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

async function waitDeployed(fnId) {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const g = await kapso(`/platform/v1/functions/${fnId}`);
    const data = g.json?.data?.data || g.json?.data || {};
    console.log("status", data.status);
    if (data.status === "deployed" || data.status === "active") return data.status;
    if (data.status === "error" && i > 4) return data.status;
  }
  return "timeout";
}

async function main() {
  loadEnv();
  let code = fs.readFileSync(CODE, "utf8");
  code = code.replace(/\nexport \{ handler \};\s*$/, "\n");
  const fnId =
    JSON.parse(fs.readFileSync(REGISTRY, "utf8"))?.functions?.resolve_business_hours?.kapso_function_id ||
    FN_ID;

  const patch = await kapso(`/platform/v1/functions/${fnId}`, {
    method: "PATCH",
    body: { function: { name: NAME, code } },
  });
  console.log("patch", patch.status, patch.ok);
  if (!patch.ok) {
    console.error(JSON.stringify(patch.json).slice(0, 800));
    process.exit(1);
  }

  const dep = await kapso(`/platform/v1/functions/${fnId}/deploy`, {
    method: "POST",
    body: {},
  });
  console.log("deploy", dep.status);
  const status = await waitDeployed(fnId);
  if (status !== "deployed" && status !== "active") {
    console.error("deploy_failed", status);
    process.exit(1);
  }
  console.log("function_id", fnId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
