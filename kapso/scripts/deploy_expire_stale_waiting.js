#!/usr/bin/env node
/**
 * Create (if needed) + deploy expire-stale-waiting.
 *
 *   node kapso/scripts/deploy_expire_stale_waiting.js
 *   node kapso/scripts/deploy_expire_stale_waiting.js --invoke --dry-run
 *   node kapso/scripts/run_expire_stale_waiting.js --dry-run
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const CODE = path.join(ROOT, "kapso/functions/expire_stale_waiting.js");
const REGISTRY = path.join(ROOT, "kapso/service_registry.json");
const NAME = "expire-stale-waiting";

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

function readRegistryId() {
  try {
    const reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
    return reg?.functions?.expire_stale_waiting?.kapso_function_id || null;
  } catch {
    return null;
  }
}

function writeRegistryId(id) {
  const reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  reg.functions = reg.functions || {};
  reg.functions.expire_stale_waiting = {
    kapso_function_name: NAME,
    kapso_function_id: id,
    local_path: "kapso/functions/expire_stale_waiting.js",
    note: "TTL 3h: waiting vendedor → ended. No toca staff. Cron/launchd cada 15 min.",
  };
  fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + "\n");
}

async function upsertSecret(fnId, name, value) {
  if (!value) {
    console.log("skip secret", name);
    return;
  }
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
  console.log("secret", name, create.ok ? "ok" : create.status);
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
  const args = new Set(process.argv.slice(2));
  const code = fs.readFileSync(CODE, "utf8");
  let fnId = readRegistryId();

  if (!fnId) {
    const created = await kapso(`/platform/v1/functions`, {
      method: "POST",
      body: {
        function: {
          name: NAME,
          description:
            "TTL waiting vendedor (3h silencio) → ended. Libera inbox. No toca staff.",
          code,
          function_type: "cloudflare_worker",
        },
      },
    });
    console.log("create", created.status, JSON.stringify(created.json).slice(0, 400));
    fnId =
      created.json?.data?.id ||
      created.json?.data?.data?.id ||
      created.json?.id ||
      null;
    if (!fnId) {
      console.error("create_failed");
      process.exit(1);
    }
    writeRegistryId(fnId);
  } else {
    const patch = await kapso(`/platform/v1/functions/${fnId}`, {
      method: "PATCH",
      body: { function: { name: NAME, code } },
    });
    console.log("patch", patch.status, patch.ok);
  }

  let dep = await kapso(`/platform/v1/functions/${fnId}/deploy`, {
    method: "POST",
    body: {},
  });
  console.log("deploy", dep.status);

  const status = await waitDeployed(fnId);
  if (status !== "deployed" && status !== "active") {
    console.error("deploy_failed", status);
    process.exit(1);
  }

  await upsertSecret(fnId, "KAPSO_API_KEY", process.env.KAPSO_API_KEY);
  await upsertSecret(
    fnId,
    "KAPSO_API_BASE_URL",
    process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai"
  );
  await upsertSecret(
    fnId,
    "LIFE_WORKFLOW_ID",
    "8995b14c-d852-4fb3-bceb-8a51a6ccc2c6"
  );
  await upsertSecret(fnId, "LIFE_WAITING_TTL_HOURS", "3");

  dep = await kapso(`/platform/v1/functions/${fnId}/deploy`, { method: "POST", body: {} });
  console.log("redeploy_secrets", dep.status);
  await waitDeployed(fnId);

  console.log("function_id", fnId);
  console.log("invoke", `https://api.kapso.ai/platform/v1/functions/${fnId}/invoke`);

  if (args.has("--invoke")) {
    const dry = args.has("--dry-run");
    const inv = await kapso(`/platform/v1/functions/${fnId}/invoke`, {
      method: "POST",
      body: { dry_run: dry, ttl_hours: 3, max_end: 50 },
    });
    console.log("invoke", inv.status, JSON.stringify(inv.json, null, 2).slice(0, 2500));
    if (!inv.ok) process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
