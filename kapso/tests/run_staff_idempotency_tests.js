#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(__dirname, "../functions/odoo_create_lead_and_so.js"),
  "utf8"
);
const helpers = new Function(
  `${source}\nreturn { stableOrderFingerprint, buildOrderIdempotencyKey };`
)();

const vars = {
  user: { wa_id: "3000000047", role: "staff" },
  quote: { customer_display_name: "Equipo Norte" },
  order_draft: {
    attachments: [{ filename: "lista.xlsx", url: "https://example.test/lista.xlsx" }],
  },
};
const draft = {
  built_at: "2026-07-10T14:00:00.000Z",
  customer_display_name: "Equipo Norte",
};
const lines = [
  {
    odoo_product_id: 62,
    product_text: "Camiseta deportiva dry-fit",
    quantity: 10,
  },
];

const first = await helpers.buildOrderIdempotencyKey(
  vars,
  draft,
  lines,
  "2026-07-10T14:00:01.000Z"
);
const retry = await helpers.buildOrderIdempotencyKey(
  vars,
  draft,
  [...lines].reverse(),
  "2026-07-10T15:00:00.000Z"
);
const changed = await helpers.buildOrderIdempotencyKey(
  vars,
  draft,
  [{ ...lines[0], quantity: 11 }],
  "2026-07-10T15:00:00.000Z"
);

assert.match(first, /^KAPSO:[a-f0-9]{32}$/);
assert.equal(first, retry);
assert.notEqual(first, changed);
console.log("staff idempotency tests OK");
