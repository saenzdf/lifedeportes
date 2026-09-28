#!/usr/bin/env node
/**
 * set_jev_mode.js — Configura LIFE_JEV_MODE en una o todas las funciones de Kapso.
 *
 * Uso:
 *   node kapso/scripts/set_jev_mode.js --function burst --mode on
 *   node kapso/scripts/set_jev_mode.js --function search --mode on
 *   node kapso/scripts/set_jev_mode.js --function notify --mode on
 *   node kapso/scripts/set_jev_mode.js --all --mode on
 */

const fs = require("fs");
const path = require("path");

const candidates = [
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../../../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env")
];

for (const envPath of candidates) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
    if (process.env.KAPSO_API_KEY) break;
  }
}

const base = process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai";
const apiKey = process.env.KAPSO_API_KEY;
const openrouterKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  console.error("Falta KAPSO_API_KEY");
  process.exit(1);
}

const FUNCTIONS = {
  burst: { id: "972d60bb-ff84-40fc-ba3d-cdd6104aa143", name: "route-customer-burst-resume" },
  search: { id: "4503ca5c-7114-4442-bada-112be3ddf67e", name: "odoo-search-product-price" },
  notify: { id: "a2236fdc-8afa-40ab-a09f-d231c2b638cd", name: "notify-sales-interest" },
  classify_media: { id: "8d383baa-305a-4ada-9ec4-f8db69736ebb", name: "clasificar-adjuntos-pedido" },
  interpret: { id: "e9ee8299-bcf7-4a3d-9dd9-5dd23118a015", name: "interpret-quote-intent" },
  guard: { id: "3800675c-b32c-46c4-b896-2a885f58421c", name: "policy-guard-input" },
};

async function kapso(pathname, options = {}) {
  const url = `${base}${pathname}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(options.headers || {}),
        },
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text };
      }
      return { ok: res.ok, status: res.status, json };
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function upsertSecret(fnId, name, value) {
  if (!value) return;
  const list = await kapso(`/platform/v1/functions/${fnId}/secrets`);
  const names = (list.json?.data?.secrets || []).map((s) => s.name || s);
  if (names.includes(name)) {
    await kapso(`/platform/v1/functions/${fnId}/secrets/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
  }
  const create = await kapso(`/platform/v1/functions/${fnId}/secrets`, {
    method: "POST",
    body: JSON.stringify({ secret: { name, value: String(value) } }),
  });
  console.log(`  secret ${name}=${value} → ${create.ok ? "ok" : create.status}`);
}

async function deployFunction(fnId, fnName) {
  console.log(`Desplegando ${fnName} (${fnId})...`);
  const dep = await kapso(`/platform/v1/functions/${fnId}/deploy`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  console.log(`  deploy status: ${dep.status}`);

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const g = await kapso(`/platform/v1/functions/${fnId}`);
    const status = g.json?.data?.data?.status || g.json?.data?.status;
    process.stdout.write(`.`);
    if (status === "deployed" || status === "active") {
      console.log(`\n  ✅ ${fnName} quedó en estado: ${status}`);
      return true;
    }
  }
  console.log(`\n  ⚠️ Timeout esperando despliegue de ${fnName}`);
  return false;
}

async function setModeOnFunction(targetKey, mode) {
  const fn = FUNCTIONS[targetKey];
  if (!fn) {
    console.error(`Función desconocida: ${targetKey}. Opciones: ${Object.keys(FUNCTIONS).join(", ")}`);
    return;
  }

  console.log(`\nConfigurando ${fn.name} con LIFE_JEV_MODE="${mode}"...`);
  if (openrouterKey) {
    await upsertSecret(fn.id, "OPENROUTER_API_KEY", openrouterKey);
  }
  await upsertSecret(fn.id, "LIFE_JEV_MODE", mode);
  await upsertSecret(fn.id, "LIFE_JEV_THRESHOLD", "0.7");

  await deployFunction(fn.id, fn.name);
}

async function main() {
  const argv = process.argv.slice(2);
  const modeIdx = argv.indexOf("--mode");
  const mode = modeIdx >= 0 ? argv[modeIdx + 1] : "on";

  if (argv.includes("--all")) {
    for (const k of Object.keys(FUNCTIONS)) {
      await setModeOnFunction(k, mode);
    }
  } else {
    const fnIdx = argv.indexOf("--function");
    const fnKey = fnIdx >= 0 ? argv[fnIdx + 1] : "burst";
    await setModeOnFunction(fnKey, mode);
  }
}

main().catch(console.error);
