#!/usr/bin/env node
/**
 * Crea SO borrador PRESEAS #14 en Odoo prod desde draft Kapso (ejecución 70ab1f72).
 * Partner PRESEAS (2617) · Proyecto Paola · sin teléfono staff.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const envPath = path.join(root, ".env");
const fnPath = path.join(__dirname, "..", "functions", "odoo_create_lead_and_so.js");
const draftPath = path.join(root, "scratch", "preseas", "draft_payload.json");

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

function loadHandler(source) {
  const handlerMatch = source.match(/async function handler[\s\S]*$/);
  if (!handlerMatch) throw new Error("handler not found");
  const sandbox = {
    fetch,
    Response: class Response {
      constructor(body, init = {}) {
        this.body = body;
        this.status = init.status || 200;
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

const localEnv = loadEnv(envPath);
const env = {
  ODOO_URL: localEnv.ODOO_LIFEDEPORTES_PROD_URL,
  ODOO_DB: localEnv.ODOO_LIFEDEPORTES_PROD_DB,
  ODOO_USERNAME: localEnv.ODOO_LIFEDEPORTES_PROD_USERNAME,
  ODOO_PASSWORD: localEnv.ODOO_LIFEDEPORTES_PROD_PASSWORD,
  LIFE_DESIGN_PRODUCT_ID: "504",
};

const draftPayload = JSON.parse(fs.readFileSync(draftPath, "utf8"));

// Partner PRESEAS · product.product ids prod (no template ids)
draftPayload.customer_display_name = "PRESEAS";
draftPayload.order_or_team_name_for_billing = "PRESEAS 14";
draftPayload.customer_wa_id = "";
draftPayload.design_product_id = 504;
draftPayload.formal_quote_requested = true;
draftPayload.rows = [
  {
    name: "Uniforme de Fútbol (Medias Semiprofesionales)",
    category: "uniforme",
    quantity: 8,
    price_unit: 50000,
    product_id: 11155,
    unit_price: 50000,
    product_text: "Uniforme de Fútbol",
    commercial_role: "base_uniform",
  },
  {
    name: "Chaqueta Rompevientos (Con forro)",
    category: "otros",
    quantity: 4,
    price_unit: 65000,
    product_id: 11740,
    unit_price: 65000,
    product_text: "Chaqueta Rompevientos",
    commercial_role: "extra",
  },
  {
    name: "Camiseta deportiva dry-fit (Corta)",
    category: "camiseta",
    quantity: 3,
    price_unit: 30000,
    product_id: 11788,
    unit_price: 30000,
    product_text: "Camiseta deportiva dry-fit",
    commercial_role: "extra",
  },
];

const handler = loadHandler(fs.readFileSync(fnPath, "utf8"));

const response = await handler(
  {
    json: async () => ({
      input: { draft_payload: draftPayload },
      execution_context: {
        vars: {
          quote: { draft_payload: draftPayload, customer_display_name: "PRESEAS" },
          user: {
            role: "staff",
            wa_id: "573213988464",
            name: "Paola",
            odoo_project_id: 9,
            odoo_project_name: "Proyecto Paola",
          },
        },
      },
    }),
  },
  env
);

const payload = await response.json();
console.log(JSON.stringify(payload, null, 2));
if (payload.status !== "ready") process.exit(1);
console.log("\nOK —", payload.vars?.order?.name, "id", payload.vars?.order?.id);
