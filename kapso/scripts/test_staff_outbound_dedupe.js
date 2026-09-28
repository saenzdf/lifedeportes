#!/usr/bin/env node
/** Prueba local: último outbound staff + dedupe (sin enviar WA). */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

const src = fs.readFileSync(
  path.join(ROOT, "kapso/functions/lib/staff_outbound_dedupe.js"),
  "utf8"
);
const sandbox = { fetch, process, console };
const wrapped = src.replace(/^export\s+\{[\s\S]*?\};?\s*$/m, "");
vm = require("vm");
vm.createContext(sandbox);
vm.runInContext(`${wrapped}\nglobalThis.__dedupe = { fetchLastStaffOutbound, isDuplicateStaffOutbound, normalizeOutboundCompare };`, sandbox);

const { fetchLastStaffOutbound, isDuplicateStaffOutbound, normalizeOutboundCompare } =
  sandbox.__dedupe;

async function main() {
  const env = {
    KAPSO_API_KEY: process.env.KAPSO_API_KEY,
    KAPSO_API_BASE_URL: process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai",
    LIFE_STAFF_OUTBOUND_DEDUPE: "true",
  };
  const staff = process.argv[2] || "573103362484";
  const last = await fetchLastStaffOutbound(env, staff);
  console.log("staff", staff);
  console.log("last outbound:", last ? last.text.slice(0, 200) : "(none)");
  if (last?.text) {
    const dup = await isDuplicateStaffOutbound(env, staff, last.text);
    console.log("self-compare duplicate?", dup.duplicate, dup.reason);
    const diff = await isDuplicateStaffOutbound(env, staff, "mensaje totalmente distinto xyz");
    console.log("different text duplicate?", diff.duplicate, diff.reason);
  }
  console.log("normalize ok?", normalizeOutboundCompare("  Hola   mundo ") === "hola mundo");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
