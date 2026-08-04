#!/usr/bin/env node
/**
 * Smoke tests for build_quote_payload commercial validation.
 * Usage: node kapso/scripts/test_build_quote_payload_rules.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const filePath = path.join(__dirname, "..", "functions", "build_quote_payload.js");
const source = fs.readFileSync(filePath, "utf8");
const handlerMatch = source.match(/async function handler[\s\S]*$/);
if (!handlerMatch) {
  console.error("handler not found");
  process.exit(1);
}

const sandbox = {
  Response: class Response {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status || 200;
    }
    json() {
      return JSON.parse(this.body);
    }
  },
};
vm.runInNewContext(source.replace(handlerMatch[0], ""), sandbox);
vm.runInNewContext(handlerMatch[0], sandbox);

async function runCase(name, input) {
  const request = {
    json: async () => ({ input, execution_context: { vars: {} } }),
  };
  const response = await sandbox.handler(request, {});
  const payload = await response.json();
  return { name, status: payload.status, code: payload.vars?.quote?.commercial_validation?.code || null };
}

(async () => {
  const cases = [
    ["6 uniformes", { product_text: "Uniforme de Fútbol dry-fit", quantity: 6 }, "ready", null],
    [
      "6 uniformes + camiseta",
      {
        product_text: "Uniforme de Fútbol dry-fit",
        quantity: 6,
        extra_lines: [{ product_text: "Camiseta deportiva dry-fit", quantity: 1 }],
      },
      "ready",
      null,
    ],
    [
      "1 camiseta",
      { product_text: "Camiseta deportiva dry-fit", quantity: 1 },
      "blocked",
      "STANDALONE_BELOW_MINIMUM",
    ],
    ["6 camisetas", { product_text: "Camiseta deportiva dry-fit", quantity: 6 }, "ready", null],
    ["4 uniformes", { product_text: "Uniforme de Fútbol dry-fit", quantity: 4 }, "blocked", "BASE_BELOW_MINIMUM"],
  ];

  for (const [name, input, expectedStatus, expectedCode] of cases) {
    const result = await runCase(name, input);
    const pass = result.status === expectedStatus && result.code === expectedCode;
    if (!pass) {
      console.error("FAIL", name, result);
      process.exitCode = 1;
    } else {
      console.log("OK", name);
    }
  }

  if (!process.exitCode) {
    console.log("All build_quote_payload smoke tests passed.");
  }
})();
