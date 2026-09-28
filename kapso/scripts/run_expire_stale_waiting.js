#!/usr/bin/env node
/**
 * Invoke expire-stale-waiting (after deploy).
 *   node kapso/scripts/run_expire_stale_waiting.js [--dry-run] [--ttl-hours 3]
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const REGISTRY = path.join(ROOT, "kapso/service_registry.json");

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

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  loadEnv();
  const reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  const fnId = reg?.functions?.expire_stale_waiting?.kapso_function_id;
  if (!fnId) {
    console.error("missing function id — run deploy_expire_stale_waiting.js first");
    process.exit(1);
  }
  const dry = process.argv.includes("--dry-run");
  const ttlHours = Number(flag("ttl-hours", "3")) || 3;
  const base = (process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai").replace(/\/$/, "");
  const res = await fetch(`${base}/platform/v1/functions/${fnId}/invoke`, {
    method: "POST",
    headers: {
      "X-API-Key": process.env.KAPSO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ dry_run: dry, ttl_hours: ttlHours, max_end: 50 }),
  });
  const json = await res.json().catch(() => ({}));
  console.log(res.status, JSON.stringify(json, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
