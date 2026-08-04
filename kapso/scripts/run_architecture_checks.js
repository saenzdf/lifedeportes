#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const commands = [
  ["node", ["kapso/tests/run_product_match_tests.js"]],
  ["node", ["kapso/tests/run_odoo_shop_media_tests.js"]],
  ["node", ["kapso/tests/run_order_detail_tools_tests.js"]],
  ["node", ["kapso/tests/run_staff_function_tests.js"]],
  ["node", ["kapso/tests/run_staff_idempotency_tests.js"]],
  ["node", ["kapso/tests/run_learning_corpus_tests.js"]],
  ["node", ["kapso/scripts/test_order_commercial_rules.js"]],
  ["node", ["kapso/scripts/test_build_quote_payload_rules.js"]],
  ["node", ["kapso/scripts/evaluate_sales_golden.js"]],
  [
    "node",
    [
      "kapso/scripts/validate-graph-lifedeportes.js",
      "kapso/workflow_lifedeportes_sales_inbound_v10.json",
    ],
  ],
];

for (const [command, args] of commands) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("\nArchitecture checks passed.");
