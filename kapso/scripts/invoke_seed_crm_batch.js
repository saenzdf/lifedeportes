#!/usr/bin/env node
/**
 * Invoke seed-crm-awaiting for each payload in a JSON array.
 *
 *   node kapso/scripts/invoke_seed_crm_batch.js scratch/seed_crm_gap_2026-07-29_payloads.json
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const FN_ID_FILE = path.join(ROOT, "scratch", "seed_crm_awaiting_function_id.txt");

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

async function main() {
  loadEnv();
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node invoke_seed_crm_batch.js <payloads.json>");
    process.exit(1);
  }
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const payloads = JSON.parse(fs.readFileSync(abs, "utf8"));
  let fnId = fs.existsSync(FN_ID_FILE) ? fs.readFileSync(FN_ID_FILE, "utf8").trim() : "";
  if (!fnId) fnId = "a9b1d8c3-f87f-4b69-8c82-1b6688fb8818";

  const results = [];
  for (const p of payloads) {
    console.log("→", p.customer_name || p.phone);
    const inv = await kapso(`/platform/v1/functions/${fnId}/invoke`, {
      method: "POST",
      body: p,
    });
    const data = inv.json?.data || inv.json?.result || inv.json;
    console.log(" ", inv.status, JSON.stringify(data)?.slice(0, 400));
    results.push({ phone: p.phone, name: p.customer_name, status: inv.status, data });
  }
  const out = path.join(ROOT, "scratch", "seed_crm_gap_2026-07-29_results.json");
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log("wrote", out);
  if (results.some((r) => r.status >= 400 || r.data?.ok === false)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
