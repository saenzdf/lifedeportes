#!/usr/bin/env node
import { resolveBusinessHours, bogotaParts } from "../functions/lib/business_hours.js";

let passed = 0;
let failed = 0;

function assert(name, cond) {
  if (cond) {
    console.log("✓", name);
    passed++;
  } else {
    console.log("✗", name);
    failed++;
  }
}

// Wed 2026-06-03 10:00 Bogota = 15:00 UTC
const wed10 = new Date("2026-06-03T15:00:00.000Z");
assert("miércoles 10am in_hours", resolveBusinessHours(wed10).business_mode === "in_hours");

// Wed 18:00 Bogota = 23:00 UTC
const wed18 = new Date("2026-06-03T23:00:00.000Z");
assert("miércoles 6pm off_hours", resolveBusinessHours(wed18).business_mode === "off_hours");

// Sat 10:00 Bogota = 15:00 UTC
const sat10 = new Date("2026-06-06T15:00:00.000Z");
assert("sábado 10am in_hours", resolveBusinessHours(sat10).business_mode === "in_hours");

// Sat 15:00 Bogota = 20:00 UTC
const sat15 = new Date("2026-06-06T20:00:00.000Z");
assert("sábado 3pm off_hours", resolveBusinessHours(sat15).business_mode === "off_hours");

// Sun
const sun = new Date("2026-06-07T15:00:00.000Z");
assert("domingo off_hours", resolveBusinessHours(sun).business_hours === false);

const parts = bogotaParts(wed10);
assert("bogota weekday", parts.weekday === "Tuesday" || parts.weekday === "Wednesday");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
