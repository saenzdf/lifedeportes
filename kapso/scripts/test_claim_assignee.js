#!/usr/bin/env node
/* Prueba local de claimAssignee contra prod Odoo (sin enviar WA al staff). */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const envPath = path.join(__dirname, "..", "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const k = t.slice(0, i).trim();
  const v = t.slice(i + 1).trim();
  if (!(k in process.env)) process.env[k] = v;
}

const src = fs.readFileSync(path.join(__dirname, "..", "functions", "notify_sales_interest.js"), "utf8");

const start = src.indexOf("function realCustomerPhone");
const nextFn = src.indexOf("/**\n * Lee si la oportunidad", start);
if (start < 0 || nextFn < 0) { console.error("markers not found", start, nextFn); process.exit(1); }
let fnBody = src.slice(start, nextFn).replace(/\s+$/, "");

const env = {
  ODOO_URL: process.env.ODOO_LIFEDEPORTES_PROD_URL || process.env.ODOO_URL,
  ODOO_DB: process.env.ODOO_LIFEDEPORTES_PROD_DB || process.env.ODOO_DB,
  ODOO_USERNAME: process.env.ODOO_LIFEDEPORTES_PROD_USERNAME || process.env.ODOO_USERNAME,
  ODOO_PASSWORD: process.env.ODOO_LIFEDEPORTES_PROD_PASSWORD || process.env.ODOO_PASSWORD,
  LIFE_CRM_SEED_STAGE_ID: "6",
};

const sandbox = {
  env,
  console,
  fetch,
  Uint8Array,
  Date,
  Promise,
  compact: (v) => String(v ?? "").replace(/\s+/g, " ").trim(),
  digits: (v) => String(v ?? "").replace(/\D/g, ""),
  injectCrmConversationLinks: (desc) => desc,
  crmConversationLinksHtml: () => "",
};
vm.createContext(sandbox);
const claimFn = vm.runInContext(`(() => { ${fnBody}\n return claimAssignee; })()`, sandbox);

const TEST_CONV = "hermes-dedupe-test-" + Date.now();

(async () => {
  console.log("=== 1ra llamada: round-robin asignaria Paola (counter 0) ===");
  const r1 = await claimFn(env, {
    conversationId: TEST_CONV,
    customerName: "Hermes Prueba Dedupe",
    customerPhone: "573000000000",
    assigneePhone: "573213988464", // Paola
  });
  console.log("r1:", JSON.stringify(r1));

  console.log("=== 2da llamada: misma conv, round-robin intentaria Javier, PERO debe reutilizar Paola ===");
  const r2 = await claimFn(env, {
    conversationId: TEST_CONV,
    customerName: "Hermes Prueba Dedupe",
    customerPhone: "573000000000",
    assigneePhone: "573103362484", // Javier
  });
  console.log("r2:", JSON.stringify(r2));

  const ok = r1.phone === "573213988464" && r2.phone === "573213988464" && r2.reused === true;
  console.log(ok ? "\n✅ DEDUPE OK: la 2da llamada reutilizo Paola, NO fue a Javier" : "\n❌ FALLO: no reutilizo el assignee");
  console.log("test_lead_id:", r1.lead_id, "conv:", TEST_CONV);
  process.exit(ok ? 0 : 1);
})();
