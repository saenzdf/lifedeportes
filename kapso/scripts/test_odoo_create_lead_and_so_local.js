#!/usr/bin/env node
/**
 * Local smoke test for odoo_create_lead_and_so against Odoo from .env.
 * Does NOT call Kapso — runs the Cloudflare handler in Node with fetch.
 *
 * Usage (from lifedeportes root):
 *   node kapso/scripts/test_odoo_create_lead_and_so_local.js
 *   node kapso/scripts/test_odoo_create_lead_and_so_local.js --dry-run
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..", "..");
const envPath = path.join(root, ".env");
const fnPath = path.join(__dirname, "..", "functions", "odoo_create_lead_and_so.js");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

function buildEnv(localEnv) {
  return {
    ODOO_URL: localEnv.ODOO_LIFEDEPORTES_URL || localEnv.ODOO_URL,
    ODOO_DB: localEnv.ODOO_LIFEDEPORTES_DB || localEnv.ODOO_DB,
    ODOO_USERNAME: localEnv.ODOO_LIFEDEPORTES_USERNAME || localEnv.ODOO_USERNAME,
    ODOO_PASSWORD: localEnv.ODOO_LIFEDEPORTES_PASSWORD || localEnv.ODOO_PASSWORD,
    LIFE_DESIGN_PRODUCT_ID: localEnv.LIFE_DESIGN_PRODUCT_ID,
  };
}

function loadHandler(source) {
  const handlerMatch = source.match(/async function handler[\s\S]*$/);
  if (!handlerMatch) throw new Error("handler not found in odoo_create_lead_and_so.js");
  const sandbox = {
    fetch,
    Response: class Response {
      constructor(body, init = {}) {
        this.body = body;
        this.status = init.status || 200;
        this.headers = new Map(Object.entries(init.headers || {}));
      }
      json() {
        return Promise.resolve(JSON.parse(this.body));
      }
    },
  };
  vm.runInNewContext(source.replace(handlerMatch[0], ""), sandbox);
  vm.runInNewContext(handlerMatch[0], sandbox);
  return sandbox.handler;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const localEnv = loadEnv(envPath);
  const env = buildEnv(localEnv);

  for (const key of ["ODOO_URL", "ODOO_DB", "ODOO_USERNAME", "ODOO_PASSWORD", "LIFE_DESIGN_PRODUCT_ID"]) {
    if (!env[key]) {
      console.error(`Missing ${key} in .env (LIFE_DESIGN_PRODUCT_ID must be product.product id)`);
      process.exit(1);
    }
  }

  const draftPayload = {
    schema_version: "quote_payload_v2",
    product_text: "",
    quantity: 6,
    unit_cop: 50000,
    total_cop: 300000,
    design_product_id: Number(env.LIFE_DESIGN_PRODUCT_ID),
    customer_display_name: "Test Local Cursor",
    customer_notes: "Pedido de prueba local — no producción",
    formal_quote_requested: true,
    rows: [
      {
        name: "Uniforme de Fútbol dry-fit",
        product_id: 10219,
        quantity: 6,
        unit_price: 50000,
        category: "uniforme",
        commercial_role: "base_uniform",
      },
    ],
  };

  console.log("Odoo target:", env.ODOO_URL, "| db:", env.ODOO_DB);
  console.log("design_product_id:", env.LIFE_DESIGN_PRODUCT_ID);

  if (dryRun) {
    console.log("DRY RUN — draft_payload:", JSON.stringify(draftPayload, null, 2));
    return;
  }

  const handler = loadHandler(fs.readFileSync(fnPath, "utf8"));
  const request = {
    json: async () => ({
      input: {
        draft_payload: draftPayload,
        customer_wa_id: "573009998877",
      },
      execution_context: {
        vars: {
          quote: { draft_payload: draftPayload },
          user: { wa_id: "573009998877", name: "Test Local Cursor" },
        },
      },
    }),
  };

  const response = await handler(request, env);
  const payload = await response.json();
  console.log("HTTP status:", response.status);
  console.log(JSON.stringify(payload, null, 2));

  if (payload.status !== "ready") {
    process.exitCode = 1;
    return;
  }

  console.log("\nOK — cotización creada:");
  console.log("  order:", payload.vars?.order?.name, `(id ${payload.vars?.order?.id})`);
  console.log("  lead id:", payload.vars?.lead?.id);
  console.log("  total:", payload.vars?.order?.amount_total);
  console.log("  pdf:", payload.vars?.order?.quote_pdf_url);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
