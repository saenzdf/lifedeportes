#!/usr/bin/env node
/** Tests: inferencia de estimado desde lista / conversación. */
import assert from "assert";
import {
  inferOrderEstimate,
  applyEstimateToResolvedLines,
  parseConversationEstimateForTests,
} from "../functions/lib/infer_order_estimate.js";
import { buildResolvedLine } from "../functions/lib/staff_order_contract.js";

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log("ok:", name);
  } catch (err) {
    failed += 1;
    console.error("FAIL:", name, err.message);
  }
}

check("conversation: 20 uniformes", () => {
  const p = parseConversationEstimateForTests("estimado 20 uniformes de futbol");
  assert.equal(p.quantity, 20);
  assert.equal(p.category, "uniforme");
});

check("conversation: 7 camisetas", () => {
  const p = parseConversationEstimateForTests("son 7 camisetas dry-fit");
  assert.equal(p.quantity, 7);
  assert.equal(p.category, "camiseta");
});

check("list_detail wins over commercial qty 1", () => {
  const est = inferOrderEstimate({
    order_draft: {
      commercial: {
        resolved_lines: [
          { product_text: "Camiseta deportiva dry-fit", quantity: 1, category: "camiseta" },
        ],
      },
      detail: {
        rows: Array.from({ length: 7 }, () => ({
          nombre: "X",
          camiseta: true,
          product_text: "Camiseta deportiva dry-fit",
        })),
      },
    },
  });
  assert.equal(est.quantity, 7);
  assert.equal(est.source, "list_detail_bump");
});

check("applyEstimate creates line from conversation", () => {
  const { resolved_lines, estimate, changed } = applyEstimateToResolvedLines(
    {
      quote: { customer_display_name: "CLUB" },
      intent: { raw_text: "15 uniformes de baloncesto" },
    },
    [],
    buildResolvedLine
  );
  assert.equal(changed, true);
  assert.equal(estimate.quantity, 15);
  assert.equal(resolved_lines[0].quantity, 15);
  assert.match(resolved_lines[0].product_text, /baloncesto/i);
});

check("applyEstimate bumps single line", () => {
  const existing = [
    buildResolvedLine({
      product_text: "Camiseta deportiva dry-fit",
      quantity: 1,
      category: "camiseta",
      product_variant_id: 62,
      confidence: "high",
    }),
  ];
  const { resolved_lines, changed } = applyEstimateToResolvedLines(
    {
      order_draft: {
        commercial: { resolved_lines: existing },
        detail: {
          rows: Array.from({ length: 7 }, () => ({ nombre: "A", camiseta: true })),
        },
      },
    },
    existing,
    buildResolvedLine
  );
  assert.equal(changed, true);
  assert.equal(resolved_lines[0].quantity, 7);
  assert.equal(resolved_lines[0].product_variant_id, 62);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall ok");
