#!/usr/bin/env node
/**
 * Unit tests for order commercial rules.
 * Usage: node kapso/scripts/test_order_commercial_rules.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rulesPath = path.join(
  __dirname,
  "..",
  "functions",
  "_archive",
  "order_commercial_rules.js"
);
const rulesSource = fs.readFileSync(rulesPath, "utf8");
const sandbox = {};
vm.runInNewContext(rulesSource, sandbox);

const { validateCommercialOrder } = sandbox;

function assertCase(name, lines, expected) {
  const result = validateCommercialOrder({ lines });
  const pass = result.ok === expected.ok && result.code === expected.code;
  if (!pass) {
    console.error(`FAIL ${name}`, { expected, got: result });
    process.exitCode = 1;
    return;
  }
  console.log(`OK ${name}`);
}

assertCase("6 uniformes", [{ category: "uniforme", name: "Uniforme de fútbol", quantity: 6 }], {
  ok: true,
  code: null,
});

assertCase(
  "6 uniformes + camiseta extra",
  [
    { category: "uniforme", name: "Uniforme de fútbol", quantity: 6 },
    { category: "camiseta", name: "Camiseta deportiva manga corta dry fit", quantity: 1 },
  ],
  { ok: true, code: null }
);

assertCase(
  "6 uniformes + bandera",
  [
    { category: "uniforme", name: "Uniforme de fútbol", quantity: 6 },
    { category: "otros", name: "Banderas, 1.10 X 1.50", quantity: 1 },
  ],
  { ok: true, code: null }
);

assertCase(
  "1 camiseta sola",
  [{ category: "camiseta", name: "Camiseta deportiva manga corta dry fit", quantity: 1 }],
  { ok: false, code: "STANDALONE_BELOW_MINIMUM" }
);

assertCase(
  "6 camisetas solas",
  [{ category: "camiseta", name: "Camiseta deportiva manga corta dry fit", quantity: 6 }],
  { ok: true, code: null }
);

assertCase(
  "1 bandera sola",
  [{ category: "otros", name: "Banderas, 1.10 X 1.50", quantity: 1 }],
  { ok: false, code: "STANDALONE_BELOW_MINIMUM" }
);

assertCase(
  "4 uniformes",
  [{ category: "uniforme", name: "Uniforme de fútbol", quantity: 4 }],
  { ok: false, code: "BASE_BELOW_MINIMUM" }
);

if (!process.exitCode) {
  console.log("All commercial rule tests passed.");
}
