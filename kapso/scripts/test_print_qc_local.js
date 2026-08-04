#!/usr/bin/env node
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const { spawnSync } = require("child_process");

/** Dynamic import() inside vm requires Node's experimental VM modules hook. */
function ensureExperimentalVmModules() {
  const hasFlag =
    process.execArgv.some((a) => a === "--experimental-vm-modules") ||
    String(process.env.NODE_OPTIONS || "").includes("experimental-vm-modules");
  if (hasFlag) return;
  const r = spawnSync(process.execPath, ["--experimental-vm-modules", __filename, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(r.status === null ? 1 : r.status);
}

function loadDotEnvIfPresent() {
  const envPath = path.resolve(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) return;
  const txt = fs.readFileSync(envPath, "utf8");
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }

  // Mirror `life deportes/lifedeportes/.envrc` so local dev matches direnv + MCP.
  process.env.ODOO_URL = process.env.ODOO_URL || process.env.ODOO_LIFEDEPORTES_URL || "";
  process.env.ODOO_DB = process.env.ODOO_DB || process.env.ODOO_LIFEDEPORTES_DB || "";
  process.env.ODOO_USERNAME = process.env.ODOO_USERNAME || process.env.ODOO_LIFEDEPORTES_USERNAME || "";
  process.env.ODOO_PASSWORD = process.env.ODOO_PASSWORD || process.env.ODOO_LIFEDEPORTES_PASSWORD || "";
}

function requireEnv(name) {
  const v = String(process.env[name] || "").trim();
  if (!v) {
    throw new Error(`Missing env var: ${name}`);
  }
  return v;
}

function parseTaskIds(argv) {
  if (argv.length === 0) return [1798, 1716];
  const ids = argv
    .join(",")
    .split(",")
    .map((s) => Number(String(s).trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) {
    throw new Error("No valid task ids provided. Example: 1798,1716");
  }
  return ids;
}

async function loadHandler() {
  const sourcePath = path.resolve(__dirname, "../functions/print_qc_webhook_odoo.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const wrapped = `${source}\n;globalThis.__printQcHandler = handler;`;
  const script = new vm.Script(wrapped, {
    filename: sourcePath,
    importModuleDynamically(specifier) {
      return import(specifier);
    },
  });
  script.runInThisContext();
  if (typeof globalThis.__printQcHandler !== "function") {
    throw new Error("Could not load print_qc handler");
  }
  return globalThis.__printQcHandler;
}

async function runTask(handler, env, taskId) {
  const req = new Request("http://localhost/print-qc-local", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-LD-QC-Signature": env.LD_PRINT_QC_WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      task_id: taskId,
      event: "approval_requested",
      debug: true,
    }),
  });

  const resp = await handler(req, env);
  const text = await resp.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (_e) {
    parsed = { raw: text };
  }
  return { status: resp.status, body: parsed };
}

async function main() {
  ensureExperimentalVmModules();
  loadDotEnvIfPresent();
  const taskIds = parseTaskIds(process.argv.slice(2));
  const localSecret = String(process.env.LD_PRINT_QC_WEBHOOK_SECRET || "").trim() || "local-dev-secret";
  const env = {
    ODOO_URL: requireEnv("ODOO_URL"),
    ODOO_DB: requireEnv("ODOO_DB"),
    ODOO_USERNAME: requireEnv("ODOO_USERNAME"),
    ODOO_PASSWORD: requireEnv("ODOO_PASSWORD"),
    LD_PRINT_QC_WEBHOOK_SECRET: localSecret,
    PRINT_QC_AI_EXTRACTOR_URL: String(process.env.PRINT_QC_AI_EXTRACTOR_URL || "").trim(),
    PRINT_QC_AI_EXTRACTOR_TOKEN: String(process.env.PRINT_QC_AI_EXTRACTOR_TOKEN || "").trim(),
  };

  const handler = await loadHandler();
  const summary = [];
  for (const taskId of taskIds) {
    const result = await runTask(handler, env, taskId);
    summary.push({ task_id: taskId, ...result });
  }
  console.log(JSON.stringify({ ok: true, results: summary }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }, null, 2));
  process.exit(1);
});
