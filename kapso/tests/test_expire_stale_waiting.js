#!/usr/bin/env node
/**
 * node kapso/tests/test_expire_stale_waiting.js
 */
const assert = require("assert");
const {
  classifyWaitingExec,
  unwrapExecutions,
  parseInvokeBody,
  isStaffStep,
  isCustomerWaitingStep,
  waitingAgeMs,
  VENDOR_STEP,
} = require("../functions/lib/expire_stale_waiting_logic.js");

const now = Date.parse("2026-08-25T20:00:00.000Z");
const ttlMs = 3 * 3600 * 1000;

function exec(over = {}) {
  return {
    id: "e1",
    status: "waiting",
    current_step: { identifier: VENDOR_STEP },
    last_event_at: "2026-08-25T16:00:00.000Z",
    started_at: "2026-08-25T10:00:00.000Z",
    ...over,
  };
}

let pass = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
  } catch (err) {
    console.error("FAIL", name, err.message);
    process.exitCode = 1;
  }
}

check("vendor stale → expire", () => {
  assert.strictEqual(classifyWaitingExec(exec(), { nowMs: now, ttlMs }), "expire");
});

check("quiet hours 20:00 Bogotá → skip_quiet_hours", () => {
  const night = Date.parse("2026-08-26T01:00:00.000Z"); // 20:00 Bogotá
  assert.strictEqual(classifyWaitingExec(exec(), { nowMs: night, ttlMs }), "skip_quiet_hours");
});

check("vendor 2h ago → skip_fresh", () => {
  const e = exec({ last_event_at: "2026-08-25T18:30:00.000Z" });
  assert.strictEqual(classifyWaitingExec(e, { nowMs: now, ttlMs }), "skip_fresh");
});

check("staff agent never expires", () => {
  const e = exec({
    current_step: { identifier: "agent_1780762885818" },
    last_event_at: "2026-08-20T00:00:00.000Z",
  });
  assert.strictEqual(classifyWaitingExec(e, { nowMs: now, ttlMs }), "skip_staff_step");
});

check("wait_staff_lane skipped", () => {
  const e = exec({ current_step: { identifier: "wait_staff_lane_1745500019050" } });
  assert.strictEqual(classifyWaitingExec(e, { nowMs: now, ttlMs }), "skip_staff_step");
});

check("Paola phone skipped even on vendor step", () => {
  assert.strictEqual(
    classifyWaitingExec(exec(), { nowMs: now, ttlMs, phone: "573213988464" }),
    "skip_staff_phone"
  );
});

check("wait_customer burst stale → expire", () => {
  const e = exec({ current_step: { identifier: "wait_customer_burst_1745500002580" } });
  assert.strictEqual(classifyWaitingExec(e, { nowMs: now, ttlMs }), "expire");
});

check("ended status skipped", () => {
  assert.strictEqual(
    classifyWaitingExec(exec({ status: "ended" }), { nowMs: now, ttlMs }),
    "skip_status"
  );
});

check("unknown step skipped", () => {
  const e = exec({ current_step: { identifier: "fn_classify_contact_odoo_1745500002550" } });
  assert.strictEqual(classifyWaitingExec(e, { nowMs: now, ttlMs }), "skip_other_step");
});

check("zombie waiting (no step) stale → expire", () => {
  const e = exec({ current_step: null });
  assert.strictEqual(classifyWaitingExec(e, { nowMs: now, ttlMs }), "expire");
});

check("missing timestamps → skip_fresh (do not expire)", () => {
  const e = exec({ last_event_at: null, updated_at: null, started_at: null });
  assert.strictEqual(classifyWaitingExec(e, { nowMs: now, ttlMs }), "skip_fresh");
  assert.strictEqual(waitingAgeMs(e, now), 0);
});

check("unwrap executions shapes", () => {
  assert.deepStrictEqual(unwrapExecutions({ data: { executions: [{ id: 1 }] } }), [{ id: 1 }]);
  assert.deepStrictEqual(unwrapExecutions({ data: [{ id: 2 }] }), [{ id: 2 }]);
  assert.deepStrictEqual(unwrapExecutions([{ id: 3 }]), [{ id: 3 }]);
});

check("parseInvokeBody dry_run + ttl", () => {
  const a = parseInvokeBody({ dry_run: true, ttl_hours: 4, max_end: 10 });
  assert.strictEqual(a.dryRun, true);
  assert.strictEqual(a.ttlHours, 4);
  assert.strictEqual(a.maxEnd, 10);
  const b = parseInvokeBody({ input: { dry_run: "yes" } });
  assert.strictEqual(b.dryRun, true);
});

check("step helpers", () => {
  assert.strictEqual(isStaffStep("wait_staff_burst_1745500019200"), true);
  assert.strictEqual(isCustomerWaitingStep(VENDOR_STEP), true);
  assert.strictEqual(isCustomerWaitingStep("agent_1780762885818"), false);
});

if (process.exitCode) {
  console.error("test_expire_stale_waiting failed");
  process.exit(1);
}
console.log(`test_expire_stale_waiting ok ${pass}`);
