#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const FN = "a9b1d8c3-f87f-4b69-8c82-1b6688fb8818";

function loadEnv() {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
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

async function upsert(name, value) {
  const list = await kapso(`/platform/v1/functions/${FN}/secrets`);
  const names = (list.json?.data?.secrets || list.json?.data || []).map((s) => s.name || s);
  if (names.includes(name)) {
    await kapso(`/platform/v1/functions/${FN}/secrets/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
  }
  const c = await kapso(`/platform/v1/functions/${FN}/secrets`, {
    method: "POST",
    body: { secret: { name, value: String(value) } },
  });
  console.log(name, c.ok ? "ok" : c.status);
}

async function main() {
  loadEnv();
  await upsert("LIFE_CRM_WON_STAGE_ID", "3");
  await upsert("LIFE_CRM_LOST_STAGE_ID", "5");
  await kapso(`/platform/v1/functions/${FN}/deploy`, { method: "POST", body: {} });
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const g = await kapso(`/platform/v1/functions/${FN}`);
    const st = (g.json?.data?.data || g.json?.data || {}).status;
    console.log("status", st);
    if (st === "deployed" || st === "active") return;
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
