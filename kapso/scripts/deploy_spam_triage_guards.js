#!/usr/bin/env node
/**
 * Patch + deploy policy-guard-input and route-customer-burst-resume (spam triage).
 *
 *   node kapso/scripts/deploy_spam_triage_guards.js
 *   node kapso/scripts/deploy_spam_triage_guards.js --only policy
 *   node kapso/scripts/deploy_spam_triage_guards.js --only burst
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const REGISTRY = path.join(ROOT, "kapso/service_registry.json");

const TARGETS = {
  policy: {
    name: "policy-guard-input",
    codePath: path.join(ROOT, "kapso/functions/policy_guard_input.js"),
    registryKey: "policy_guard_input",
    fallbackId: "3800675c-b32c-46c4-b896-2a885f58421c",
  },
  burst: {
    name: "route-customer-burst-resume",
    codePath: path.join(ROOT, "kapso/functions/route_customer_burst_resume.js"),
    registryKey: "route_customer_burst_resume",
    fallbackId: "972d60bb-ff84-40fc-ba3d-cdd6104aa143",
  },
  endquiet: {
    name: "end-quiet-customer",
    codePath: path.join(ROOT, "kapso/functions/end_quiet_customer.js"),
    registryKey: "end_quiet_customer",
    fallbackId: "1e5ef42f-cd56-4555-a103-26c0be8fdbc2",
  },
};

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

async function deployOne(key) {
  const t = TARGETS[key];
  const reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  const fnId = reg?.functions?.[t.registryKey]?.kapso_function_id || t.fallbackId;
  let code = fs.readFileSync(t.codePath, "utf8");
  code = code.replace(/\nexport \{ handler \};\s*$/, "\n");

  console.log(`\n=== ${t.name} (${fnId}) ===`);
  const patch = await kapso(`/platform/v1/functions/${fnId}`, {
    method: "PATCH",
    body: { function: { name: t.name, code } },
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
  console.log("ok", t.name, fnId);
}

async function main() {
  loadEnv();
  if (!process.env.KAPSO_API_KEY) {
    console.error("missing KAPSO_API_KEY");
    process.exit(1);
  }
  const only = process.argv.includes("--only")
    ? process.argv[process.argv.indexOf("--only") + 1]
    : null;
  const keys = only ? [only] : ["policy", "burst", "endquiet"];
  for (const k of keys) {
    if (!TARGETS[k]) {
      console.error("unknown target", k, "use policy|burst|endquiet");
      process.exit(1);
    }
    await deployOne(k);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
