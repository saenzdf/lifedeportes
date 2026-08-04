/**
 * Quick local test for compute_fidelity_retention logic (no Kapso invoke).
 * Run: node kapso/scripts/test_fidelity_kpi.js
 */
const assert = require("assert");
const {
  computeFidelityRetention,
  buildKapsoSnapshot,
} = require("../functions/lib/fidelity_kpi.js");

const snapshot = buildKapsoSnapshot({
  quote: { product_text: "Uniforme de Fútbol", quantity: 10, customer_wa_id: "573001112233" },
  order_draft: {
    commercial: {
      resolved_lines: [
        {
          product_variant_id: 115,
          product_text: "Uniforme de Fútbol",
          quantity: 10,
          unit_cop: 50000,
          attributes: { manga: "corta" },
        },
      ],
    },
    write: { fingerprint: "abc" },
  },
  staff: { upload_source: "inbox_silent" },
});

const clean = computeFidelityRetention(snapshot, snapshot.resolved_lines);
assert.strictEqual(clean.pass_clean, true);
assert.ok(clean.retention_pct >= 99);

const changed = computeFidelityRetention(snapshot, [
  { product_variant_id: 115, product_text: "Uniforme de Fútbol", quantity: 12, attributes: { manga: "corta" } },
]);
assert.strictEqual(changed.pass_clean, false);
assert.ok(changed.retention_pct < 100);
assert.ok(changed.lines_changed >= 1);

console.log(
  JSON.stringify(
    { ok: true, clean_retention: clean.retention_pct, changed_retention: changed.retention_pct },
    null,
    2
  )
);
