#!/usr/bin/env node
import { buildNominaDraftFromAttlog } from "../functions/lib/parse_attlog_dat.js";

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

const sample = `       15\t2026-06-01 06:18:30\t1\t0\t1\t0
        6\t2026-06-01 07:40:08\t1\t0\t1\t0
        6\t2026-06-01 16:34:30\t1\t0\t1\t0
       15\t2026-06-01 17:08:49\t1\t1\t1\t0
`;

const r = buildNominaDraftFromAttlog(sample, { filename: "test_attlog.dat" });
assert("mini sample ok", r.ok);
assert("2 empleadas", r.nomina_draft.employees.length === 2);

const yesicaDay = r.nomina_draft.employees.find((e) => e.pin === "6")?.days[0];
assert("Yesica ~8.9h", yesicaDay?.hours > 8 && yesicaDay?.hours < 9.5);
assert("Tatiana salida", r.nomina_draft.employees.find((e) => e.pin === "15")?.days[0]?.salida != null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
