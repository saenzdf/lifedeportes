#!/usr/bin/env node
/**
 * node kapso/tests/test_send_windows.js
 */
const assert = require("assert");
const {
  customerSendOk,
  staffNotifyOk,
  nextCustomerSendHint,
  nextStaffNotifyHint,
  bogotaParts,
} = require("../functions/lib/send_windows.js");

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

// Colombia UTC−5, sin DST.
// Wed 2026-06-03 06:00 Bogotá = 11:00 UTC
const wed06 = new Date("2026-06-03T11:00:00.000Z");
const wed0559 = new Date("2026-06-03T10:59:00.000Z");
const wed2159 = new Date("2026-06-04T02:59:00.000Z");
const wed22 = new Date("2026-06-04T03:00:00.000Z");
const wed19 = new Date("2026-06-04T00:00:00.000Z");
const wed08 = new Date("2026-06-03T13:00:00.000Z");
const wed18 = new Date("2026-06-03T23:00:00.000Z");
const sat10 = new Date("2026-06-06T15:00:00.000Z");
const sat2159 = new Date("2026-06-07T02:59:00.000Z");
const sun10 = new Date("2026-06-07T15:00:00.000Z");

check("bogota 06:00 is 6am", () => {
  assert.strictEqual(bogotaParts(wed06).hour, 6);
});

check("customer 5:59 no", () => assert.strictEqual(customerSendOk(wed0559), false));
check("customer 6:00 yes", () => assert.strictEqual(customerSendOk(wed06), true));
check("customer 19:00 yes (ventana hasta 22)", () => assert.strictEqual(customerSendOk(wed19), true));
check("customer 21:59 yes", () => assert.strictEqual(customerSendOk(wed2159), true));
check("customer 22:00 no", () => assert.strictEqual(customerSendOk(wed22), false));
check("customer Sunday 10am yes", () => assert.strictEqual(customerSendOk(sun10), true));
check("customer Saturday 21:59 yes", () => assert.strictEqual(customerSendOk(sat2159), true));

check("staff 6:00 no (antes de 8)", () => assert.strictEqual(staffNotifyOk(wed06), false));
check("staff 8:00 yes", () => assert.strictEqual(staffNotifyOk(wed08), true));
check("staff 18:00 no", () => assert.strictEqual(staffNotifyOk(wed18), false));
check("staff Saturday 10am yes", () => assert.strictEqual(staffNotifyOk(sat10), true));
check("staff Sunday 10am no", () => assert.strictEqual(staffNotifyOk(sun10), false));

check("hint after 22:00", () => {
  assert.strictEqual(nextCustomerSendHint(wed22), "mañana 6:00 a.m.");
});
check("hint before 6:00", () => {
  assert.strictEqual(nextCustomerSendHint(wed0559), "hoy 6:00 a.m.");
});
check("staff hint Sunday", () => {
  assert.strictEqual(nextStaffNotifyHint(sun10), "lunes 8:00 a.m.");
});

if (process.exitCode) process.exit(1);
console.log(`test_send_windows ok ${pass}`);
